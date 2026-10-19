/**
 * Complete Deye Cloud OpenAPI 2.0 Types
 * Base URL: https://india-developer.deyecloud.com
 */

export interface DeyeApiResponse<T = any> {
  code: string | number;
  msg: string;
  requestId: string;
  success: boolean;
  data?: T;
  [key: string]: any;
}

// -------------------------------------------------------------
// Account Operation Types
// -------------------------------------------------------------
export interface DeyeTokenRequest {
  appSecret: string;
  email?: string;
  username?: string;
  mobile?: string;
  countryCode?: string;
  companyId?: string | number;
  password: string; // SHA-256 hashed
}

export interface DeyeTokenResponse extends DeyeApiResponse {
  accessToken?: string;
  tokenType?: string;
  refreshToken?: string;
  expiresIn?: string | number;
  scope?: string;
  uid?: number;
}

export interface DeyeAccountOrgInfo {
  companyId: number;
  companyName: string;
  roleName: string;
}

export interface DeyeAccountOrgInfoResponse extends DeyeApiResponse {
  orgInfoList?: DeyeAccountOrgInfo[];
}

// -------------------------------------------------------------
// Station Operation Types
// -------------------------------------------------------------
export interface DeyeStationListRequest {
  page?: number;
  size?: number;
}

export interface DeyeStationDetailItem {
  id: number;
  name: string;
  installedCapacity: number;
  batterySOC?: number;
  connectionStatus?: "NORMAL" | "NO_DEVICE" | "ALL_OFFLINE" | "PARTIAL_OFFLINE";
  generationPower?: number;
  gridInterconnectionType?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  ownerName?: string;
  contactPhone?: string;
  countryCode?: string;
  regionNationId?: number;
  regionTimezone?: string;
  createdDate?: string;
  lastUpdateTime?: string;
  startOperatingTime?: string;
}

export interface DeyeStationListResponse extends DeyeApiResponse {
  stationList?: DeyeStationDetailItem[];
  stationTotal?: number;
}

export interface DeyeStationWithDeviceListRequest {
  page?: number;
  size?: number;
  deviceType?: string;
}

export interface DeyeDeviceListItem {
  deviceId?: number;
  deviceSn: string;
  deviceType: string;
  productId?: string;
  stationId?: number;
  connectStatus?: number;
  collectionTime?: number;
}

export interface DeyeStationWithDeviceDetailItem extends DeyeStationDetailItem {
  deviceListItems?: DeyeDeviceListItem[];
  deviceTotal?: number;
  type?: "HOUSE_ROOF" | "COMMERCIAL_ROOF" | "INDUSTRIAL_ROOF" | "GROUND";
}

export interface DeyeStationWithDeviceListResponse extends DeyeApiResponse {
  stationList?: DeyeStationWithDeviceDetailItem[];
  stationTotal?: number;
}

export interface DeyeStationDetailRequest {
  stationId: number;
}

export interface DeyeStationDetailResponse extends DeyeApiResponse {
  station?: DeyeStationDetailItem;
}

export interface DeyeStationDeviceListRequest {
  stationIds: number[];
  page?: number;
  size?: number;
}

export interface DeyeStationDeviceListResponse extends DeyeApiResponse {
  deviceListItems?: DeyeDeviceListItem[];
  total?: number;
}

export interface DeyeStationLatestDataRequest {
  stationId: number;
}

export interface DeyeStationLatestDataResponse extends DeyeApiResponse {
  stationId?: number;
  generationPower?: number; // Current Solar Generation Power (kW)
  consumptionPower?: number; // Current House Load (kW)
  gridPower?: number; // Grid Active Power (kW)
  wirePower?: number;
  purchasePower?: number; // Power imported from grid (kW)
  batteryPower?: number; // Battery charging/discharging power (kW)
  batterySOC?: number; // Battery State of Charge (%)
  chargePower?: number; // Battery Charge Power (kW)
  dischargePower?: number; // Battery Discharge Power (kW)
  irradiateIntensity?: number; // Solar Irradiance Intensity (W/m2)
  lastUpdateTime?: string;
}

export interface DeyeStationHistoryDataRequest {
  stationId: number;
  granularity: 1 | 2 | 3 | 4; // 1: frame (15-min / interval), 2: day, 3: month, 4: year
  startAt: string; // e.g. "2026-10-16"
  endAt?: string;
}

export interface DeyeStationHistoryDataItem {
  timeStamp?: string;
  generationPower?: number;
  consumptionPower?: number;
  gridPower?: number;
  purchasePower?: number;
  wirePower?: number;
  chargePower?: number;
  dischargePower?: number;
  batteryPower?: number;
  batterySOC?: number;
  irradiateIntensity?: number;
  generationValue?: number;
  consumptionValue?: number;
  gridValue?: number;
  purchaseValue?: number;
  chargeValue?: number;
  dischargeValue?: number;
  fullPowerHours?: number;
  pr?: number; // Performance Ratio
  cpr?: number;
  year?: number;
  month?: number;
  day?: number;
}

export interface DeyeStationHistoryDataResponse extends DeyeApiResponse {
  stationDataItems?: DeyeStationHistoryDataItem[];
  total?: number;
}

export interface DeyeStationHistoryPowerRequest {
  stationId: number;
  startTimestamp: number; // 10-digit unix seconds
  endTimestamp: number;
}

export interface DeyeStationAlertListRequest {
  stationId: number;
  startTimestamp: number;
  endTimestamp: number;
  page?: number;
  size?: number;
}

export interface DeyeStationAlertItem {
  alertId?: string;
  alertCode?: string | number;
  alertName?: string;
  deviceId?: string;
  deviceSn?: string;
  deviceType?: string;
  impact?: number; // 0: No Impact, 1: Impact on Production, 2: Safety, 3: Both
  level?: number; // 0: Notice, 1: Warning, 2: Failure
  protocolName?: string;
  status?: number; // 1: Open, 0: Closed
  alertStartTime?: number;
  alertEndTime?: number;
}

export interface DeyeStationAlertListResponse extends DeyeApiResponse {
  stationAlertItems?: DeyeStationAlertItem[];
  total?: number;
}

export interface DeyeStationCreateRequest {
  name: string;
  currency: string;
  installedCapacity: number;
  gridInterconnectionType: string;
  locationAddress: string;
  locationLat: number;
  locationLng: number;
  region: {
    countryCode: string;
    timezone: string;
    [key: string]: any;
  };
  type?: "HOUSE_ROOF" | "COMMERCIAL_ROOF" | "INDUSTRIAL_ROOF" | "GROUND";
  constructionCost?: number;
  contactPhone?: string;
  ownerCompany?: string;
  ownerName?: string;
  startOperatingTime?: string;
}

export interface DeyeStationCreateResponse extends DeyeApiResponse {
  stationId?: number;
}

// -------------------------------------------------------------
// Device Operation Types
// -------------------------------------------------------------
export interface DeyeDeviceListRequest {
  page?: number;
  size?: number;
}

export interface DeyeDeviceDetailItem {
  deviceId: number;
  deviceSn: string;
  deviceType: string;
  deviceState: number; // 1: Online, 2: Alert, 3: Offline
  productId?: string;
  updateTime?: number;
}

export interface DeyeDeviceListResponse extends DeyeApiResponse {
  deviceList?: DeyeDeviceDetailItem[];
  total?: number;
}

export interface DeyeDeviceLatestRequest {
  deviceList: string[]; // up to 10 deviceSns
  deviceType?: string;
}

export interface DeyeDataPoint {
  key: string;
  value: string | number;
  unit?: string;
  name?: string;
}

export interface DeyeDeviceLatestData {
  deviceSn: string;
  deviceType?: string;
  deviceState?: number;
  collectionTime?: number;
  dataList?: DeyeDataPoint[];
}

export interface DeyeDeviceLatestResponse extends DeyeApiResponse {
  deviceDataList?: DeyeDeviceLatestData[];
}

export interface DeyeDeviceMeasurePointsRequest {
  deviceSn: string;
  deviceType?: string;
}

export interface DeyeDeviceMeasurePointsResponse extends DeyeApiResponse {
  deviceSn?: string;
  deviceType?: string;
  productId?: string;
  timeZone?: string;
  measurePoints?: string[];
}

export interface DeyeDeviceHistoryDataRequest {
  deviceSn: string;
  granularity: 1 | 2 | 3 | 4;
  startAt: string;
  endAt?: string;
  measurePoints?: string[];
  deviceType?: string;
}

export interface DeyeDeviceHistoryDataItem {
  time?: string;
  collectionTime?: string;
  itemList?: DeyeDataPoint[];
}

export interface DeyeDeviceHistoryDataResponse extends DeyeApiResponse {
  deviceSn?: string;
  deviceId?: number;
  deviceType?: string;
  granularity?: number;
  dataList?: DeyeDeviceHistoryDataItem[];
}

export interface DeyeDeviceHistoryPowerRequest {
  deviceSn: string;
  startTimestamp: number;
  endTimestamp: number;
  measurePoints: string[];
  deviceType?: string;
}

export interface DeyeDeviceAlertListRequest {
  startTimestamp: number;
  endTimestamp: number;
  deviceSn?: string;
  deviceType?: string;
  page?: number;
  size?: number;
}

export interface DeyeDeviceAlertItem {
  alertId?: string;
  alertCode?: string | number;
  alertName?: string;
  description?: string;
  impact?: number;
  level?: number;
  protocolName?: string;
  reason?: string;
  solution?: string;
  status?: number;
  alertStartTime?: number;
  alertEndTime?: number;
}

export interface DeyeDeviceAlertListResponse extends DeyeApiResponse {
  deviceSn?: string;
  deviceId?: number;
  deviceType?: string;
  alertList?: DeyeDeviceAlertItem[];
  total?: number;
}

export interface DeyeDeviceRegisterRequest {
  deviceSn: string;
  gatewaySn: string;
  stationId: number;
}

export interface DeyeLoggerRequest {
  deviceSns: string[];
}

// -------------------------------------------------------------
// Configuration Operation Types
// -------------------------------------------------------------
export interface DeyeDeviceConfigPointRequest {
  deviceSn: string;
}

export interface DeyeDeviceBatterySettingsResponse extends DeyeApiResponse {
  battCapacity?: number;
  battLowCapacity?: number;
  battShutDownCapacity?: number;
  maxChargeCurrent?: number;
  maxDischargeCurrent?: number;
}

export interface DeyeDeviceSystemWorkModeResponse extends DeyeApiResponse {
  energyPattern?: string;
  systemWorkMode?: string;
  maxSellPower?: number;
  maxSolarPower?: number;
  zeroExportPower?: number;
}

export interface DeyeTimeOfUseItem {
  enableGeneration: boolean;
  enableGridCharge: boolean;
  power: number;
  soc: number;
  time: string;
  voltage?: number;
}

export interface DeyeDeviceTimeOfUseResponse extends DeyeApiResponse {
  touAction?: string;
  timeUseSettingItems?: DeyeTimeOfUseItem[];
}

// -------------------------------------------------------------
// Control Operation Types
// -------------------------------------------------------------
export interface DeyeDeviceControlResponse extends DeyeApiResponse {
  orderId?: number;
  connectionStatus?: number;
  collectionTime?: number;
}

export interface DeyeBatteryModeControlRequest {
  deviceSn: string;
  batteryModeType: "GRID_CHARGE" | "GEN_CHARGE";
  action: "on" | "off";
}

export interface DeyeBatteryParameterUpdateRequest {
  deviceSn: string;
  paramterType: "MAX_CHARGE_CURRENT" | "MAX_DISCHARGE_CURRENT" | "GRID_CHARGE_AMPERE" | "BATT_LOW";
  value: number;
}

export interface DeyeBatteryTypeUpdateRequest {
  deviceSn: string;
  batteryType: "BATT_V" | "BATT_SOC" | "LI" | "NO_BATTERY";
}

export interface DeyeCustomControlRequest {
  deviceSn: string;
  content: string; // modbus hex command string
  timeoutSeconds?: number;
}

export interface DeyeGridPeakShavingRequest {
  deviceSn: string;
  action: "on" | "off";
  power?: number;
}

export interface DeyeSmartLoadRequest {
  deviceSn: string;
  deviceType?: string;
  offSOC?: number;
  offVoltage?: number;
  onSOC?: number;
  onVoltage?: number;
  onGridAlwaysOn?: boolean;
}

export interface DeyeEnergyPatternUpdateRequest {
  deviceSn: string;
  energyPattern: "BATTERY_FIRST" | "LOAD_FIRST";
}

export interface DeyeLimitControlRequest {
  deviceSn: string;
  limitControlFunctionType: "SELL_FIRST" | "ZERO_EXPORT_TO_UPS_LOAD" | "ZERO_EXPORT_TO_CT" | "ZERO_EXPORT_TO_WIRELESS_CT";
}

export interface DeyeSystemPowerUpdateRequest {
  deviceSn: string;
  powerType: "MAX_SELL_POWER" | "MAX_SOLAR_POWER" | "ZERO_EXPORT_POWER";
  value: number;
}

export interface DeyeSolarSellControlRequest {
  deviceSn: string;
  action: "on" | "off";
}

export interface DeyeTOUSwitchRequest {
  deviceSn: string;
  action: "on" | "off";
  days?: ("MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY")[];
}

export interface DeyeTimeUseSettingItem {
  enableGeneration: boolean;
  enableGridCharge: boolean;
  enableSell?: boolean;
  power: number;
  soc: number;
  time: string;
  voltage?: number;
}

export interface DeyeTOUUpdateRequest {
  deviceSn: string;
  timeUseSettingItems: DeyeTimeUseSettingItem[];
}

export interface DeyeSystemWorkModeUpdateRequest {
  deviceSn: string;
  workMode: "SELLING_FIRST" | "ZERO_EXPORT_TO_LOAD" | "ZERO_EXPORT_TO_CT" | "GREEN_POWER_MODE" | "FULL_CHARGE_MODE" | "CUSTOMIZED_MODE";
}

export interface DeyeOrderRecordResponse extends DeyeApiResponse {
  orderId?: number;
  status?: number; // 0: To be sent, 100: Sending, 300: Upgrade, 400: Terminated, 500: Failed, 666: Succeeded
  orderResult?: string;
  analysisResult?: string;
  error?: string;
  createTime?: string;
  updateTime?: string;
}

// -------------------------------------------------------------
// Strategy Operation Types
// -------------------------------------------------------------
export interface DeyeDynamicControlRequest {
  deviceSn: string;
  gridChargeAction?: "on" | "off";
  gridChargeAmpere?: number;
  maxChargeCurrent?: number;
  maxDischargeCurrent?: number;
  maxSellPower?: number;
  maxSolarPower?: number;
  solarSellAction?: "on" | "off";
  timeUseSettingItems?: DeyeTimeUseSettingItem[];
  touAction?: "on" | "off";
  touDays?: string[];
  workMode?: string;
  zeroExportPower?: number;
}

export interface DeyeDynamicReadRequest {
  deviceSn: string;
}

export interface DeyeDynamicReadResultRequest {
  orderId: number;
}

export interface DeyeDynamicConfigResponse extends DeyeApiResponse {
  gridChargeAction?: string;
  gridChargeAmpere?: number;
  maxChargeCurrent?: number;
  maxDischargeCurrent?: number;
  maxSellPower?: number;
  maxSolarPower?: number;
  solarSellAction?: string;
  timeUseSettingItems?: DeyeTimeUseSettingItem[];
  touAction?: string;
  touDays?: string[];
  workMode?: string;
  zeroExportPower?: number;
}
