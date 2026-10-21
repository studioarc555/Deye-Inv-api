import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { DeyeClient } from "./client/DeyeClient.js";
import { ResidentialMongoService } from "./services/residentialMongoService.js";
import { connectMongo, getMongoConfig } from "./db/mongoClient.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Global DeyeClient & MongoService instance
let client = new DeyeClient({
  baseUrl: process.env.DEYE_BASE_URL,
  appId: process.env.DEYE_APP_ID,
  appSecret: process.env.DEYE_APP_SECRET,
  email: process.env.DEYE_EMAIL,
  username: process.env.DEYE_USERNAME,
  password: process.env.DEYE_PASSWORD,
  companyId: process.env.DEYE_COMPANY_ID,
  token: process.env.DEYE_TOKEN,
});

let mongoService = new ResidentialMongoService(client);

// =========================================================================
// Root & Documentation
// =========================================================================

/**
 * Root service status (Barebone Telemetry Ingestion API)
 */
app.get("/", (req, res) => {
  res.json({
    service: "Deye Cloud OpenAPI to MongoDB Telemetry Ingestion API",
    status: "online",
    version: "2.0.0",
    architecture: "Barebone Headless Ingestion Engine (Raspberry Pi & Linux Server Ready)",
    database: "MongoDB Atlas (myDatabase.ResidentialAPI)",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "GET /api/health",
      liveStations: "GET /api/stations",
      dbStatus: "GET /api/db-status",
      syncAllStations: "POST /api/sync",
      syncSingleStation: "POST /api/sync/:stationId",
      savedPackets: "GET /api/packets?date=YYYY-MM-DD",
      singleStationPacket: "GET /api/packets/:stationId?date=YYYY-MM-DD",
    },
  });
});

// =========================================================================
// Health, Config & Discovery Routes
// =========================================================================

/**
 * Health check & Deye configuration status
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    baseUrl: client.baseUrl,
    appId: client.appId,
    hasAppSecret: Boolean(client.appSecret),
    hasToken: Boolean(client.token),
    email: client.email,
  });
});

/**
 * Query live station list directly from Deye Cloud OpenAPI
 */
app.get("/api/stations", async (req, res) => {
  try {
    const listRes = await client.getStationList(1, 100);
    res.json({
      success: listRes.success,
      totalStations: listRes.data?.total || listRes.data?.stationList?.length || 0,
      stations: listRes.data?.stationList || [],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get current configuration
 */
app.get("/api/config", (req, res) => {
  res.json({
    baseUrl: client.baseUrl,
    appId: client.appId,
    appSecretMasked: client.appSecret ? "******" + client.appSecret.slice(-4) : "",
    email: client.email || "",
    username: client.username || "",
    companyId: client.companyId || "0",
    hasPassword: Boolean(client.password),
    tokenMasked: client.token ? "Bearer ******" + client.token.slice(-6) : "",
  });
});

/**
 * Update configuration live
 */
app.post("/api/config", (req, res) => {
  const { baseUrl, appId, appSecret, email, username, password, companyId, token } = req.body;

  if (baseUrl) client.baseUrl = baseUrl.replace(/\/+$/, "");
  if (appId) client.appId = appId;
  if (appSecret !== undefined) client.appSecret = appSecret;
  if (email !== undefined) client.email = email;
  if (username !== undefined) client.username = username;
  if (password) client.password = password;
  if (companyId !== undefined) client.companyId = companyId;
  if (token !== undefined) client.setToken(token);

  // Re-instantiate mongo service
  mongoService = new ResidentialMongoService(client);

  res.json({
    success: true,
    message: "Deye client configuration updated successfully",
    config: {
      baseUrl: client.baseUrl,
      appId: client.appId,
      email: client.email,
      hasToken: Boolean(client.token),
    },
  });
});

// =========================================================================
// MongoDB Integration & Telemetry Sync Routes
// =========================================================================

/**
 * Check MongoDB Connection Status & Collection Stats
 */
app.get(["/api/db-status", "/api/residential/db-status"], async (req, res) => {
  try {
    const config = getMongoConfig();
    const db = await connectMongo();
    const collection = db.collection(config.collectionName);
    const count = await collection.countDocuments();
    const packets = await mongoService.getAllSavedPackets();

    res.json({
      success: true,
      status: "connected",
      database: config.dbName,
      collection: config.collectionName,
      totalDocuments: count,
      savedStationsCount: packets.length,
      stationsSummary: packets.map((p: any) => ({
        plantId: p.plantId,
        stationId: p.stationId,
        stationName: p.stationName,
        deviceSn: p.deviceSn,
        date: p.date,
        pointsCount: p.dtm?.length || 0,
        realTimeActivePower: p.latestTelemetry?.realTimeActivePower,
        realTimeActivePowerUnit: p.latestTelemetry?.realTimeActivePowerUnit || "kW",
        dailyProduction: p.latestTelemetry?.dailyProduction,
        dailyProductionUnit: p.latestTelemetry?.dailyProductionUnit || "kWh",
        units: p.units,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      status: "disconnected",
      error: err.message,
      recommendation: "Ensure MONGODB_URI in .env is valid and reachable.",
    });
  }
});


/**
 * Ingest telemetry from Deye Cloud and atomically save/upsert to MongoDB:
 * - If stationId is provided: syncs that specific station.
 * - If stationId is omitted: dynamically discovers all stations and syncs all of them.
 *
 * Endpoints:
 *   POST /api/sync
 *   POST /api/sync/:stationId
 *   POST /api/residential/sync-packets
 *   POST /api/residential/sync-packets/:stationId
 */
app.post(
  [
    "/api/sync/:stationId?",
    "/api/residential/sync-packets/:stationId?",
    "/api/residential/sync-15min/:stationId?",
  ],
  async (req, res) => {
    try {
      const targetStationId = (req.params as any).stationId || (req.query.stationId as string);
      const date = (req.query.date as string) || req.body.date || new Date().toISOString().slice(0, 10);
      const includeRaw = req.query.includeRaw === "true" || req.body.includeRaw === true;
      const plantId = (req.query.plantId as string) || req.body.plantId;

      if (targetStationId) {
        // Sync single dynamic station
        const singleRes = await mongoService.pullAndSaveStationPacket(String(targetStationId), 1, {
          date,
          includeRaw,
          plantId,
        });
        return res.json({
          message: `Successfully executed telemetry sync and atomic upsert for station ${targetStationId}`,
          database: "myDatabase",
          collection: "ResidentialAPI",
          ...singleRes,
        });
      }

      // Sync all stations under the account
      const fullRes = await mongoService.execute15MinPacketSync({ date, includeRaw });
      res.json({
        message: `Completed synchronization cycle for all stations into MongoDB (myDatabase.ResidentialAPI)`,
        database: "myDatabase",
        collection: "ResidentialAPI",
        ...fullRes,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || "Failed to execute telemetry packet sync",
      });
    }
  }
);

/**
 * Retrieve saved station packets directly from MongoDB (myDatabase.ResidentialAPI)
 * Examples:
 *   GET /api/packets                      (All station packets)
 *   GET /api/packets/:stationId           (Packet for specific station)
 *   GET /api/packets?date=YYYY-MM-DD      (Filtered by date)
 */
app.get(
  ["/api/packets/:stationId?", "/api/residential/packets/:stationId?"],
  async (req, res) => {
    try {
      const stationId = (req.params as any).stationId;
      const date = req.query.date as string;

      if (stationId) {
        const packet = await mongoService.getSavedPacket(stationId, date);
        if (!packet) {
          return res.status(404).json({
            success: false,
            message: `No saved packet found in MongoDB (myDatabase.ResidentialAPI) for station ID: ${stationId}`,
          });
        }
        return res.json({
          success: true,
          database: "myDatabase",
          collection: "ResidentialAPI",
          packet,
        });
      }

      const packets = await mongoService.getAllSavedPackets(date);
      res.json({
        success: true,
        database: "myDatabase",
        collection: "ResidentialAPI",
        totalPackets: packets.length,
        packets,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }
);

// =========================================================================
// Start Express Server & Automated Background Ingestion Engine
// =========================================================================

const server = app.listen(PORT, async () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Deye Cloud OpenAPI Telemetry Ingestion Service`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🌐 Base Deye Server: ${client.baseUrl}`);
  console.log(`🔑 App ID: ${client.appId}`);
  console.log(`🍃 Target Database: myDatabase | Collection: ResidentialAPI`);
  console.log(`=============================================================\n`);

  // Initialize 15-minute automated sync timer
  const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
  if (process.env.AUTO_SYNC_ENABLED !== "false") {
    console.log(`⏱️ [Scheduler] 15-minute automated sync is ENABLED.`);

    // Run first sync 5 seconds after startup
    setTimeout(async () => {
      console.log(`⏱️ [Scheduler] Running initial Deye packet sync for all stations...`);
      try {
        await mongoService.purgeLegacyPacketNameField();
        const initSync = await mongoService.execute15MinPacketSync();
        console.log(
          `✅ [Scheduler] Initial sync complete: ${initSync.syncedPackets}/${initSync.totalStations} station packets saved to MongoDB.`
        );
      } catch (e: any) {
        console.warn(`⚠️ [Scheduler] Initial sync notice:`, e.message);
      }
    }, 5000);

    // Recurring interval every 15 minutes
    setInterval(async () => {
      console.log(`\n⏱️ [Scheduler] Executing 15-minute Deye packet sync cycle...`);
      try {
        const syncCycle = await mongoService.execute15MinPacketSync();
        console.log(
          `✅ [Scheduler] Sync cycle complete: ${syncCycle.syncedPackets}/${syncCycle.totalStations} station packets updated in ${syncCycle.durationMs}ms.`
        );
      } catch (err: any) {
        console.error(`❌ [Scheduler] 15-minute sync error:`, err.message);
      }
    }, FIFTEEN_MINUTES_MS);
  }
});

export { app, server };
