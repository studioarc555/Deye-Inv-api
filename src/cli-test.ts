import dotenv from "dotenv";
import { DeyeClient } from "./client/DeyeClient.js";
import { DeyeTestRunner } from "./testing/testRunner.js";

dotenv.config();

async function main() {
  console.log(`\n======================================================`);
  console.log(`🧪 Running Deye Cloud OpenAPI Test Suite (Safe Mode)`);
  console.log(`🌐 Base URL: ${process.env.DEYE_BASE_URL || "https://india-developer.deyecloud.com"}`);
  console.log(`🔑 App ID: ${process.env.DEYE_APP_ID || "1dy_CvzohxYj"}`);
  console.log(`======================================================\n`);

  const client = new DeyeClient();
  const runner = new DeyeTestRunner(client);

  console.log(`Running safe read-only tests across all endpoint categories...\n`);
  const summary = await runner.runSuite({ readOnlyOnly: true });

  console.log(`\n======================================================`);
  console.log(`📊 Test Suite Execution Results:`);
  console.log(`Total Endpoints Tested: ${summary.total}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Duration: ${summary.totalDurationMs} ms`);
  console.log(`======================================================\n`);

  summary.results.forEach((r, idx) => {
    const icon = r.status === "PASSED" ? "✅" : "❌";
    console.log(
      `${String(idx + 1).padStart(2, " ")}. ${icon} [${r.category.padEnd(13, " ")}] ${r.method.padEnd(4, " ")} ${r.path.padEnd(35, " ")} (${r.durationMs}ms) - ${r.error || "OK"}`
    );
  });
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
