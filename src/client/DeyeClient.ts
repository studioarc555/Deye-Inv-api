import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import crypto from "crypto";
import {
  DeyeTokenRequest,
  DeyeTokenResponse,
  DeyeAccountOrgInfoResponse,
  DeyeStationListRequest,
  DeyeStationListResponse,
  DeyeStationWithDeviceListRequest,
  DeyeStationWithDeviceListResponse,
  DeyeStationDetailResponse,
  DeyeStationDeviceListResponse,
  DeyeStationLatestDataResponse,
  DeyeStationHistoryDataRequest,
  DeyeStationHistoryDataResponse,
  DeyeStationHistoryPowerRequest,
  DeyeStationAlertListRequest,
  DeyeStationAlertListResponse,
  DeyeStationCreateRequest,
  DeyeStationCreateResponse,
  DeyeDeviceListRequest,
  DeyeDeviceListResponse,
  DeyeDeviceLatestRequest,
  DeyeDeviceLatestResponse,
  DeyeDeviceMeasurePointsRequest,
  DeyeDeviceMeasurePointsResponse,
  DeyeDeviceHistoryDataRequest,
  DeyeDeviceHistoryDataResponse,
  DeyeDeviceHistoryPowerRequest,
  DeyeDeviceAlertListRequest,
  DeyeDeviceAlertListResponse,
  DeyeDeviceRegisterRequest,
  DeyeLoggerRequest,
  DeyeDeviceConfigPointRequest,
  DeyeDeviceBatterySettingsResponse,
  DeyeDeviceSystemWorkModeResponse,
  DeyeDeviceTimeOfUseResponse,
  DeyeDeviceControlResponse,
  DeyeBatteryModeControlRequest,
  DeyeBatteryParameterUpdateRequest,
  DeyeBatteryTypeUpdateRequest,
  DeyeCustomControlRequest,
  DeyeGridPeakShavingRequest,
  DeyeSmartLoadRequest,
  DeyeEnergyPatternUpdateRequest,
  DeyeLimitControlRequest,
  DeyeSystemPowerUpdateRequest,
  DeyeSolarSellControlRequest,
  DeyeTOUSwitchRequest,
  DeyeTOUUpdateRequest,
  DeyeSystemWorkModeUpdateRequest,
  DeyeOrderRecordResponse,
  DeyeDynamicControlRequest,
  DeyeDynamicReadRequest,
  DeyeDynamicReadResultRequest,
  DeyeDynamicConfigResponse,
} from "../types/deye.types.js";

export interface DeyeClientConfig {
  baseUrl?: string;
  appId?: string;
  appSecret?: string;
  email?: string;
  username?: string;
  mobile?: string;
  countryCode?: string;
  password?: string;
  companyId?: string | number;
  token?: string;
  timeoutMs?: number;
}

export interface DeyeExecutionResult<T = any> {
  success: boolean;
  statusCode: number;
  durationMs: number;
  data?: T;
  error?: string;
  requestId?: string;
  curlCommand?: string;
  timestamp: string;
}

export class DeyeClient {
  public baseUrl: string;
  public appId: string;
  public appSecret: string;
  public email?: string;
  public username?: string;
  public mobile?: string;
  public countryCode?: string;
  public password?: string;
  public companyId?: string | number;
  public token?: string;
  public timeoutMs: number;

  private http: AxiosInstance;

  constructor(config: DeyeClientConfig = {}) {
    this.baseUrl = (config.baseUrl || process.env.DEYE_BASE_URL || "https://india-developer.deyecloud.com").replace(/\/+$/, "");
    this.appId = config.appId || process.env.DEYE_APP_ID || "202610155771006";
    this.appSecret = config.appSecret || process.env.DEYE_APP_SECRET || "";
    this.email = config.email || process.env.DEYE_EMAIL;
    this.username = config.username || process.env.DEYE_USERNAME;
    this.mobile = config.mobile || process.env.DEYE_MOBILE;
    this.countryCode = config.countryCode || process.env.DEYE_COUNTRY_CODE;
    this.password = config.password || process.env.DEYE_PASSWORD;
    this.companyId = config.companyId ?? process.env.DEYE_COMPANY_ID ?? "0";
    this.token = config.token || process.env.DEYE_TOKEN;
    this.timeoutMs = config.timeoutMs || 30000;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Hashes string with SHA-256 as required by Deye OpenAPI,
   * or keeps it as-is if already a 64-character SHA-256 hex string.
   */
  public static hashPassword(rawPassword: string): string {
    if (/^[0-9a-f]{64}$/i.test(rawPassword.trim())) {
      return rawPassword.trim().toLowerCase();
    }
    return crypto.createHash("sha256").update(rawPassword, "utf8").digest("hex");
  }

  public setToken(token: string) {
    this.token = token.startsWith("Bearer ") ? token.substring(7) : token;
  }

  public getAuthorizationHeader(): string {
    if (!this.token) return "";
    return this.token.startsWith("Bearer ") ? this.token : `Bearer ${this.token}`;
  }

  /**
   * Generic low-level executor that times requests and formats results
   */
  public async execute<T = any>(
    method: "GET" | "POST",
    path: string,
    body?: any,
    queryParams?: Record<string, any>,
    requiresAuth: boolean = true
  ): Promise<DeyeExecutionResult<T>> {
    const startTime = Date.now();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (requiresAuth && this.token) {
      headers["authorization"] = this.getAuthorizationHeader();
    }

    const config: AxiosRequestConfig = {
      method,
      url: path,
      params: queryParams,
      headers,
      data: body,
      validateStatus: () => true, // Don't throw so we can inspect status codes cleanly
    };

    // Generate curl command for debugging/export
    const curlHeaders = Object.entries(headers)
      .map(([k, v]) => `-H "${k}: ${v}"`)
      .join(" ");
    const queryString = queryParams
      ? "?" + new URLSearchParams(queryParams as any).toString()
      : "";
    const curlBody = body ? `-d '${JSON.stringify(body)}'` : "";
    const curlCommand = `curl -X ${method} "${this.baseUrl}${path}${queryString}" ${curlHeaders} ${curlBody}`.trim();

    try {
      const response = await this.http.request(config);
      const durationMs = Date.now() - startTime;
      const isHttpSuccess = response.status >= 200 && response.status < 300;
      const deyeCode = response.data?.code;
      const isDeyeSuccess =
        deyeCode === 1000000 ||
        deyeCode === "1000000" ||
        response.data?.success === true;

      return {
        success: isHttpSuccess && isDeyeSuccess,
        statusCode: response.status,
        durationMs,
        data: response.data,
        requestId: response.data?.requestId,
        error: isHttpSuccess
          ? isDeyeSuccess
            ? undefined
            : response.data?.msg || `Deye error code: ${deyeCode}`
          : `HTTP ${response.status}: ${response.statusText}`,
        curlCommand,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        statusCode: err.response?.status || 500,
        durationMs,
        error: err.message || "Network Error",
        curlCommand,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // =========================================================================
  // 1. Account Operation
  // =========================================================================

  /**
   * POST /v1.0/account/token
   * Obtains access token using appId, appSecret, and hashed password
   */
  public async obtainToken(customParams?: Partial<DeyeTokenRequest> & { appId?: string }) {
    const targetAppId = customParams?.appId || this.appId;
    const rawPassword = this.password || "";
    const hashedPassword =
      customParams?.password || (rawPassword ? DeyeClient.hashPassword(rawPassword) : "");

    const payload: DeyeTokenRequest = {
      appSecret: customParams?.appSecret || this.appSecret,
      email: customParams?.email || this.email,
      username: customParams?.username || this.username,
      mobile: customParams?.mobile || this.mobile,
      countryCode: customParams?.countryCode || this.countryCode,
      companyId: customParams?.companyId ?? this.companyId,
      password: hashedPassword,
    };

    // Clean undefined fields
    Object.keys(payload).forEach((key) => {
      if ((payload as any)[key] === undefined) delete (payload as any)[key];
    });

    const res = await this.execute<DeyeTokenResponse>(
      "POST",
      "/v1.0/account/token",
      payload,
      { appId: targetAppId },
      false
    );

    if (res.data?.accessToken) {
      this.setToken(res.data.accessToken);
    }

    return res;
  }

  /**
   * POST /v1.0/account/info
   * Query relationship between account and the organization it belongs to
   */
  public async getAccountInfo() {
    return this.execute<DeyeAccountOrgInfoResponse>("POST", "/v1.0/account/info", {});
  }

  // =========================================================================
  // 2. Station Operation
  // =========================================================================

  /**
   * POST /v1.0/station/list
   * Fetch station list under the account
   */
  public async getStationList(page: number = 1, size: number = 20) {
    return this.execute<DeyeStationListResponse>("POST", "/v1.0/station/list", {
      page,
      size,
    });
  }

  /**
   * POST /v1.0/station/listWithDevice
   * Fetch station list under the account along with its devices
   */
  public async getStationListWithDevice(req: DeyeStationWithDeviceListRequest = {}) {
    return this.execute<DeyeStationWithDeviceListResponse>(
      "POST",
      "/v1.0/station/listWithDevice",
      {
        page: req.page || 1,
        size: req.size || 20,
        deviceType: req.deviceType,
      }
    );
  }

  /**
   * POST /v1.0/station/detail
   * Fetch detail of a single station
   */
  public async getStationDetail(stationId: number) {
    return this.execute<DeyeStationDetailResponse>("POST", "/v1.0/station/detail", {
      stationId,
    });
  }

  /**
   * POST /v1.0/station/device
   * Fetch device list of the station in batch (up to 10 stations per batch)
   */
  public async getStationDevices(stationIds: number[], page: number = 1, size: number = 20) {
    return this.execute<DeyeStationDeviceListResponse>("POST", "/v1.0/station/device", {
      stationIds,
      page,
      size,
    });
  }

  /**
   * POST /v1.0/station/latest
   * Fetch latest realtime telemetry of the station (PV power, load, battery, grid)
   */
  public async getStationLatest(stationId: number) {
    return this.execute<DeyeStationLatestDataResponse>("POST", "/v1.0/station/latest", {
      stationId,
    });
  }

  /**
   * POST /v1.0/station/history
   * Retrieve history data of the station (granularity 1=frame, 2=day, 3=month, 4=year)
   */
  public async getStationHistory(req: DeyeStationHistoryDataRequest) {
    return this.execute<DeyeStationHistoryDataResponse>("POST", "/v1.0/station/history", req);
  }

  /**
   * POST /v1.0/station/history/power
   * Retrieve power time-series of the station by 10-digit unix timestamps
   */
  public async getStationHistoryPower(req: DeyeStationHistoryPowerRequest) {
    return this.execute("POST", "/v1.0/station/history/power", req);
  }

  /**
   * POST /v1.0/station/alertList
   * Retrieve Alert List for stations
   */
  public async getStationAlertList(req: DeyeStationAlertListRequest) {
    return this.execute<DeyeStationAlertListResponse>("POST", "/v1.0/station/alertList", req);
  }

  /**
   * POST /v1.0/station/create
   * Create a station
   */
  public async createStation(req: DeyeStationCreateRequest) {
    return this.execute<DeyeStationCreateResponse>("POST", "/v1.0/station/create", req);
  }

  // =========================================================================
  // 3. Device Operation
  // =========================================================================

  /**
   * POST /v1.0/device/list
   * Fetch device list for business members
   */
  public async getDeviceList(page: number = 1, size: number = 20) {
    return this.execute<DeyeDeviceListResponse>("POST", "/v1.0/device/list", {
      page,
      size,
    });
  }

  /**
   * POST /v1.0/device/latest
   * Fetch latest data of devices in batch (up to 10 devices per batch)
   */
  public async getDeviceLatest(deviceList: string[], deviceType?: string) {
    return this.execute<DeyeDeviceLatestResponse>("POST", "/v1.0/device/latest", {
      deviceList,
      deviceType,
    });
  }

  /**
   * POST /v1.0/device/measurePoints
   * Fetch measure points according to deviceSn
   */
  public async getDeviceMeasurePoints(deviceSn: string, deviceType?: string) {
    return this.execute<DeyeDeviceMeasurePointsResponse>("POST", "/v1.0/device/measurePoints", {
      deviceSn,
      deviceType: deviceType || "INVERTER",
    });
  }

  /**
   * POST /v1.0/device/history
   * Retrieve device history data
   */
  public async getDeviceHistory(req: DeyeDeviceHistoryDataRequest) {
    return this.execute<DeyeDeviceHistoryDataResponse>("POST", "/v1.0/device/history", req);
  }

  /**
   * POST /v1.0/device/historyRaw
   * Retrieve device raw history power data by timestamp
   */
  public async getDeviceHistoryRaw(req: DeyeDeviceHistoryPowerRequest) {
    return this.execute("POST", "/v1.0/device/historyRaw", req);
  }

  /**
   * POST /v1.0/device/alertList
   * Retrieve device alert list
   */
  public async getDeviceAlertList(req: DeyeDeviceAlertListRequest) {
    return this.execute<DeyeDeviceAlertListResponse>("POST", "/v1.0/device/alertList", req);
  }

  /**
   * POST /v1.0/device/addLogger
   * Add loggers to business account (up to 10 per batch)
   */
  public async addLogger(deviceSns: string[]) {
    return this.execute("POST", "/v1.0/device/addLogger", { deviceSns });
  }

  /**
   * POST /v1.0/device/deleteLogger
   * Remove loggers from business account
   */
  public async deleteLogger(deviceSns: string[]) {
    return this.execute("POST", "/v1.0/device/deleteLogger", { deviceSns });
  }

  /**
   * POST /v1.0/device/register
   * Add datalogger into station
   */
  public async registerDevice(req: DeyeDeviceRegisterRequest) {
    return this.execute("POST", "/v1.0/device/register", req);
  }

  // =========================================================================
  // 4. Configuration Operation
  // =========================================================================

  /**
   * POST /v1.0/config/battery
   * Obtain battery-related parameters (battLowCapacity, battShutDownCapacity, maxChargeCurrent, maxDischargeCurrent)
   */
  public async getBatteryConfig(deviceSn: string) {
    return this.execute<DeyeDeviceBatterySettingsResponse>("POST", "/v1.0/config/battery", {
      deviceSn,
    });
  }

  /**
   * POST /v1.0/config/system
   * Obtain system work mode related parameters
   */
  public async getSystemWorkModeConfig(deviceSn: string) {
    return this.execute<DeyeDeviceSystemWorkModeResponse>("POST", "/v1.0/config/system", {
      deviceSn,
    });
  }

  /**
   * POST /v1.0/config/tou
   * Obtain time of use configuration
   */
  public async getTOUConfig(deviceSn: string) {
    return this.execute<DeyeDeviceTimeOfUseResponse>("POST", "/v1.0/config/tou", {
      deviceSn,
    });
  }

  // =========================================================================
  // 5. Control Operation
  // =========================================================================

  /**
   * POST /v1.0/order/battery/modeControl
   * Enable or disable chargeMode (GRID_CHARGE, GEN_CHARGE)
   */
  public async batteryModeControl(req: DeyeBatteryModeControlRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/battery/modeControl", req);
  }

  /**
   * POST /v1.0/order/battery/parameter/update
   * Set the value of battery-related parameter
   */
  public async batteryParameterUpdate(req: DeyeBatteryParameterUpdateRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/battery/parameter/update", req);
  }

  /**
   * POST /v1.0/order/battery/type/update
   * Set battery type (BATT_V, BATT_SOC, LI, NO_BATTERY)
   */
  public async batteryTypeUpdate(req: DeyeBatteryTypeUpdateRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/battery/type/update", req);
  }

  /**
   * POST /v1.0/order/customControl
   * Send command in Modbus protocol
   */
  public async customControl(req: DeyeCustomControlRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/customControl", req);
  }

  /**
   * POST /v1.0/order/gridPeakShaving/control
   * Enable/disable grid peak shaving
   */
  public async gridPeakShavingControl(req: DeyeGridPeakShavingRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/gridPeakShaving/control", req);
  }

  /**
   * POST /v1.0/order/smartload/update
   * Set parameter of smartload
   */
  public async smartLoadUpdate(req: DeyeSmartLoadRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/smartload/update", req);
  }

  /**
   * POST /v1.0/order/sys/energyPattern/update
   * Set energy pattern as BATTERY_FIRST or LOAD_FIRST
   */
  public async systemEnergyPatternUpdate(req: DeyeEnergyPatternUpdateRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/sys/energyPattern/update", req);
  }

  /**
   * POST /v1.0/order/sys/limitControl
   * Set limit control function (Micro ESS)
   */
  public async systemLimitControl(req: DeyeLimitControlRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/sys/limitControl", req);
  }

  /**
   * POST /v1.0/order/sys/power/update
   * Set the value for MAX_SELL_POWER or MAX_SOLAR_POWER
   */
  public async systemPowerUpdate(req: DeyeSystemPowerUpdateRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/sys/power/update", req);
  }

  /**
   * POST /v1.0/order/sys/solarSell/control
   * Enable or disable solar sell (action=on/off)
   */
  public async systemSolarSellControl(req: DeyeSolarSellControlRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/sys/solarSell/control", req);
  }

  /**
   * POST /v1.0/order/sys/tou/switch
   * Switch of TOU
   */
  public async systemTOUSwitch(req: DeyeTOUSwitchRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/sys/tou/switch", req);
  }

  /**
   * POST /v1.0/order/sys/tou/update
   * Set time of use for the device
   */
  public async systemTOUUpdate(req: DeyeTOUUpdateRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/sys/tou/update", req);
  }

  /**
   * POST /v1.0/order/sys/workMode/update
   * Set system work mode (SELLING_FIRST, ZERO_EXPORT_TO_LOAD, ZERO_EXPORT_TO_CT, etc.)
   */
  public async systemWorkModeUpdate(req: DeyeSystemWorkModeUpdateRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/order/sys/workMode/update", req);
  }

  /**
   * GET /v1.0/order/{orderId}
   * Get the result of command execution
   */
  public async getOrderById(orderId: number, language: string = "en") {
    return this.execute<DeyeOrderRecordResponse>(
      "GET",
      `/v1.0/order/${orderId}`,
      undefined,
      { language }
    );
  }

  // =========================================================================
  // 6. Strategy Operation
  // =========================================================================

  /**
   * POST /v1.0/strategy/dynamicControl
   * Dynamic Control
   */
  public async dynamicControl(req: DeyeDynamicControlRequest) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/strategy/dynamicControl", req);
  }

  /**
   * POST /v1.0/strategy/dynamicControl/read
   * Read dynamic control parameters (issues read order)
   */
  public async dynamicControlRead(deviceSn: string) {
    return this.execute<DeyeDeviceControlResponse>("POST", "/v1.0/strategy/dynamicControl/read", {
      deviceSn,
    });
  }

  /**
   * POST /v1.0/strategy/dynamicControl/readResult
   * Query the result of current dynamic control
   */
  public async dynamicControlReadResult(orderId: number) {
    return this.execute<DeyeDynamicConfigResponse>("POST", "/v1.0/strategy/dynamicControl/readResult", {
      orderId,
    });
  }
}
