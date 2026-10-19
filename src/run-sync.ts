import dotenv from "dotenv";
import { DeyeClient } from "./client/DeyeClient.js";
import { ResidentialSyncService } from "./services/residentialSyncService.js";

dotenv.config();

async function main() {
  console.log(`\n======================================================`);
  console.log(`⏱️ DSEos Residential Dashboard 15-Minute Sync Analysis`);
  console.log(`📁 Reference: DSenergize/client/src/components/residentialDashboard/v2`);
  console.log(`======================================================\n`);

  const client = new DeyeClient();
  const service = new ResidentialSyncService(client);

  console.log(`--- [1] 15-Minute Polling Call Budget by Fleet Size ---`);
  [1, 10, 20, 50, 100, 500].forEach((size) => {
    const budget = service.calculateCallBudget(size, 1);
    console.log(
      `🏡 Fleet Size: ${String(size).padStart(3, " ")} homes -> ${String(budget.callsPer15Min).padStart(2, " ")} API calls every 15 min | ${String(budget.callsPerHour).padStart(3, " ")} calls/hr | ${budget.callsPerDay} calls/day`
    );
  });

  console.log(`\n--- [2] Detailed Breakdown for Sector Fleet (20 Homes) ---`);
  const sectorBudget = service.calculateCallBudget(20, 1);
  console.table(
    sectorBudget.breakdown.map((b) => ({
      Endpoint: b.endpoint,
      Method: b.method,
      Calls: b.callsCount,
      BatchSize: b.batchSize,
      Interval: b.cachedInterval,
      Payload: b.payloadSizeEstimate,
    }))
  );

  console.log(`\n--- [3] Executing 15-Minute Sync Simulation ---`);
  const syncResult = await service.execute15MinSync();

  console.log(`\nSync completed! Ingested DSEos Residential Telemetry:`);
  console.log(`- Sector: ${syncResult.dseOsData.sector}`);
  console.log(`- Active Unit: ${syncResult.dseOsData.liveSite.unitName} (${syncResult.dseOsData.liveSite.connectionStatus})`);
  console.log(`- Solar Output: ${syncResult.dseOsData.inverterStatus.currentOutputKw} kW (Peak: ${syncResult.dseOsData.inverterStatus.peakKw} kW)`);
  console.log(`- Today Generation: ${syncResult.dseOsData.energyGeneration.todayTotalKwh} kWh`);
  console.log(`- Battery: ${syncResult.dseOsData.battery.socPercent}% SOC (${syncResult.dseOsData.battery.currentStorageKwh} / ${syncResult.dseOsData.battery.totalCapacityKwh} kWh)`);
  console.log(`- Efficiency: ${syncResult.dseOsData.systemEfficiency.efficiencyPercent}% (${syncResult.dseOsData.systemEfficiency.status})`);
  console.log(`- Panel Temp: ${syncResult.dseOsData.panelTemperature.temperatureCelsius}°C`);
  console.log(`- Fleet Health: ${syncResult.dseOsData.fleetPerformance.healthy} Healthy, ${syncResult.dseOsData.fleetPerformance.warning} Warning, ${syncResult.dseOsData.fleetPerformance.offline} Offline`);

  console.log(`\nAPI Execution Latencies:`);
  syncResult.apiResponses.forEach((r) => {
    console.log(`  ${r.endpoint.padEnd(35, " ")}: ${r.durationMs}ms [${r.success ? "SUCCESS" : "FALLBACK/FAILED"}]`);
  });
}

main().catch((err) => {
  console.error("Sync execution failed:", err);
  process.exit(1);
});
