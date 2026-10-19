import { DeyeClient } from "./client/DeyeClient.js";

async function run() {
  const secret = "5542054d99c876280bb46d0e3153a08c";
  const email = "ecomatter07@gmail.com";
  const pass = "6b0cdb8a75ad3de6cff149f598f62199b65bd82e7ff63e9b3d0e291f14eb0d26";

  for (const appId of ["202610155771006", "1dy_CvzohxYj"]) {
    console.log(`\n========================================`);
    console.log(`Testing token acquisition for appId: ${appId}`);
    const client = new DeyeClient({
      appId,
      appSecret: secret,
      email,
      password: pass,
    });

    const result = await client.obtainToken();
    console.log(`Status Code: ${result.statusCode}`);
    console.log(`Duration: ${result.durationMs}ms`);
    console.log(`Success: ${result.success}`);
    console.log(`Response Code: ${result.data?.code}`);
    console.log(`Response Msg: ${result.data?.msg}`);
    if (result.data?.data) {
      console.log(`Access Token: ${result.data.data.accessToken?.slice(0, 30)}...`);
      console.log(`Expires In: ${result.data.data.expiresIn} seconds`);
    }
  }
}

run().catch(console.error);
