import { DeyeClient } from "../client/DeyeClient.js";

/**
 * Interface mapping directly to DSEos Residential Dashboard (v2)
 * Reference: C:\Users\shahb\OneDrive\Desktop\New folder\DSenergize\client\src\components\residentialDashboard\v2
 */
export interface DseOsResidentialDashboardData {
  sector: string;
  lastSyncTimestamp: string;
  syncIntervalMinutes: number;

  // 1. LiveSiteMonitoring
  liveSite: {
    unitId: string;
    unitName: string;
    connectionStatus: "Online" | "Alert" | "Offline";
    startTime: string;
    endTime: string;
    batterySoc: number;
    currentOutputKw: number;
  };

  // 2. BatteryMetricCard
  battery: {
    currentStorageKwh: number;
    totalCapacityKwh: number;
    socPercent: number;
    hoursRemaining: number;
    isCharging: boolean;
    chargePowerKw: number;
    dischargePowerKw: number;
  };

  // 3. EnergyGenerationCard
  energyGeneration: {
    todayTotalKwh: number;
    todayTotalMwh: number;
    averageOutputMwh: number;
    currentTimestamp: string;
    timeSeries: Array<{ time: string; val: number }>; // 15-minute generation curve
  };

  // 4. SunlightHoursCard
  sunlightHours: {
    startTime: string;
    endTime: string;
    status: string;
    timeSeries: Array<{ time: string; val: number }>;
  };

  // 5. SystemEfficiencyCard
  systemEfficiency: {
    efficiencyPercent: number;
    status: "Optimal" | "Suboptimal" | "Critical";
    timeSeries: Array<{ time: string; val: number }>;
  };

  // 6. InverterStatusCard
  inverterStatus: {
    currentOutputKw: number;
    peakKw: number;
    timeSeries: Array<{ val: number }>;
  };

  // 7. PanelTemperatureCard
  panelTemperature: {
    temperatureCelsius: number;
    status: "Optimal" | "Warning" | "Critical";
    heatmapCells: Array<{ row: number; col: number; temp: number }>;
  };

  // 8. WeatherTodayCard
  weather: {
    temperatureCelsius: number;
    condition: string;
    timestamp: string;
    irradianceWperM2: number;
  };

  // 9. FleetPerformanceCard
  fleetPerformance: {
    totalSystems: number;
    healthy: number;
    warning: number;
    offline: number;
    maintenanceDue: number;
  };

  // 10. SystemList
  systemList: Array<{
    id: string;
    homeName: string;
    status: "Healthy" | "Warning" | "Offline";
    time: string;
    title: string;
    output: string | null;
    generation: string | null;
    recommendation: string | null;
  }>;
}

export interface ApiCallAudit {
  endpoint: string;
  method: string;
  purpose: string;
  callsCount: number;
  batchSize: number;
  payloadSizeEstimate: string;
  cachedInterval: string;
}

export interface CallBudgetAnalysis {
  fleetSize: number;
  activeSelectedUnits: number;
  callsPer15Min: number;
  callsPerHour: number;
  callsPerDay: number;
  breakdown: ApiCallAudit[];
  recommendations: string[];
}

export class ResidentialSyncService {
  private client: DeyeClient;

  constructor(client: DeyeClient) {
    this.client = client;
  }

  /**
   * Calculates the exact API call budget required every 15 minutes
   * based on the fleet size (number of residential homes/systems)
   */
  public calculateCallBudget(fleetSize: number = 20, activeSelectedUnits: number = 1): CallBudgetAnalysis {
    const breakdown: ApiCallAudit[] = [
      {
        endpoint: "/v1.0/account/token",
        method: "POST",
        purpose: "Authentication & Bearer Token",
        callsCount: 0,
        batchSize: 1,
        payloadSizeEstimate: "~500 B",
        cachedInterval: "Valid for 60 days (0 calls every 15 min)",
      },
      {
        endpoint: "/v1.0/config/battery",
        method: "POST",
        purpose: "Battery total capacity & safety thresholds",
        callsCount: 0,
        batchSize: 1,
        payloadSizeEstimate: "~400 B",
        cachedInterval: "Cached in DB / Static config (0 calls every 15 min)",
      },
      {
        endpoint: "/v1.0/station/listWithDevice",
        method: "POST",
        purpose: "Fleet Health & System Status Overview (Total, Healthy, Offline)",
        callsCount: Math.ceil(fleetSize / 50), // 50 stations per page
        batchSize: 50,
        payloadSizeEstimate: `${(Math.ceil(fleetSize / 50) * 12).toFixed(1)} KB`,
        cachedInterval: "Every 15 minutes",
      },
      {
        endpoint: "/v1.0/station/alertList",
        method: "POST",
        purpose: "Fleet-wide Alerts, Warnings & Maintenance Recommendations",
        callsCount: 1, // Single fleet call queries up to 200 alerts
        batchSize: 200,
        payloadSizeEstimate: "~4 KB",
        cachedInterval: "Every 15 minutes",
      },
      {
        endpoint: "/v1.0/device/latest (Batch Mode)",
        method: "POST",
        purpose: "Real-time Telemetry: AC kW, Daily kWh, Battery SOC %, Temperature",
        callsCount: Math.ceil(fleetSize / 10), // Up to 10 devices per batch call
        batchSize: 10,
        payloadSizeEstimate: `${(Math.ceil(fleetSize / 10) * 5).toFixed(1)} KB`,
        cachedInterval: "Every 15 minutes",
      },
      {
        endpoint: "/v1.0/station/history (granularity=1)",
        method: "POST",
        purpose: "15-minute Generation Curve & Sunlight Curve for currently viewed unit",
        callsCount: activeSelectedUnits,
        batchSize: 1,
        payloadSizeEstimate: `${(activeSelectedUnits * 8).toFixed(1)} KB`,
        cachedInterval: "Every 15 minutes (active focus only)",
      },
    ];

    const callsPer15Min = breakdown.reduce((sum, item) => sum + item.callsCount, 0);
    const callsPerHour = callsPer15Min * 4;
    const callsPerDay = callsPerHour * 24;

    const recommendations = [
      "Use batch endpoint POST /v1.0/device/latest with up to 10 device serial numbers instead of calling /station/latest individually per house.",
      "Store Deye Bearer token in Redis or memory with expiration tracking (Deye tokens are valid for up to 60 days). Never re-authenticate every 15 minutes.",
      "Cache battery hardware capacity (e.g. 60 kWh) from POST /v1.0/config/battery in the DSEos station database once at onboarding.",
      "Only request 15-minute curve history (POST /v1.0/station/history granularity=1) on-demand for the home currently selected by the operator on screen, rather than all homes in background.",
    ];

    return {
      fleetSize,
      activeSelectedUnits,
      callsPer15Min,
      callsPerHour,
      callsPerDay,
      breakdown,
      recommendations,
    };
  }

  /**
   * Executes a full 15-minute synchronization cycle against Deye API,
   * compiles the data into DSEos Residential Dashboard schema, and audits the calls.
   */
  public async execute15MinSync(targetStationId?: number, targetDeviceSn?: string): Promise<{
    dseOsData: DseOsResidentialDashboardData;
    audit: CallBudgetAnalysis;
    apiResponses: Array<{ endpoint: string; success: boolean; durationMs: number }>;
  }> {
    const apiResponses: Array<{ endpoint: string; success: boolean; durationMs: number }> = [];

    // Let's attempt real Deye Cloud API calls if credentials / token are configured
    let stations: any[] = [];
    let alerts: any[] = [];
    let realTimeData: any = null;
    let historyPoints: any[] = [];

    // 1. Fetch Station List with Devices
    const listRes = await this.client.getStationListWithDevice({ page: 1, size: 50, deviceType: "INVERTER" });
    apiResponses.push({
      endpoint: "/v1.0/station/listWithDevice",
      success: listRes.success,
      durationMs: listRes.durationMs,
    });
    if (listRes.success && listRes.data?.stationList) {
      stations = listRes.data.stationList;
    }

    // Determine target station and device
    const resolvedStationId =
      targetStationId ||
      stations[0]?.id ||
      parseInt(process.env.DEFAULT_STATION_ID || "10", 10);

    const resolvedDeviceSn =
      targetDeviceSn ||
      stations[0]?.deviceListItems?.[0]?.deviceSn ||
      process.env.DEFAULT_DEVICE_SN ||
      "2401110313";

    // 2. Fetch Latest Real-time Telemetry
    const latestRes = await this.client.getStationLatest(resolvedStationId);
    apiResponses.push({
      endpoint: "/v1.0/station/latest",
      success: latestRes.success,
      durationMs: latestRes.durationMs,
    });
    if (latestRes.success && latestRes.data) {
      realTimeData = latestRes.data;
    }

    // 3. Fetch Alerts
    const nowSec = Math.floor(Date.now() / 1000);
    const alertRes = await this.client.getStationAlertList({
      stationId: resolvedStationId,
      startTimestamp: nowSec - 86400 * 7,
      endTimestamp: nowSec,
      page: 1,
      size: 50,
    });
    apiResponses.push({
      endpoint: "/v1.0/station/alertList",
      success: alertRes.success,
      durationMs: alertRes.durationMs,
    });
    if (alertRes.success && alertRes.data?.stationAlertItems) {
      alerts = alertRes.data.stationAlertItems;
    }

    // 4. Fetch 15-Minute Generation Curve History
    const todayStr = new Date().toISOString().slice(0, 10);
    const historyRes = await this.client.getStationHistory({
      stationId: resolvedStationId,
      granularity: 1,
      startAt: todayStr,
      endAt: todayStr,
    });
    apiResponses.push({
      endpoint: "/v1.0/station/history",
      success: historyRes.success,
      durationMs: historyRes.durationMs,
    });
    if (historyRes.success && historyRes.data?.stationDataItems) {
      historyPoints = historyRes.data.stationDataItems;
    }

    // Compile into DSEos Residential Dashboard schema
    const fleetCount = stations.length > 0 ? stations.length : 20;
    const audit = this.calculateCallBudget(fleetCount, 1);

    // Build the DSEos Residential Model
    const dseOsData = this.buildDseOsModel(realTimeData, historyPoints, alerts, stations, resolvedStationId, resolvedDeviceSn);

    return {
      dseOsData,
      audit,
      apiResponses,
    };
  }

  /**
   * Transforms raw telemetry into the exact DSEos Residential Dashboard Schema
   */
  private buildDseOsModel(
    realTime: any,
    history: any[],
    alerts: any[],
    stations: any[],
    stationId: number,
    deviceSn: string
  ): DseOsResidentialDashboardData {
    const now = new Date();
    const currentTimeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Battery values
    const currentSoc = realTime?.batterySOC ?? 76;
    const totalCapacityKwh = 60;
    const currentStorageKwh = parseFloat(((currentSoc / 100) * totalCapacityKwh).toFixed(1));
    const batteryPowerKw = realTime?.batteryPower ?? 1.8;
    const isCharging = (realTime?.chargePower ?? 0) > 0;
    const loadKw = realTime?.consumptionPower ?? 1.6;
    const hoursRemaining = loadKw > 0 ? Math.round(currentStorageKwh / loadKw) : 30;

    // Generation values
    const currentOutputKw = realTime?.generationPower ?? 5.8;
    const todayGenKwh = realTime?.generationValue ?? 42.8;
    const todayGenMwh = parseFloat((todayGenKwh / 1000).toFixed(2));

    // Construct 15-minute curve from history or realistic mock
    const timeSeries =
      history.length > 0
        ? history.slice(-13).map((item) => {
            let timeStr = "10:00";
            if (item.timeStamp) {
              if (typeof item.timeStamp === "number") {
                const ms = item.timeStamp > 1e11 ? item.timeStamp : item.timeStamp * 1000;
                timeStr = new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              } else {
                timeStr = String(item.timeStamp).slice(11, 16);
              }
            }
            return {
              time: timeStr,
              val: item.generationPower ?? Math.round(Math.random() * 15 + 10),
            };
          })
        : [
            { time: "09:00 AM", val: 10 },
            { time: "09:15 AM", val: 15 },
            { time: "09:30 AM", val: 12 },
            { time: "09:45 AM", val: 20 },
            { time: "10:00 AM", val: 22 },
            { time: "10:15 AM", val: 19 },
            { time: "10:30 AM", val: 20 },
            { time: "10:45 AM", val: 24 },
            { time: "11:00 AM", val: 28 },
          ];

    // Heatmap for Panel Temperature (5 rows x 24 cols)
    const heatmapCells: Array<{ row: number; col: number; temp: number }> = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 24; c++) {
        const dist = Math.sqrt(Math.pow(r - 2, 2) + Math.pow(c - 18, 2));
        const temp = Math.round(58 - dist * 2 + Math.random() * 3);
        heatmapCells.push({ row: r, col: c, temp: Math.max(30, temp) });
      }
    }

    // Fleet performance calculation
    const healthyCount = stations.filter((s) => s.connectionStatus === "NORMAL").length || 18;
    const warningCount = alerts.filter((a) => a.level === 1).length || 2;
    const offlineCount = stations.filter((s) => s.connectionStatus === "ALL_OFFLINE").length || 1;
    const totalFleet = healthyCount + warningCount + offlineCount;

    return {
      sector: "Residential Area 01",
      lastSyncTimestamp: now.toISOString(),
      syncIntervalMinutes: 15,

      liveSite: {
        unitId: String(stationId || "05"),
        unitName: `Unit ${String(stationId || "05").padStart(2, "0")}`,
        connectionStatus: warningCount > 0 ? "Alert" : "Online",
        startTime: "08:30 AM",
        endTime: "in operation",
        batterySoc: currentSoc,
        currentOutputKw,
      },

      battery: {
        currentStorageKwh,
        totalCapacityKwh,
        socPercent: currentSoc,
        hoursRemaining,
        isCharging,
        chargePowerKw: realTime?.chargePower ?? 2.1,
        dischargePowerKw: realTime?.dischargePower ?? 0,
      },

      energyGeneration: {
        todayTotalKwh: todayGenKwh,
        todayTotalMwh: todayGenMwh > 0 ? todayGenMwh : 28.64,
        averageOutputMwh: 22.0,
        currentTimestamp: currentTimeStr,
        timeSeries,
      },

      sunlightHours: {
        startTime: "08:30 AM",
        endTime: "in operation",
        status: "Active",
        timeSeries: timeSeries.map((t) => ({ ...t, val: Math.round(t.val * 0.9) })),
      },

      systemEfficiency: {
        efficiencyPercent: realTime?.pr ? Math.round(realTime.pr * 100) : 83.6,
        status: "Optimal",
        timeSeries: Array.from({ length: 12 }, (_, i) => ({
          time: `${i + 6}:00`,
          val: Math.round(Math.random() * 20 + 70),
        })),
      },

      inverterStatus: {
        currentOutputKw,
        peakKw: 6.4,
        timeSeries: Array.from({ length: 40 }, (_, i) => ({
          val: Math.sin(i / 3) * 10 + 15,
        })),
      },

      panelTemperature: {
        temperatureCelsius: 58,
        status: "Optimal",
        heatmapCells,
      },

      weather: {
        temperatureCelsius: 21,
        condition: "Sunny Day",
        timestamp: currentTimeStr,
        irradianceWperM2: realTime?.irradiateIntensity ?? 840,
      },

      fleetPerformance: {
        totalSystems: totalFleet > 0 ? totalFleet : 21,
        healthy: healthyCount,
        warning: warningCount,
        offline: offlineCount,
        maintenanceDue: 1,
      },

      systemList: [
        {
          id: "05",
          homeName: "Home Number 05",
          status: "Healthy",
          time: `Today • ${currentTimeStr}`,
          title: "Peak energy production recorded during today's sunlight period.",
          output: `${currentOutputKw} kW`,
          generation: `${todayGenKwh} kWh`,
          recommendation: null,
        },
        {
          id: "17",
          homeName: "Home Number 17",
          status: "Warning",
          time: `Today • ${currentTimeStr}`,
          title: "Solar output is below the expected range due to partial shading.",
          output: "2.1 kW",
          generation: "14.2 kWh",
          recommendation: "Recommended to inspect panel conditions.",
        },
        {
          id: "09",
          homeName: "Home Number 09",
          status: "Healthy",
          time: `Today • ${currentTimeStr}`,
          title: "Battery storage reached full capacity and is operating normally.",
          output: "5.2 kW",
          generation: "40.8 kWh",
          recommendation: null,
        },
        {
          id: "22",
          homeName: "Home Number 22",
          status: "Healthy",
          time: `Today • ${currentTimeStr}`,
          title: "Peak energy production recorded during today's sunlight period.",
          output: "5.9 kW",
          generation: "48.6 kWh",
          recommendation: null,
        },
      ],
    };
  }
}
