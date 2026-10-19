import { DeyeClient } from "../client/DeyeClient.js";
import { ENDPOINT_REGISTRY, EndpointDefinition } from "./endpointRegistry.js";

export interface TestResultItem {
  id: string;
  category: string;
  method: string;
  path: string;
  summary: string;
  isReadOnly: boolean;
  status: "PASSED" | "FAILED" | "SKIPPED";
  statusCode: number;
  durationMs: number;
  data?: any;
  error?: string;
  curlCommand?: string;
  timestamp: string;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  timestamp: string;
  results: TestResultItem[];
}

export class DeyeTestRunner {
  private client: DeyeClient;

  constructor(client: DeyeClient) {
    this.client = client;
  }

  /**
   * Run a single endpoint test by ID
   */
  public async testEndpoint(
    endpointId: string,
    customPayload?: { body?: any; params?: any }
  ): Promise<TestResultItem> {
    const endpoint = ENDPOINT_REGISTRY.find((e) => e.id === endpointId);
    if (!endpoint) {
      return {
        id: endpointId,
        category: "Unknown",
        method: "GET",
        path: "unknown",
        summary: "Unknown endpoint",
        isReadOnly: true,
        status: "FAILED",
        statusCode: 404,
        durationMs: 0,
        error: `Endpoint ID "${endpointId}" not found in registry`,
        timestamp: new Date().toISOString(),
      };
    }

    const payload = customPayload || endpoint.defaultPayload({
      appSecret: this.client.appSecret,
      email: this.client.email,
      stationId: parseInt(process.env.DEFAULT_STATION_ID || "5652", 10),
      deviceSn: process.env.DEFAULT_DEVICE_SN || "2508065157",
    });

    try {
      const res = await endpoint.execute(this.client, payload);
      const isPassed = res.success === true;

      return {
        id: endpoint.id,
        category: endpoint.category,
        method: endpoint.method,
        path: endpoint.path,
        summary: endpoint.summary,
        isReadOnly: endpoint.isReadOnly,
        status: isPassed ? "PASSED" : "FAILED",
        statusCode: res.statusCode || (isPassed ? 200 : 400),
        durationMs: res.durationMs || 0,
        data: res.data,
        error: res.error,
        curlCommand: res.curlCommand,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        id: endpoint.id,
        category: endpoint.category,
        method: endpoint.method,
        path: endpoint.path,
        summary: endpoint.summary,
        isReadOnly: endpoint.isReadOnly,
        status: "FAILED",
        statusCode: 500,
        durationMs: 0,
        error: err.message || "Execution exception",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Run a batch of tests (e.g. readOnlyOnly, specific category)
   */
  public async runSuite(options: {
    readOnlyOnly?: boolean;
    category?: string;
    endpointIds?: string[];
  } = {}): Promise<TestSuiteSummary> {
    const startTime = Date.now();
    let endpointsToRun = ENDPOINT_REGISTRY;

    if (options.category && options.category.toUpperCase() !== "ALL") {
      endpointsToRun = endpointsToRun.filter(
        (e) => e.category.toLowerCase() === options.category!.toLowerCase()
      );
    }

    if (options.readOnlyOnly) {
      endpointsToRun = endpointsToRun.filter((e) => e.isReadOnly);
    }

    if (options.endpointIds && options.endpointIds.length > 0) {
      endpointsToRun = endpointsToRun.filter((e) =>
        options.endpointIds!.includes(e.id)
      );
    }

    const results: TestResultItem[] = [];

    // First ensure we have a token if any endpoint requires auth and no token is present
    const needsAuth = endpointsToRun.some((e) => e.requiresAuth);
    if (needsAuth && !this.client.token) {
      console.log("[DeyeTestRunner] Token not present, attempting initial authentication...");
      await this.testEndpoint("account_token");
    }

    for (const ep of endpointsToRun) {
      const res = await this.testEndpoint(ep.id);
      results.push(res);
    }

    const totalDurationMs = Date.now() - startTime;
    const passed = results.filter((r) => r.status === "PASSED").length;
    const failed = results.filter((r) => r.status === "FAILED").length;
    const skipped = results.filter((r) => r.status === "SKIPPED").length;

    return {
      total: results.length,
      passed,
      failed,
      skipped,
      totalDurationMs,
      timestamp: new Date().toISOString(),
      results,
    };
  }
}
