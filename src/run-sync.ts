import dotenv from "dotenv";
import { DeyeClient } from "./client/DeyeClient.js";
import { ResidentialMongoService } from "./services/residentialMongoService.js";
import { connectMongo, closeMongo } from "./db/mongoClient.js";

dotenv.config();

async function main() {
  console.log(`\n======================================================`);
  console.log(`📡 Deye Cloud OpenAPI -> MongoDB Telemetry Sync`);
  console.log(`🍃 Database: myDatabase | Collection: ResidentialAPI`);
  console.log(`======================================================\n`);

  await connectMongo();

  const client = new DeyeClient();
  const mongoService = new ResidentialMongoService(client);

  console.log("⏱️ Executing telemetry sync cycle for all stations...");
  const result = await mongoService.execute15MinPacketSync();

  console.log(`\n✅ Sync Completed in ${result.durationMs}ms:`);
  console.log(`• Total Stations Found: ${result.totalStations}`);
  console.log(`• Synced Packets:       ${result.syncedPackets}`);
  console.log(`• Timestamp:            ${result.syncTimestamp}\n`);

  console.table(
    result.packets.map((p) => ({
      "Station ID": p.stationId,
      "Station Name": p.stationName,
      "Device SN": p.deviceSn,
      "5-min Points": p.pointsCount,
      Action: p.action,
      "Active Power": `${p.activePowerKw} kW`,
      Duration: `${p.durationMs}ms`,
    }))
  );

  await closeMongo();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Sync execution failed:", err);
  await closeMongo().catch(() => {});
  process.exit(1);
});
