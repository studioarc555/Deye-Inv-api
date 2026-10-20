import { DeyeClient } from "../client/DeyeClient.js";
import { getResidentialCollection } from "../db/mongoClient.js";

export interface SyncOptions {
  date?: string; // YYYY-MM-DD
  includeRaw?: boolean;
  plantId?: string;
}

export interface TelemetryUnits {
  dtm: string; // format description e.g. "YYYY-MM-DD HH:mm"
  activePower: string; // "kW"
  production: string; // "kWh"
  gridPower: string; // "kW"
  consumptionPower: string; // "kW"
  realTimeActivePower: string; // "kW"
  installedCapacity: string; // "kWp"
  dailyProduction: string; // "kWh"
  totalProduction: string; // "MWh"
}

export interface TelemetryPoint {
  dtm: string; // "YYYY-MM-DD HH:mm"
  activePower: number; // in kW
  production: number; // in kWh
  gridPower: number; // in kW
  consumptionPower: number; // in kW
  unitActivePower?: string; // "kW"
  unitProduction?: string; // "kWh"
  unitGridPower?: string; // "kW"
  unitConsumptionPower?: string; // "kW"
  deviceMetrics?: DeviceMetricPoint;
}

export interface DeviceMetric {
  value: number;
  unit: string;
}

export interface DeviceMetricPoint {
  [key: string]: DeviceMetric;
}

/**
 * Station Packet schema stored in MongoDB (Database: myDatabase, Collection: ResidentialAPI):
 * Station ID, Device SN, units, DTM-[...], Production-[...], active Power-[...], grid Power-[...], consumption Power-[...], etc.
 */
export interface StationPacket {
  stationId: number;
  plantId?: string;
  isResidential?: boolean;
  stationName: string;
  deviceSn: string;
  date: string; // YYYY-MM-DD
  syncedAt: Date;
  updatedAt: Date;
  createdAt?: Date;

  // Complete KPI Units definition
  units: TelemetryUnits;

  // Key telemetry arrays with corresponding units
  dtm: string[]; // ["2026-10-17 05:00", "2026-10-17 05:05", ...]
  production: number[]; // [0.0, 0.5, 1.2, ...] in kWh
  activePower: number[]; // [30.01, 29.52, 29.13, ...] in kW
  gridPower: number[]; // [30.01, 29.52, ...] in kW
  consumptionPower: number[]; // [0.0, 0.0, ...] in kW

  // Instantaneous Latest Telemetry with units
  latestTelemetry: {
    realTimeActivePower: number; // kW
    realTimeActivePowerUnit: string; // "kW"
    realTimeActivePowerKw: number; // backward compatibility

    installedCapacity: number; // kWp
    installedCapacityUnit: string; // "kWp"
    installedCapacityKw: number; // backward compatibility

    dailyProduction: number; // kWh
    dailyProductionUnit: string; // "kWh"
    dailyProductionKwh: number; // backward compatibility

    totalProduction: number; // MWh
    totalProductionUnit: string; // "MWh"
    totalProductionMwh: number; // backward compatibility

    status: "normal" | "standby" | "fault" | "offline";
    lastUpdateTime: string;
    deviceMetrics?: Record<string, DeviceMetric>;
  };

  // Structured point objects for charting
  points: TelemetryPoint[];

  metadata: {
    locationAddress?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    gridType?: string;
    connectionStatus?: string;
  };

  devices: Array<{
    deviceSn: string;
    deviceType: string;
    connectStatus?: number;
  }>;

  alerts?: any[];
  rawDeyeLatest?: any;
  rawDeyeMeasurePoints?: string[];
}

export interface ResidentialDashboardData {
  packet: StationPacket;
  availableStations: Array<{
    stationId: number;
    stationName: string;
    deviceSn: string;
    installedCapacityKw: number;
    status: StationPacket["latestTelemetry"]["status"];
  }>;
  summary: {
    monthlyProductionMwh: number;
    lifetimeProductionMwh: number;
    dailyGridFeedInKwh: number;
    cumulativeGridFeedInMwh: number;
    dailyConsumptionKwh: number;
    cumulativeConsumptionMwh: number;
  };
}

export class ResidentialMongoService {
  private deyeClient: DeyeClient;

  constructor(deyeClient: DeyeClient) {
    this.deyeClient = deyeClient;
  }

  /**
   * Pulls data for a single dynamic station from Deye Cloud,
   * compiles the 5-minute time series packet, and atomically upserts into MongoDB ResidentialAPI collection.
   */
  public async pullAndSaveStationPacket(
    stationIdParam: string | number,
    packetIndex: number = 1,
    options: SyncOptions = {}
  ): Promise<{
    success: boolean;
    stationId: number;
    stationName: string;
    deviceSn: string;
    date: string;
    pointsCount: number;
    action: "inserted" | "updated";
    durationMs: number;
    packet: StationPacket;
  }> {
    const startTime = Date.now();
    const stationId = parseInt(String(stationIdParam), 10);
    if (!stationId || isNaN(stationId)) {
      throw new Error(`Invalid stationId: "${stationIdParam}". Must be a valid numeric station ID.`);
    }

    const date = options.date || new Date().toISOString().slice(0, 10);

    // 1. Fetch station-level data needed to identify the inverter and build the packet.
    const [detailRes, devicesRes, latestRes, historyRes, alertRes] = await Promise.all([
      this.deyeClient.getStationDetail(stationId).catch(() => null),
      this.deyeClient.getStationDevices([stationId], 1, 50).catch(() => null),
      this.deyeClient.getStationLatest(stationId).catch(() => null),
      this.deyeClient
        .getStationHistory({
          stationId,
          granularity: 1, // 5-minute interval frames
          startAt: date,
          endAt: date,
        })
        .catch(() => null),
      this.deyeClient
        .getStationAlertList({
          stationId,
          startTimestamp: Math.floor(Date.now() / 1000) - 86400 * 7,
          endTimestamp: Math.floor(Date.now() / 1000),
          page: 1,
          size: 50,
        })
        .catch(() => null),
    ]);

    const station = detailRes?.data?.station;
    const plantId = options.plantId ?? (station as any)?.plantId ?? (station as any)?.plantID;
    const deviceItems = devicesRes?.data?.deviceListItems || [];
    const latest = latestRes?.data;
    const rawHistoryItems = historyRes?.data?.stationDataItems || [];
    const alertItems = alertRes?.data?.stationAlertItems || [];

    // Identify primary inverter serial number
    const inverterDevice =
      deviceItems.find((d: any) => d.deviceType === "INVERTER") ||
      deviceItems[0];
    if (!inverterDevice?.deviceSn) {
      throw new Error(`No inverter device found for Deye station ${stationId}.`);
    }
    const deviceSn = inverterDevice.deviceSn;
    const deviceLatestRes = await this.deyeClient.getDeviceLatest([deviceSn], "INVERTER").catch(() => null);
    const deviceLatest = deviceLatestRes?.data?.deviceDataList?.[0];
    const measurePointsRes = await this.deyeClient.getDeviceMeasurePoints(deviceSn, "INVERTER").catch(() => null);
    const availableMeasurePoints = measurePointsRes?.data?.measurePoints || [];
    const deviceMetrics = Object.fromEntries(
      (deviceLatest?.dataList || [])
        .map((item: any) => [item.key, { value: Number(item.value), unit: item.unit || "" }])
        .filter((entry: any[]) => Number.isFinite(entry[1]?.value))
    ) as Record<string, DeviceMetric>;
    const historyMetricKeys = [
      ...Array.from({ length: 8 }, (_, index) => `DCVoltagePV${index + 1}`),
      ...Array.from({ length: 8 }, (_, index) => `DCCurrentPV${index + 1}`),
      ...Array.from({ length: 8 }, (_, index) => `DCPowerPV${index + 1}`),
      "TotalActiveACOutputPower",
      "TotalConsumption",
      "TotalConsumptionPower",
      "TotalEnergyPurchased",
      "TotalGridFeedIn",
      "ACVoltageRUA",
      "ACVoltageSVB",
      "ACVoltageTWC",
      "ACCurrentRUA",
      "ACCurrentSVB",
      "ACCurrentTWC",
      "ACOutputFrequencyR",
      "InverterOutputPowerL1",
      "InverterOutputPowerL2",
      "InverterOutputPowerL3",
      ...Array.from({ length: 18 }, (_, index) => `CurrentBranch${index + 1}`),
      ...Array.from({ length: 14 }, (_, index) => `BranchCurrent${index + 19}`),
    ];
    const historyMetricBatches = Array.from(
      { length: Math.ceil(historyMetricKeys.length / 5) },
      (_, index) => historyMetricKeys.slice(index * 5, index * 5 + 5)
    );
    const deviceHistoryResponses = await Promise.all(
      historyMetricBatches.map((measurePoints) =>
        this.deyeClient
          .getDeviceHistory({
            deviceSn,
            deviceType: "INVERTER",
            granularity: 1,
            startAt: date,
            endAt: date,
            measurePoints,
          })
          .catch(() => null)
      )
    );
    const deviceHistoryByTime = new Map<string, DeviceMetricPoint>();
    deviceHistoryResponses.forEach((response) => {
      (response?.data?.dataList || []).forEach((item: any) => {
        const time = String(item.time || item.collectionTime || "");
        if (!time) return;
        const metrics = deviceHistoryByTime.get(time) || {};
        (item.itemList || []).forEach((metric: any) => {
          const value = Number(metric.value);
          if (Number.isFinite(value) && metric.key) {
            metrics[metric.key] = { value, unit: metric.unit || "" };
          }
        });
        deviceHistoryByTime.set(time, metrics);
      });
    });
    const deviceHistoryTimes = Array.from(deviceHistoryByTime.keys())
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const getDeviceMetricsForTimestamp = (timestamp: unknown) => {
      const target = Number(timestamp);
      if (!Number.isFinite(target) || deviceHistoryTimes.length === 0) return undefined;
      let closest = deviceHistoryTimes[0];
      for (const candidate of deviceHistoryTimes) {
        if (Math.abs(candidate - target) < Math.abs(closest - target)) closest = candidate;
      }
      return Math.abs(closest - target) <= 600
        ? deviceHistoryByTime.get(String(closest))
        : undefined;
    };

    // 2. Format 5-Minute Time-Series Points with explicit KPI Units
    const dtmArray: string[] = [];
    const productionArray: number[] = [];
    const activePowerArray: number[] = [];
    const gridPowerArray: number[] = [];
    const consumptionPowerArray: number[] = [];
    const points: TelemetryPoint[] = [];

    let runningProductionKwh = 0;

    if (rawHistoryItems.length > 0) {
      rawHistoryItems.forEach((item: any) => {
        let dtmStr = `${date} 00:00`;
        if (item.timeStamp) {
          const tsNum = typeof item.timeStamp === "number" ? item.timeStamp : Number(item.timeStamp);
          const epochMs = tsNum > 1e11 ? tsNum : tsNum * 1000;
          const d = new Date(epochMs);
          const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
          dtmStr = `${date} ${time}`;
        }

        const pKw = parseFloat(((item.generationPower || 0) / 1000).toFixed(2));
        const gKw = parseFloat(((item.gridPower || item.wirePower || item.generationPower || 0) / 1000).toFixed(2));
        const cKw = parseFloat(((item.consumptionPower || 0) / 1000).toFixed(2));

        // Estimate incremental kWh for 5 min: (kW * 5 / 60)
        runningProductionKwh += parseFloat(((pKw * 5) / 60).toFixed(3));
        const currentProdKwh = parseFloat(runningProductionKwh.toFixed(2));

        dtmArray.push(dtmStr);
        activePowerArray.push(pKw);
        productionArray.push(currentProdKwh);
        gridPowerArray.push(gKw);
        consumptionPowerArray.push(cKw);

        points.push({
          dtm: dtmStr,
          activePower: pKw,
          production: currentProdKwh,
          gridPower: gKw,
          consumptionPower: cKw,
          unitActivePower: "kW",
          unitProduction: "kWh",
          unitGridPower: "kW",
          unitConsumptionPower: "kW",
          deviceMetrics: getDeviceMetricsForTimestamp(item.timeStamp),
        });
      });
    } else {
      // Fallback daylight curve if station history is empty for early morning
      const defaultTimes = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
      defaultTimes.forEach((t) => {
        const dtmStr = `${date} ${t}`;
        dtmArray.push(dtmStr);
        activePowerArray.push(0);
        productionArray.push(0);
        gridPowerArray.push(0);
        consumptionPowerArray.push(0);
        points.push({
          dtm: dtmStr,
          activePower: 0,
          production: 0,
          gridPower: 0,
          consumptionPower: 0,
          unitActivePower: "kW",
          unitProduction: "kWh",
          unitGridPower: "kW",
          unitConsumptionPower: "kW",
        });
      });
    }

    // 3. Assemble Latest Telemetry Snapshot with explicit units
    const realTimePowerKw = parseFloat(((latest?.generationPower || 0) / 1000).toFixed(2));
    const ratedPowerKw = deviceMetrics.RatedPower?.value;
    const installedCapacityKw =
      typeof station?.installedCapacity === "number"
        ? station.installedCapacity
        : typeof ratedPowerKw === "number"
        ? ratedPowerKw / 1000
        : 0;
    const dailyMetric = deviceMetrics.DailyActiveProduction?.value;
    const totalMetric = deviceMetrics.TotalActiveProduction?.value;
    const dailyProductionKwh =
      dailyMetric !== undefined
        ? parseFloat(dailyMetric.toFixed(1))
        : parseFloat(runningProductionKwh.toFixed(1));
    const totalProductionMwh =
      totalMetric !== undefined
        ? parseFloat((totalMetric / 1000).toFixed(3))
        : 0;

    let status: "normal" | "standby" | "fault" | "offline" = "normal";
    if (station?.connectionStatus === "ALL_OFFLINE") {
      status = "offline";
    } else if (realTimePowerKw === 0) {
      status = "standby";
    }

    const lastUpdateNum = latest?.lastUpdateTime ? Number(latest.lastUpdateTime) : 0;
    const lastUpdateFormatted = lastUpdateNum
      ? new Date(lastUpdateNum > 1e11 ? lastUpdateNum : lastUpdateNum * 1000)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19)
      : new Date().toISOString().replace("T", " ").slice(0, 19);

    // 4. Build Document without packetName, with full KPI units
    const packet: StationPacket = {
      stationId,
      ...(plantId ? { plantId: String(plantId), isResidential: true } : {}),
      stationName: station?.name || `Station ${stationId}`,
      deviceSn,
      date,
      syncedAt: new Date(),
      updatedAt: new Date(),

      units: {
        dtm: "YYYY-MM-DD HH:mm",
        activePower: "kW",
        production: "kWh",
        gridPower: "kW",
        consumptionPower: "kW",
        realTimeActivePower: "kW",
        installedCapacity: "kWp",
        dailyProduction: "kWh",
        totalProduction: "MWh",
      },

      latestTelemetry: {
        realTimeActivePower: realTimePowerKw,
        realTimeActivePowerUnit: "kW",
        realTimeActivePowerKw: realTimePowerKw,

        installedCapacity: installedCapacityKw,
        installedCapacityUnit: "kWp",
        installedCapacityKw,

        dailyProduction: dailyProductionKwh,
        dailyProductionUnit: "kWh",
        dailyProductionKwh,

        totalProduction: totalProductionMwh,
        totalProductionUnit: "MWh",
        totalProductionMwh,

        status,
        lastUpdateTime: lastUpdateFormatted,
        deviceMetrics,
      },
      dtm: dtmArray,
      production: productionArray,
      activePower: activePowerArray,
      gridPower: gridPowerArray,
      consumptionPower: consumptionPowerArray,
      points,
      rawDeyeLatest: { stationLatest: latest, deviceLatest },
      rawDeyeMeasurePoints: availableMeasurePoints,
      metadata: {
        locationAddress: station?.locationAddress,
        latitude: station?.locationLat,
        longitude: station?.locationLng,
        timezone: station?.regionTimezone,
        gridType: station?.gridInterconnectionType,
        connectionStatus: station?.connectionStatus || status,
      },
      devices: deviceItems.map((d: any) => ({
        deviceSn: d.deviceSn,
        deviceType: d.deviceType,
        connectStatus: d.connectStatus,
      })),
      alerts: alertItems.map((a: any) => ({
        alertId: a.alertId,
        alertName: a.alertName,
        level: a.level,
        status: a.status,
      })),
    };

    if (options.includeRaw) packet.rawDeyeLatest = { stationLatest: latest, deviceLatest };

    // 5. ATOMIC UPSERT INTO MONGODB
    // Database: myDatabase, Collection: ResidentialAPI
    // Keyed by: { stationId, date }
    const collection = await getResidentialCollection();

    const writeResult = await collection.updateOne(
      { stationId, date },
      {
        $set: {
          ...packet,
          updatedAt: new Date(),
        },
        $unset: {
          packetName: "", // Ensure packetName is stripped out from DB
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    const action = writeResult.upsertedCount > 0 ? "inserted" : "updated";
    const durationMs = Date.now() - startTime;

    return {
      success: true,
      stationId,
      stationName: packet.stationName,
      deviceSn,
      date,
      pointsCount: points.length,
      action,
      durationMs,
      packet,
    };
  }

  /**
   * The 15-Minute Sync Engine:
   * Discovers all stations under the account, iterates through them:
   * Performs atomic upserts into MongoDB ResidentialAPI collection.
   */
  public async execute15MinPacketSync(options: SyncOptions = {}): Promise<{
    success: boolean;
    syncTimestamp: string;
    totalStations: number;
    syncedPackets: number;
    durationMs: number;
    packets: Array<{
      stationId: number;
      stationName: string;
      deviceSn: string;
      pointsCount: number;
      action: "inserted" | "updated";
      activePowerKw: number;
      activePowerUnit: string;
      durationMs: number;
    }>;
  }> {
    const overallStartTime = Date.now();
    const date = options.date || new Date().toISOString().slice(0, 10);

    // Fetch station list
    const listRes = await this.deyeClient.getStationList(1, 50);
    const stations = listRes.data?.stationList || [];

    const packetsSummary: any[] = [];

    // Loop through each station
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      const packetIndex = i + 1;
      try {
        const res = await this.pullAndSaveStationPacket(st.id, packetIndex, {
          date,
          includeRaw: options.includeRaw,
          plantId: (st as any).plantId ?? (st as any).plantID,
        });
        packetsSummary.push({
          stationId: res.stationId,
          stationName: res.stationName,
          deviceSn: res.deviceSn,
          pointsCount: res.pointsCount,
          action: res.action,
          activePowerKw: res.packet.latestTelemetry.realTimeActivePowerKw,
          activePowerUnit: "kW",
          durationMs: res.durationMs,
        });
      } catch (err: any) {
        packetsSummary.push({
          stationId: st.id,
          stationName: st.name,
          deviceSn: "N/A",
          pointsCount: 0,
          action: "failed",
          error: err.message,
        });
      }
    }

    const durationMs = Date.now() - overallStartTime;

    return {
      success: true,
      syncTimestamp: new Date().toISOString(),
      totalStations: stations.length,
      syncedPackets: packetsSummary.filter((p) => p.action !== "failed").length,
      durationMs,
      packets: packetsSummary,
    };
  }

  /**
   * Retrieves a saved packet from MongoDB ResidentialAPI collection by stationId
   */
  public async getSavedPacket(stationIdParam: string | number, date?: string): Promise<StationPacket | null> {
    const stationId = parseInt(String(stationIdParam), 10);
    const collection = await getResidentialCollection();

    if (date) {
      return (await collection.findOne({ stationId, date }, { projection: { _id: 0 } })) as StationPacket | null;
    }

    return (await collection.findOne(
      { stationId },
      { sort: { updatedAt: -1 }, projection: { _id: 0 } }
    )) as StationPacket | null;
  }

  /**
   * Retrieves all saved packets from MongoDB ResidentialAPI collection
   */
  public async getAllSavedPackets(date?: string): Promise<StationPacket[]> {
    const collection = await getResidentialCollection();
    const query = date ? { date } : {};
    return (await collection
      .find(query, { projection: { _id: 0 } })
      .sort({ stationId: 1 })
      .toArray()) as unknown as StationPacket[];
  }

  public async getResidentialPlants(): Promise<Array<{
    plantId: string;
    stationId: number;
    stationName: string;
    deviceSn: string;
    installedCapacityKw: number;
    status: StationPacket["latestTelemetry"]["status"];
  }>> {
    const collection = await getResidentialCollection();
    const packets = await collection.find(
      {},
      {
        projection: {
          _id: 0,
          plantId: 1,
          stationId: 1,
          stationName: 1,
          deviceSn: 1,
          "latestTelemetry.installedCapacityKw": 1,
          "latestTelemetry.status": 1,
          updatedAt: 1,
        },
      }
    ).sort({ updatedAt: -1 }).toArray() as unknown as Array<StationPacket & { updatedAt?: Date }>;

    return Array.from(new Map(
      packets.map((packet) => [
        packet.plantId || `deye:${packet.stationId}`,
        {
          // Older packets do not have a CMS plant mapping yet. Use a stable
          // Deye namespace until the explicit plantId mapping is available.
          plantId: packet.plantId || `deye:${packet.stationId}`,
          stationId: packet.stationId,
          stationName: packet.stationName,
          deviceSn: packet.deviceSn,
          installedCapacityKw: packet.latestTelemetry.installedCapacityKw,
          status: packet.latestTelemetry.status,
        },
      ])
    ).values());
  }

  /**
   * Reads the dashboard snapshot and aggregates persisted daily packets.
   * This intentionally never calls Deye Cloud; ingestion is handled by the
   * scheduled sync process.
   */
  public async getDashboardData(
    stationIdParam?: string | number,
    date?: string,
    stationName?: string
  ): Promise<ResidentialDashboardData | null> {
    const collection = await getResidentialCollection();
    const parsedStationId = stationIdParam ? parseInt(String(stationIdParam), 10) : undefined;
    const stationId =
      parsedStationId && !Number.isNaN(parsedStationId) ? parsedStationId : undefined;

    let packet = (await collection.findOne(
      {
        ...(stationId ? { stationId } : {}),
        ...(stationName
          ? {
              stationName: {
                $regex: `^${stationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
                $options: "i",
              },
            }
          : {}),
        ...(date ? { date } : {}),
      },
      {
        sort: { updatedAt: -1 },
        projection: { _id: 0 },
      }
    )) as StationPacket | null;

    if (!packet && stationName) {
      packet = (await collection.findOne(
        {
          stationName: { $regex: `^${stationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
          ...(date ? { date } : {}),
        },
        { sort: { updatedAt: -1 }, projection: { _id: 0 } }
      )) as StationPacket | null;
    }

    // Compatibility mode: until CMS plants are mapped to Deye stations, use
    // the newest persisted packet for the requested date when the selector
    // has no match. Never substitute a different date.
    if (!packet) {
      packet = (await collection.findOne(
        date ? { date } : {},
        { sort: { updatedAt: -1 }, projection: { _id: 0 } }
      )) as StationPacket | null;
    }

    if (!packet) {
      return null;
    }

    const packetDatePrefix = (date || packet.date).slice(0, 7);
    const periodPackets = (await collection
      .find(
        {
          stationId: packet.stationId,
          date: { $regex: `^${packetDatePrefix}` },
        },
        {
          projection: {
            _id: 0,
            date: 1,
            production: 1,
            latestTelemetry: 1,
          },
        }
      )
      .toArray()) as unknown as Pick<StationPacket, "date" | "production" | "latestTelemetry">[];

    const allPackets = (await collection
      .find(
        { stationId: packet.stationId },
        { projection: { _id: 0, latestTelemetry: 1 } }
      )
      .sort({ updatedAt: -1 })
      .limit(1)
      .toArray()) as unknown as Pick<StationPacket, "latestTelemetry">[];

    const stationPackets = (await collection
      .find(
        {},
        {
          projection: {
            _id: 0,
            stationId: 1,
            stationName: 1,
            deviceSn: 1,
            updatedAt: 1,
            "latestTelemetry.installedCapacityKw": 1,
            "latestTelemetry.status": 1,
          },
        }
      )
      .sort({ updatedAt: -1 })
      .toArray()) as unknown as Array<Pick<StationPacket, "stationId" | "stationName" | "deviceSn" | "latestTelemetry">>;
    const availableStations = Array.from(
      new Map(
        stationPackets.map((item) => [
          item.stationId,
          {
            stationId: item.stationId,
            stationName: item.stationName,
            deviceSn: item.deviceSn,
            installedCapacityKw: item.latestTelemetry.installedCapacityKw,
            status: item.latestTelemetry.status,
          },
        ])
      ).values()
    );

    const dailyGridFeedInKwh = periodPackets.reduce(
      (sum, item) => sum + (item.latestTelemetry?.dailyProduction || 0),
      0
    );
    const latestLifetime = allPackets[0]?.latestTelemetry?.totalProductionMwh || packet.latestTelemetry.totalProductionMwh;
    const latestDeviceMetrics = packet.latestTelemetry.deviceMetrics || {};
    const dailyConsumptionKwh =
      latestDeviceMetrics.TotalConsumption?.value ?? packet.points.at(-1)?.consumptionPower ?? 0;
    const cumulativeConsumptionMwh =
      typeof latestDeviceMetrics.TotalConsumption?.value === "number"
        ? latestDeviceMetrics.TotalConsumption.value / 1000
        : 0;

    return {
      packet,
      availableStations,
      summary: {
        monthlyProductionMwh: Number((dailyGridFeedInKwh / 1000).toFixed(3)),
        lifetimeProductionMwh: latestLifetime,
        dailyGridFeedInKwh: packet.latestTelemetry.dailyProductionKwh,
        cumulativeGridFeedInMwh: packet.latestTelemetry.totalProductionMwh,
        dailyConsumptionKwh,
        cumulativeConsumptionMwh,
      },
    };
  }

  /**
   * Purges legacy "packetName" field across all documents in MongoDB
   */
  public async purgeLegacyPacketNameField(): Promise<number> {
    try {
      const collection = await getResidentialCollection();
      const res = await collection.updateMany(
        { packetName: { $exists: true } },
        { $unset: { packetName: "" } }
      );
      return res.modifiedCount;
    } catch {
      return 0;
    }
  }
}
