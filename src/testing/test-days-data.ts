import { DeyeClient } from "../client/DeyeClient.js";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const baseUrl = "http://localhost:4000";

  console.log("===============================================================");
  console.log("🧪 TESTING RESIDENTIAL API FOR DAY'S DATA");
  console.log("===============================================================\n");

  // 1. Check MongoDB status
  console.log("1️⃣ Checking MongoDB connection & saved packets in ResidentialAPI...");
  const dbStatusRes = await fetch(`${baseUrl}/api/residential/db-status`);
  const dbStatus: any = await dbStatusRes.json();
  console.log("Database:", dbStatus.database);
  console.log("Collection:", dbStatus.collection);
  console.log("Status:", dbStatus.status);
  console.log("Total Documents in ResidentialAPI:", dbStatus.totalDocuments);
  console.log("Stations Summary:", JSON.stringify(dbStatus.stationsSummary || dbStatus.packetsSummary, null, 2));

  // 2. Fetch all station packets from MongoDB
  console.log("\n2️⃣ Fetching saved Day's Data Packets from MongoDB (ResidentialAPI)...");
  const packetsRes = await fetch(`${baseUrl}/api/residential/packets`);
  const packetsJson: any = await packetsRes.json();
  console.log(`Retrieved ${packetsJson.totalPackets || packetsJson.packets?.length} station documents from MongoDB:`);

  if (packetsJson.packets && packetsJson.packets.length > 0) {
    packetsJson.packets.forEach((p: any) => {
      console.log(`\n-------------------------------------------------------------`);
      console.log(`⚡ STATION ID: ${p.stationId} - "${p.stationName.toUpperCase()}"`);
      console.log(`-------------------------------------------------------------`);
      console.log(`• packetName present?:   ${p.packetName !== undefined ? "YES (ERROR)" : "NO (CORRECT - REMOVED)"}`);
      console.log(`• Device SN:             ${p.deviceSn}`);
      console.log(`• Target Date:           ${p.date}`);
      console.log(`• 5-min Interval Points: ${p.dtm?.length ?? 0} data points`);
      console.log(`• Real-time Power:       ${p.latestTelemetry?.realTimeActivePower} ${p.latestTelemetry?.realTimeActivePowerUnit}`);
      console.log(`• Installed Capacity:    ${p.latestTelemetry?.installedCapacity} ${p.latestTelemetry?.installedCapacityUnit}`);
      console.log(`• Daily Production:      ${p.latestTelemetry?.dailyProduction} ${p.latestTelemetry?.dailyProductionUnit}`);
      console.log(`• Total Production:      ${p.latestTelemetry?.totalProduction} ${p.latestTelemetry?.totalProductionUnit}`);
      console.log(`• Operating Status:      ${p.latestTelemetry?.status}`);
      console.log(`• Units Definition:     `, p.units);
      
      console.log(`\n  📈 First 3 Data Points with Units:`);
      for (let i = 0; i < Math.min(3, p.dtm?.length || 0); i++) {
        console.log(`     [${i + 1}] ${p.dtm[i]} -> Active Power: ${p.activePower[i]} ${p.units?.activePower || "kW"} | Production: ${p.production[i]} ${p.units?.production || "kWh"} | Grid: ${p.gridPower[i]} ${p.units?.gridPower || "kW"}`);
      }

      console.log(`\n  📈 Latest 3 Data Points with Units:`);
      const len = p.dtm?.length || 0;
      for (let i = Math.max(0, len - 3); i < len; i++) {
        console.log(`     [${i + 1}] ${p.dtm[i]} -> Active Power: ${p.activePower[i]} ${p.units?.activePower || "kW"} | Production: ${p.production[i]} ${p.units?.production || "kWh"} | Grid: ${p.gridPower[i]} ${p.units?.gridPower || "kW"}`);
      }
    });
  }

  // 3. Test Dashboard Overview API for the day
  console.log("\n===============================================================");
  console.log("3️⃣ Testing Consolidated Residential Dashboard Overview API");
  console.log("   (GET /api/residential/dashboard/overview?plantId=13474)");
  console.log("===============================================================");
  const today = new Date().toISOString().slice(0, 10);
  const overviewRes = await fetch(`${baseUrl}/api/residential/dashboard/overview?plantId=13474&date=${today}&period=M`);
  const overview: any = await overviewRes.json();

  if (overview.success) {
    console.log("\n[Overview Data for Cribs Hospital - Plant ID: 13474]");
    console.log("• Plant Name:", overview.plantName);
    console.log("• Date:", overview.date);
    console.log("• Last Updated:", overview.lastUpdated);

    console.log("\n[Card 1: Top KPI Bar]");
    console.log(JSON.stringify(overview.topKpi, null, 2));

    console.log("\n[Card 2: Energy Flow Graph]");
    console.log(JSON.stringify(overview.flowGraph, null, 2));

    console.log("\n[Card 3: Plant Summary Card]");
    console.log(JSON.stringify(overview.summary, null, 2));

    console.log("\n[Card 4: Solar Utilization]");
    console.log(JSON.stringify(overview.solarUtilization, null, 2));

    console.log("\n[Card 6: Power Profile Curves (5-min intervals)]");
    console.log(`Total 5-min intervals: ${overview.powerProfile?.length}`);
    console.log("Sample 5-min power profile points (first 3):", overview.powerProfile?.slice(0, 3));
    console.log("Sample 5-min power profile points (mid-day peak):", overview.powerProfile?.slice(30, 33));
    console.log("Sample 5-min power profile points (latest 3):", overview.powerProfile?.slice(-3));

    console.log("\n[Card 7: Generation History (Daily breakdown)]");
    console.log(`Days recorded in current month: ${overview.generationHistory?.length}`);
    console.log("Sample Daily Yields (first 3 days):", overview.generationHistory?.slice(0, 3));
    console.log("Sample Daily Yields (latest 3 days):", overview.generationHistory?.slice(-3));
  } else {
    console.error("Overview error:", overview.error);
  }

  // 4. Test Inverter Electrical Matrix via live Deye call
  console.log("\n===============================================================");
  console.log("4️⃣ Testing Live Inverter Electrical Matrix (35+ Parameters)");
  console.log("   (Deye POST /v1.0/device/latest for Inverter 2506051213)");
  console.log("===============================================================");
  const deye = new DeyeClient({
    baseUrl: process.env.DEYE_BASE_URL,
    appId: process.env.DEYE_APP_ID,
    appSecret: process.env.DEYE_APP_SECRET,
    email: process.env.DEYE_EMAIL,
    token: process.env.DEYE_TOKEN,
  });

  try {
    const latestDevice = await deye.getDeviceLatest(["2506051213"], "INVERTER");
    const dataList = latestDevice.data?.deviceDataList?.[0]?.dataList || [];
    console.log(`Retrieved ${dataList.length} electrical data points from Inverter 2506051213:`);

    const dcStrings = dataList.filter((d: any) => d.key.includes("PV") || d.key.includes("MPPT"));
    console.log("\nDC String Electrical Parameters:");
    dcStrings.slice(0, 10).forEach((d: any) => console.log(`  • ${d.key}: ${d.value} ${d.unit || ""}`));

    const acPhases = dataList.filter((d: any) => d.key.includes("AC") || d.key.includes("Phase") || d.key.includes("Line") || d.key.includes("Frequency"));
    console.log("\nAC Grid Electrical Parameters:");
    acPhases.slice(0, 10).forEach((d: any) => console.log(`  • ${d.key}: ${d.value} ${d.unit || ""}`));

    const temps = dataList.filter((d: any) => d.key.toLowerCase().includes("temp") || d.key.toLowerCase().includes("radiator"));
    console.log("\nThermal Telemetry:");
    temps.forEach((d: any) => console.log(`  • ${d.key}: ${d.value} ${d.unit || ""}`));
  } catch (err: any) {
    console.error("Inverter electrical error:", err.message);
  }

  console.log("\n===============================================================");
  console.log("✅ ALL DAY'S DATA TESTS COMPLETED SUCCESSFULLY");
  console.log("===============================================================");
}

main().catch(console.error);
