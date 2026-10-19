import { DeyeClient } from "../client/DeyeClient.js";

export interface EndpointDefinition {
  id: string;
  category: "Account" | "Station" | "Device" | "Configuration" | "Control" | "Strategy";
  method: "GET" | "POST";
  path: string;
  summary: string;
  description: string;
  isReadOnly: boolean;
  requiresAuth: boolean;
  defaultPayload: (defaults: {
    stationId?: number;
    deviceSn?: string;
    appSecret?: string;
    email?: string;
    orderId?: number;
  }) => {
    body?: any;
    params?: Record<string, any>;
  };
  execute: (client: DeyeClient, payload: any) => Promise<any>;
}

export const ENDPOINT_REGISTRY: EndpointDefinition[] = [
  // ==========================================
  // ACCOUNT OPERATION
  // ==========================================
  {
    id: "account_token",
    category: "Account",
    method: "POST",
    path: "/v1.0/account/token",
    summary: "Obtain token",
    description: "The token serves as the credential for accessing resources. Password must be SHA-256 hashed.",
    isReadOnly: true,
    requiresAuth: false,
    defaultPayload: (d) => ({
      params: { appId: process.env.DEYE_APP_ID || "1dy_CvzohxYj" },
      body: {
        appSecret: d.appSecret || process.env.DEYE_APP_SECRET || "",
        email: d.email || process.env.DEYE_EMAIL || "",
        companyId: process.env.DEYE_COMPANY_ID || "0",
        password: process.env.DEYE_PASSWORD ? DeyeClient.hashPassword(process.env.DEYE_PASSWORD) : "",
      },
    }),
    execute: (c, p) => c.obtainToken(p.body),
  },
  {
    id: "account_info",
    category: "Account",
    method: "POST",
    path: "/v1.0/account/info",
    summary: "Query relationship between account and organization",
    description: "Query which company the account belongs to and the role of the account",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: () => ({ body: {} }),
    execute: (c) => c.getAccountInfo(),
  },

  // ==========================================
  // STATION OPERATION
  // ==========================================
  {
    id: "station_list",
    category: "Station",
    method: "POST",
    path: "/v1.0/station/list",
    summary: "Fetch station list under the account",
    description: "Retrieve paginated list of stations",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: () => ({ body: { page: 1, size: 20 } }),
    execute: (c, p) => c.getStationList(p.body?.page, p.body?.size),
  },
  {
    id: "station_list_with_device",
    category: "Station",
    method: "POST",
    path: "/v1.0/station/listWithDevice",
    summary: "Fetch station list under the account along with its devices",
    description: "Fetch station list with devices (INVERTER, BATTERY, METER, etc.)",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: () => ({ body: { page: 1, size: 20, deviceType: "INVERTER" } }),
    execute: (c, p) => c.getStationListWithDevice(p.body),
  },
  {
    id: "station_detail",
    category: "Station",
    method: "POST",
    path: "/v1.0/station/detail",
    summary: "Fetch detail of a single station",
    description: "Fetch the detail of the station by a given stationId",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({ body: { stationId: d.stationId || 0 } }),
    execute: (c, p) => c.getStationDetail(p.body?.stationId),
  },
  {
    id: "station_device",
    category: "Station",
    method: "POST",
    path: "/v1.0/station/device",
    summary: "Fetch device list of the station in batch",
    description: "Fetch device list under stations (up to 10 stations per batch)",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({ body: { stationIds: [d.stationId || 0], page: 1, size: 20 } }),
    execute: (c, p) => c.getStationDevices(p.body?.stationIds || [], p.body?.page, p.body?.size),
  },
  {
    id: "station_latest",
    category: "Station",
    method: "POST",
    path: "/v1.0/station/latest",
    summary: "Fetch latest data of the station",
    description: "Retrieve real-time power, battery SOC, PV generation, load, and grid power",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({ body: { stationId: d.stationId || 0 } }),
    execute: (c, p) => c.getStationLatest(p.body?.stationId),
  },
  {
    id: "station_history",
    category: "Station",
    method: "POST",
    path: "/v1.0/station/history",
    summary: "Retrieve history data of the station",
    description: "Granularity 1=frame (15-min interval), 2=day, 3=month, 4=year",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => {
      const today = new Date().toISOString().slice(0, 10);
      return {
        body: {
          stationId: d.stationId || 13474,
          granularity: 1,
          startAt: today,
          endAt: today,
        },
      };
    },
    execute: (c, p) => c.getStationHistory(p.body),
  },
  {
    id: "station_history_power",
    category: "Station",
    method: "POST",
    path: "/v1.0/station/history/power",
    summary: "Retrieve history power by 10-digit Unix timestamp",
    description: "Fetch timestamp-based power telemetry for the station",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => {
      const now = Math.floor(Date.now() / 1000);
      return {
        body: {
          stationId: d.stationId || 0,
          startTimestamp: now - 86400,
          endTimestamp: now,
        },
      };
    },
    execute: (c, p) => c.getStationHistoryPower(p.body),
  },
  {
    id: "station_alert_list",
    category: "Station",
    method: "POST",
    path: "/v1.0/station/alertList",
    summary: "Retrieve Alert List for stations",
    description: "Fetch open alerts, warnings, and failures within a timestamp range (<= 180 days)",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => {
      const now = Math.floor(Date.now() / 1000);
      return {
        body: {
          stationId: d.stationId || 0,
          startTimestamp: now - 86400 * 30,
          endTimestamp: now,
          page: 1,
          size: 20,
        },
      };
    },
    execute: (c, p) => c.getStationAlertList(p.body),
  },
  {
    id: "station_create",
    category: "Station",
    method: "POST",
    path: "/v1.0/station/create",
    summary: "Create a station",
    description: "Register a new solar station in Deye Cloud",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: () => ({
      body: {
        name: "Test Solar Station",
        currency: "INR",
        installedCapacity: 10.5,
        gridInterconnectionType: "DISTRIBUTED_FULLY",
        locationAddress: "Solar Park Sector 1",
        locationLat: 28.6139,
        locationLng: 77.209,
        region: {
          countryCode: "IN",
          timezone: "Asia/Kolkata",
        },
        type: "HOUSE_ROOF",
      },
    }),
    execute: (c, p) => c.createStation(p.body),
  },

  // ==========================================
  // DEVICE OPERATION
  // ==========================================
  {
    id: "device_list",
    category: "Device",
    method: "POST",
    path: "/v1.0/device/list",
    summary: "Fetch device list for business members",
    description: "Retrieve all registered devices under the business account",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: () => ({ body: { page: 1, size: 20 } }),
    execute: (c, p) => c.getDeviceList(p.body?.page, p.body?.size),
  },
  {
    id: "device_latest",
    category: "Device",
    method: "POST",
    path: "/v1.0/device/latest",
    summary: "Fetch latest data of devices (batch up to 10)",
    description: "Query latest real-time measure points for up to 10 device serial numbers",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceList: [d.deviceSn || "SAMPLE_SN"],
        deviceType: "INVERTER",
      },
    }),
    execute: (c, p) => c.getDeviceLatest(p.body?.deviceList || [], p.body?.deviceType),
  },
  {
    id: "device_measure_points",
    category: "Device",
    method: "POST",
    path: "/v1.0/device/measurePoints",
    summary: "Fetch measure points according to deviceSn",
    description: "Retrieve available telemetry measure keys supported by this device model",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        deviceType: "INVERTER",
      },
    }),
    execute: (c, p) => c.getDeviceMeasurePoints(p.body?.deviceSn, p.body?.deviceType),
  },
  {
    id: "device_history",
    category: "Device",
    method: "POST",
    path: "/v1.0/device/history",
    summary: "Retrieve device history data",
    description: "Retrieve historical telemetry curves for specified measure points",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        deviceType: "INVERTER",
        granularity: 1,
        startAt: new Date().toISOString().slice(0, 10),
        measurePoints: ["generation", "AC_Active_Power", "SOC"],
      },
    }),
    execute: (c, p) => c.getDeviceHistory(p.body),
  },
  {
    id: "device_history_raw",
    category: "Device",
    method: "POST",
    path: "/v1.0/device/historyRaw",
    summary: "Retrieve device history data by timestamp",
    description: "Retrieve raw second-level history power within 5 days",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => {
      const now = Math.floor(Date.now() / 1000);
      return {
        body: {
          deviceSn: d.deviceSn || "SAMPLE_SN",
          startTimestamp: now - 3600 * 4,
          endTimestamp: now,
          measurePoints: ["AC_Active_Power"],
        },
      };
    },
    execute: (c, p) => c.getDeviceHistoryRaw(p.body),
  },
  {
    id: "device_alert_list",
    category: "Device",
    method: "POST",
    path: "/v1.0/device/alertList",
    summary: "Retrieve device alert list",
    description: "Retrieve alarm codes and fault history for a specific device",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => {
      const now = Math.floor(Date.now() / 1000);
      return {
        body: {
          deviceSn: d.deviceSn || "SAMPLE_SN",
          startTimestamp: now - 86400 * 7,
          endTimestamp: now,
          page: 1,
          size: 20,
        },
      };
    },
    execute: (c, p) => c.getDeviceAlertList(p.body),
  },
  {
    id: "device_add_logger",
    category: "Device",
    method: "POST",
    path: "/v1.0/device/addLogger",
    summary: "Add loggers to business account",
    description: "Attach up to 10 dataloggers to the business account",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({ body: { deviceSns: [d.deviceSn || "SAMPLE_LOGGER"] } }),
    execute: (c, p) => c.addLogger(p.body?.deviceSns || []),
  },
  {
    id: "device_delete_logger",
    category: "Device",
    method: "POST",
    path: "/v1.0/device/deleteLogger",
    summary: "Remove loggers from business account",
    description: "Remove dataloggers from the business account",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({ body: { deviceSns: [d.deviceSn || "SAMPLE_LOGGER"] } }),
    execute: (c, p) => c.deleteLogger(p.body?.deviceSns || []),
  },
  {
    id: "device_register",
    category: "Device",
    method: "POST",
    path: "/v1.0/device/register",
    summary: "Add datalogger into station",
    description: "Bind datalogger and inverter to a solar station",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "INVERTER_SN",
        gatewaySn: "LOGGER_SN",
        stationId: d.stationId || 0,
      },
    }),
    execute: (c, p) => c.registerDevice(p.body),
  },

  // ==========================================
  // CONFIGURATION OPERATION
  // ==========================================
  {
    id: "config_battery",
    category: "Configuration",
    method: "POST",
    path: "/v1.0/config/battery",
    summary: "Obtain battery-related parameter value",
    description: "Retrieve battCapacity, battLowCapacity, battShutDownCapacity, maxChargeCurrent, maxDischargeCurrent",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({ body: { deviceSn: d.deviceSn || "SAMPLE_SN" } }),
    execute: (c, p) => c.getBatteryConfig(p.body?.deviceSn),
  },
  {
    id: "config_system",
    category: "Configuration",
    method: "POST",
    path: "/v1.0/config/system",
    summary: "Obtain system work mode related parameter value",
    description: "Retrieve energyPattern, maxSellPower, maxSolarPower, systemWorkMode, zeroExportPower",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({ body: { deviceSn: d.deviceSn || "SAMPLE_SN" } }),
    execute: (c, p) => c.getSystemWorkModeConfig(p.body?.deviceSn),
  },
  {
    id: "config_tou",
    category: "Configuration",
    method: "POST",
    path: "/v1.0/config/tou",
    summary: "Obtain time of use configuration",
    description: "Retrieve TOU schedule, charging slots, power settings, and SOC limits",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({ body: { deviceSn: d.deviceSn || "SAMPLE_SN" } }),
    execute: (c, p) => c.getTOUConfig(p.body?.deviceSn),
  },

  // ==========================================
  // CONTROL OPERATION
  // ==========================================
  {
    id: "order_battery_mode_control",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/battery/modeControl",
    summary: "Enable or disable chargeMode",
    description: "Set chargeMode: GRID_CHARGE or GEN_CHARGE to on/off",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        batteryModeType: "GRID_CHARGE",
        action: "off",
      },
    }),
    execute: (c, p) => c.batteryModeControl(p.body),
  },
  {
    id: "order_battery_param_update",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/battery/parameter/update",
    summary: "Set value of battery-related parameter",
    description: "Set MAX_CHARGE_CURRENT, MAX_DISCHARGE_CURRENT, GRID_CHARGE_AMPERE, or BATT_LOW",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        paramterType: "MAX_CHARGE_CURRENT",
        value: 50,
      },
    }),
    execute: (c, p) => c.batteryParameterUpdate(p.body),
  },
  {
    id: "order_battery_type_update",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/battery/type/update",
    summary: "Set battery type",
    description: "Set battery chemistry: BATT_V, BATT_SOC, LI, NO_BATTERY",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        batteryType: "LI",
      },
    }),
    execute: (c, p) => c.batteryTypeUpdate(p.body),
  },
  {
    id: "order_custom_control",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/customControl",
    summary: "Send command in Modbus protocol",
    description: "Execute raw Modbus RTU hex sequence on the inverter",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        content: "0103000102ABCD",
        timeoutSeconds: 60,
      },
    }),
    execute: (c, p) => c.customControl(p.body),
  },
  {
    id: "order_grid_peak_shaving",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/gridPeakShaving/control",
    summary: "Enable/disable grid peak shaving",
    description: "Limits grid output power to set point; supplements with battery and PV",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        action: "off",
        power: 5000,
      },
    }),
    execute: (c, p) => c.gridPeakShavingControl(p.body),
  },
  {
    id: "order_smartload_update",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/smartload/update",
    summary: "Set parameter of smartload",
    description: "Configure auxiliary smartload on/off voltage or SOC thresholds",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        onSOC: 90,
        offSOC: 50,
      },
    }),
    execute: (c, p) => c.smartLoadUpdate(p.body),
  },
  {
    id: "order_energy_pattern_update",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/sys/energyPattern/update",
    summary: "Set energy pattern as BATTERY_FIRST or LOAD_FIRST",
    description: "Sets priority between charging battery first or supplying house loads first",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        energyPattern: "LOAD_FIRST",
      },
    }),
    execute: (c, p) => c.systemEnergyPatternUpdate(p.body),
  },
  {
    id: "order_limit_control",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/sys/limitControl",
    summary: "Set limit control function (Micro ESS)",
    description: "Options: SELL_FIRST, ZERO_EXPORT_TO_UPS_LOAD, ZERO_EXPORT_TO_CT, ZERO_EXPORT_TO_WIRELESS_CT",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        limitControlFunctionType: "SELL_FIRST",
      },
    }),
    execute: (c, p) => c.systemLimitControl(p.body),
  },
  {
    id: "order_power_update",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/sys/power/update",
    summary: "Set value for MAX_SELL_POWER or MAX_SOLAR_POWER",
    description: "Limits maximum power exported to grid or generated by solar panels",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        powerType: "MAX_SOLAR_POWER",
        value: 5000,
      },
    }),
    execute: (c, p) => c.systemPowerUpdate(p.body),
  },
  {
    id: "order_solar_sell_control",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/sys/solarSell/control",
    summary: "Enable or disable solarsell",
    description: "Permits or forbids selling excess solar energy back to the grid",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        action: "on",
      },
    }),
    execute: (c, p) => c.systemSolarSellControl(p.body),
  },
  {
    id: "order_tou_switch",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/sys/tou/switch",
    summary: "Switch of TOU",
    description: "Turn Time-Of-Use schedule on or off and specify active weekdays",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        action: "on",
        days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"],
      },
    }),
    execute: (c, p) => c.systemTOUSwitch(p.body),
  },
  {
    id: "order_tou_update",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/sys/tou/update",
    summary: "Set time of use for the device",
    description: "Sets 6 time intervals with power, target SOC, and grid charge rules",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        timeUseSettingItems: [
          { time: "01:00", power: 3000, soc: 80, enableGeneration: true, enableGridCharge: true },
          { time: "05:00", power: 3000, soc: 90, enableGeneration: true, enableGridCharge: true },
          { time: "09:00", power: 5000, soc: 40, enableGeneration: true, enableGridCharge: false },
          { time: "13:00", power: 5000, soc: 100, enableGeneration: true, enableGridCharge: false },
          { time: "17:00", power: 5000, soc: 40, enableGeneration: true, enableGridCharge: false },
          { time: "21:00", power: 3000, soc: 60, enableGeneration: true, enableGridCharge: false },
        ],
      },
    }),
    execute: (c, p) => c.systemTOUUpdate(p.body),
  },
  {
    id: "order_work_mode_update",
    category: "Control",
    method: "POST",
    path: "/v1.0/order/sys/workMode/update",
    summary: "Set system work mode",
    description: "Options: SELLING_FIRST, ZERO_EXPORT_TO_LOAD, ZERO_EXPORT_TO_CT",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        workMode: "ZERO_EXPORT_TO_LOAD",
      },
    }),
    execute: (c, p) => c.systemWorkModeUpdate(p.body),
  },
  {
    id: "order_get_result",
    category: "Control",
    method: "GET",
    path: "/v1.0/order/{orderId}",
    summary: "Get result of command execution",
    description: "Query status (666=succeeded, 500=failed) of an asynchronous control order",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({
      params: { orderId: d.orderId || 10001, language: "en" },
    }),
    execute: (c, p) => c.getOrderById(p.params?.orderId, p.params?.language),
  },

  // ==========================================
  // STRATEGY OPERATION
  // ==========================================
  {
    id: "strategy_dynamic_control",
    category: "Strategy",
    method: "POST",
    path: "/v1.0/strategy/dynamicControl",
    summary: "Dynamic Control",
    description: "Atomically update work mode, grid charging, power limits, and TOU settings",
    isReadOnly: false,
    requiresAuth: true,
    defaultPayload: (d) => ({
      body: {
        deviceSn: d.deviceSn || "SAMPLE_SN",
        gridChargeAction: "on",
        workMode: "SELLING_FIRST",
      },
    }),
    execute: (c, p) => c.dynamicControl(p.body),
  },
  {
    id: "strategy_dynamic_read",
    category: "Strategy",
    method: "POST",
    path: "/v1.0/strategy/dynamicControl/read",
    summary: "Read Dynamic Control parameters",
    description: "Issues asynchronous read command to fetch dynamic strategy registers",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({ body: { deviceSn: d.deviceSn || "SAMPLE_SN" } }),
    execute: (c, p) => c.dynamicControlRead(p.body?.deviceSn),
  },
  {
    id: "strategy_dynamic_read_result",
    category: "Strategy",
    method: "POST",
    path: "/v1.0/strategy/dynamicControl/readResult",
    summary: "Query the result of current Dynamic Control",
    description: "Query the result of dynamic strategy read using the orderId",
    isReadOnly: true,
    requiresAuth: true,
    defaultPayload: (d) => ({ body: { orderId: d.orderId || 10001 } }),
    execute: (c, p) => c.dynamicControlReadResult(p.body?.orderId),
  },
];
