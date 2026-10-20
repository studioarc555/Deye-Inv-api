import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { DeyeClient } from "./client/DeyeClient.js";
import { ENDPOINT_REGISTRY } from "./testing/endpointRegistry.js";
import { DeyeTestRunner } from "./testing/testRunner.js";
import { ResidentialSyncService } from "./services/residentialSyncService.js";
import { DashboardOverviewService } from "./services/dashboardOverviewService.js";
import { ResidentialMongoService } from "./services/residentialMongoService.js";
import { connectMongo, getMongoConfig } from "./db/mongoClient.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

/**
 * Root service status (Headless / Barebone API)
 */
app.get("/", (req, res) => {
  res.json({
    service: "Deye Inverter Telemetry & Ingestion API",
    status: "online",
    version: "1.0.0",
    architecture: "Barebone Headless Node.js (Raspberry Pi & Server Ready)",
    database: "MongoDB Atlas (myDatabase.ResidentialAPI)",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "GET /api/health",
      dbStatus: "GET /api/residential/db-status",
      allStationPackets: "GET /api/residential/packets",
      singleStationPacket: "GET /api/residential/packets/:stationId",
      sync15MinPackets: "POST /api/residential/sync-packets",
      syncSingleStation: "POST /api/residential/sync-packets/:stationId",
      dashboardOverview: "GET /api/residential/dashboard/overview?plantId=:id&date=YYYY-MM-DD",
      dashboardData: "GET /api/residential/dashboard/data?plantId=:id&date=YYYY-MM-DD",
    },
  });
});

// Global DeyeClient instance
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

let testRunner = new DeyeTestRunner(client);
let syncService = new ResidentialSyncService(client);
let overviewService = new DashboardOverviewService(client);
let mongoService = new ResidentialMongoService(client);

// =========================================================================
// API Routes
// =========================================================================

/**
 * Health check & configuration status
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
    defaultStationId: process.env.DEFAULT_STATION_ID || "",
    defaultDeviceSn: process.env.DEFAULT_DEVICE_SN || "",
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

  // Re-instantiate runner & services
  testRunner = new DeyeTestRunner(client);
  syncService = new ResidentialSyncService(client);
  overviewService = new DashboardOverviewService(client);
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

/**
 * List all available Deye OpenAPI endpoints
 */
app.get("/api/endpoints", (req, res) => {
  const categories: Record<string, any[]> = {};

  ENDPOINT_REGISTRY.forEach((ep) => {
    if (!categories[ep.category]) {
      categories[ep.category] = [];
    }
    categories[ep.category].push({
      id: ep.id,
      method: ep.method,
      path: ep.path,
      summary: ep.summary,
      description: ep.description,
      isReadOnly: ep.isReadOnly,
      requiresAuth: ep.requiresAuth,
    });
  });

  res.json({
    totalCount: ENDPOINT_REGISTRY.length,
    categories,
  });
});

/**
 * Test a single endpoint by ID
 */
app.post("/api/test/single", async (req, res) => {
  try {
    const { endpointId, customPayload } = req.body;
    if (!endpointId) {
      return res.status(400).json({ error: "endpointId is required" });
    }

    const result = await testRunner.testEndpoint(endpointId, customPayload);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Run test suite (read-only, category, or full)
 */
app.post("/api/test/suite", async (req, res) => {
  try {
    const { readOnlyOnly = true, category, endpointIds } = req.body;
    const summary = await testRunner.runSuite({
      readOnlyOnly,
      category,
      endpointIds,
    });
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Calculate 15-minute call budget for DSEos Residential Dashboard
 */
app.get("/api/residential/budget", (req, res) => {
  const fleetSize = parseInt(req.query.fleetSize as string, 10) || 20;
  const activeSelected = parseInt(req.query.activeUnits as string, 10) || 1;
  const budget = syncService.calculateCallBudget(fleetSize, activeSelected);
  res.json(budget);
});

/**
 * Execute live 15-minute residential sync against Deye API
 */
app.post("/api/residential/sync", async (req, res) => {
  try {
    const { stationId, deviceSn } = req.body;
    const result = await syncService.execute15MinSync(stationId, deviceSn);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Consolidated Residential Dashboard Overview Endpoint
 * Query Params:
 *  - plantId: string / number (e.g. "13474" or "NFC")
 *  - date: string (ISO/Date "YYYY-MM-DD")
 *  - period: "M" | "Y" | "T" (Month, Year, Lifetime)
 */
app.get("/api/residential/dashboard/overview", async (req, res) => {
  try {
    const plantId = (req.query.plantId as string) || process.env.DEFAULT_STATION_ID || "13474";
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const period = ((req.query.period as string)?.toUpperCase() as "M" | "Y" | "T") || "M";

    const overview = await overviewService.getOverview({
      plantId,
      date,
      period,
    });

    res.json(overview);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch dashboard overview",
    });

  }
});

// =========================================================================
// MongoDB Integration Routes (Database: myDatabase, Collection: ResidentialAPI)
// =========================================================================

app.get("/api/residential/dashboard/data", async (req, res) => {
  try {
    const plantId = req.query.plantId as string | undefined;
    const date = req.query.date as string | undefined;
    const plantName = req.query.plantName as string | undefined;
    const dashboardData = await mongoService.getDashboardData(plantId, date, plantName);

    if (!dashboardData) {
      return res.status(404).json({
        success: false,
        error: "No persisted residential dashboard packet was found.",
      });

    }

    return res.json({
      success: true,
      source: "mongodb",
      requestedPlantId: plantId || null,
      resolvedStationId: dashboardData.packet.stationId,
      ...dashboardData,
    });

  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch persisted dashboard data",
    });
  }
});

app.get("/api/residential/plants", async (_req, res) => {
  try {
    res.json({
      success: true,
      source: "mongodb",
      plants: await mongoService.getResidentialPlants(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch residential plants" });
  }
});

/**
 * Check MongoDB Connection Status & Collection Stats
 */
app.get("/api/residential/db-status", async (req, res) => {
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
        stationId: p.stationId,
        stationName: p.stationName,
        deviceSn: p.deviceSn,
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
 * Execute 15-Minute Sync Cycle for all stations (or a single dynamic station):
 * Pulls all 5-minute data points for each station and performs an atomic upsert:
 *   - Packet 1: First Station (Station ID, Device SN, DTM, Production, Active Power, etc.)
 *   - Packet 2: Second Station (Station ID, Device SN, DTM, Production, Active Power, etc.)
 * 
 * Endpoints:
 *   POST /api/residential/sync-packets
 *   POST /api/residential/sync-packets/:stationId
 */
app.post(["/api/residential/sync-packets/:stationId?", "/api/residential/sync-15min/:stationId?"], async (req, res) => {
  try {
    const targetStationId = (req.params as any).stationId || (req.query.stationId as string);
    const date = (req.query.date as string) || req.body.date || new Date().toISOString().slice(0, 10);
    const includeRaw = req.query.includeRaw === "true" || req.body.includeRaw === true;
    const plantId = (req.query.plantId as string) || req.body.plantId;

    if (targetStationId) {
      // Sync single dynamic station
      const singleRes = await mongoService.pullAndSaveStationPacket(String(targetStationId), 1, { date, includeRaw, plantId });
      return res.json({
        message: `Successfully executed 5-minute telemetry sync and atomic upsert for station ${targetStationId}`,
        database: "myDatabase",
        collection: "ResidentialAPI",
        ...singleRes,
      });
    }

    // Sync all stations (Packet 1 = First Station, Packet 2 = Second Station...)
    const fullRes = await mongoService.execute15MinPacketSync({ date, includeRaw });
    res.json({
      message: `Completed 15-minute synchronization cycle for all stations into MongoDB (myDatabase.ResidentialAPI)`,
      database: "myDatabase",
      collection: "ResidentialAPI",
      ...fullRes,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to execute 15-minute packet sync",
    });
  }
});

/**
 * Retrieve saved station packets directly from MongoDB (ResidentialAPI)
 * Examples:
 *   GET /api/residential/packets           (Returns all station packets: Packet 1, Packet 2...)
 *   GET /api/residential/packets/:stationId (Returns packet for specific station)
 */
app.get("/api/residential/packets/:stationId?", async (req, res) => {
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
});

// Start Express Server
const server = app.listen(PORT, async () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Deye Cloud OpenAPI Testing & Residential Telemetry Service`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🌐 Base Deye Server: ${client.baseUrl}`);
  console.log(`🔑 App ID: ${client.appId}`);
  console.log(`🍃 Target Database: myDatabase | Collection: ResidentialAPI`);
  console.log(`=============================================================\n`);

  // Initialize 15-minute automated sync timer
  const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
  if (process.env.AUTO_SYNC_ENABLED !== "false") {
    console.log(`⏱️ [Scheduler] 15-minute automated sync is ENABLED.`);

    // Run first sync and legacy cleanup 5 seconds after startup
    setTimeout(async () => {
      console.log(`⏱️ [Scheduler] Running initial 15-minute Deye packet sync...`);
      try {
        await mongoService.purgeLegacyPacketNameField();
        const initSync = await mongoService.execute15MinPacketSync();
        console.log(`✅ [Scheduler] Initial sync complete: ${initSync.syncedPackets}/${initSync.totalStations} station packets saved to MongoDB.`);
      } catch (e: any) {
        console.warn(`⚠️ [Scheduler] Initial sync notice:`, e.message);
      }
    }, 5000);

    // Recurring interval every 15 minutes
    setInterval(async () => {
      console.log(`\n⏱️ [Scheduler] Executing 15-minute Deye packet sync cycle...`);
      try {
        const syncCycle = await mongoService.execute15MinPacketSync();
        console.log(`✅ [Scheduler] Sync cycle complete: ${syncCycle.syncedPackets}/${syncCycle.totalStations} station packets updated in ${syncCycle.durationMs}ms.`);
      } catch (err: any) {
        console.error(`❌ [Scheduler] 15-minute sync error:`, err.message);
      }
    }, FIFTEEN_MINUTES_MS);
  }
});
