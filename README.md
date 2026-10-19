# Deye Inverter Telemetry & MongoDB Ingestion API (`deye-inv-api`)

A barebone, lightweight **Node.js API service** engineered for 24/7 autonomous telemetry ingestion from **Deye Cloud OpenAPI** directly into **MongoDB Atlas** (`myDatabase.ResidentialAPI`). 

Designed specifically for headless edge devices (such as a **Raspberry Pi**, Debian/Ubuntu server, or lightweight container) with zero UI overhead, minimal CPU/memory footprint, and automated 15-minute background synchronization.

---

## ⚡ Key Capabilities

* **Automated 15-Minute Sync Daemon:** Queries Deye Cloud OpenAPI on a recurring 15-minute timer, pulling 5-minute sampling interval curves (`granularity: 1`).
* **Complete KPI Units Attached:** Every single telemetry field carries its exact physical unit (`kW`, `kWh`, `kWp`, `MWh`, `V`, `A`, `Hz`, `°C`).
* **Dynamic Station Support:** Automatically discovers all registered plants and inverters under the Deye account, or syncs individual stations dynamically via API parameters.
* **Atomic MongoDB Upserts:** Documents are stored in MongoDB Atlas database `myDatabase`, collection `ResidentialAPI`, keyed by `{ stationId, date }` with `$unset` cleanup for legacy fields.
* **Headless & Barebone:** No dashboard frontend assets or browser overhead. Clean, high-performance REST API endpoints.
* **Edge & Raspberry Pi Ready:** Includes `systemd` service and `PM2` configurations for auto-restart on boot, crash recovery, and low memory consumption (< 80MB).

---

## 📊 Telemetry Data Packet Structure

Each station's intraday telemetry is atomically saved into MongoDB Atlas collection `ResidentialAPI` with full unit annotations:

```json
{
  "stationId": 13474,
  "stationName": "Cribs Hospital",
  "deviceSn": "2506051213",
  "date": "2026-10-19",
  "syncedAt": "2026-10-19T07:05:00.000Z",
  "updatedAt": "2026-10-19T07:05:00.000Z",

  "units": {
    "dtm": "YYYY-MM-DD HH:mm",
    "activePower": "kW",
    "production": "kWh",
    "gridPower": "kW",
    "consumptionPower": "kW",
    "realTimeActivePower": "kW",
    "installedCapacity": "kWp",
    "dailyProduction": "kWh",
    "totalProduction": "MWh"
  },

  "latestTelemetry": {
    "realTimeActivePower": 35.82,
    "realTimeActivePowerUnit": "kW",
    "installedCapacity": 58,
    "installedCapacityUnit": "kWp",
    "dailyProduction": 70.4,
    "dailyProductionUnit": "kWh",
    "totalProduction": 43.66,
    "totalProductionUnit": "MWh",
    "status": "normal",
    "lastUpdateTime": "2026-10-19 07:04:40"
  },

  "dtm": ["2026-10-19 10:30", "2026-10-19 10:35", "..."],
  "activePower": [30.54, 30.19, "..."],
  "production": [2.54, 5.06, "..."],
  "gridPower": [30.54, 30.19, "..."],
  "consumptionPower": [0.0, 0.0, "..."],

  "points": [
    {
      "dtm": "2026-10-19 10:30",
      "activePower": 30.54,
      "production": 2.54,
      "gridPower": 30.54,
      "consumptionPower": 0.0,
      "unitActivePower": "kW",
      "unitProduction": "kWh",
      "unitGridPower": "kW",
      "unitConsumptionPower": "kW"
    }
  ]
}
```

---

## 📡 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Root API service status and endpoint index |
| `GET` | `/api/health` | Deye OpenAPI client connection health & token status |
| `GET` | `/api/residential/db-status` | MongoDB Atlas connection health & document statistics |
| `GET` | `/api/residential/packets` | Retrieve all station documents from MongoDB (optional `?date=YYYY-MM-DD`) |
| `GET` | `/api/residential/packets/:stationId` | Retrieve saved telemetry document for a specific station (`?date=YYYY-MM-DD`) |
| `POST` | `/api/residential/sync-packets` | Trigger on-demand sync cycle for all stations into MongoDB |
| `POST` | `/api/residential/sync-packets/:stationId` | Trigger on-demand sync for a specific station (body or query `?date=YYYY-MM-DD`) |
| `GET` | `/api/residential/dashboard/overview` | Consolidated 7-card telemetry overview (`?plantId=:id&date=YYYY-MM-DD&period=M`) |

---

## 🍓 Raspberry Pi Deployment & Setup

### 1. Prerequisites (on Raspberry Pi)

Ensure Node.js 18+ or 20+ LTS is installed on your Raspberry Pi:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (via NodeSource LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Verify installation
node -v
npm -v
```

### 2. Clone and Install

```bash
# Clone the repository
git clone https://github.com/studioarc555/Deye-Inv-api.git
cd Deye-Inv-api

# Install production dependencies
npm install

# Configure environment variables
cp .env.example .env
nano .env

# Build TypeScript to native JavaScript
npm run build
```

### 3. Run Option A: PM2 Process Manager (Recommended)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start service using the provided ecosystem configuration
pm2 start ecosystem.config.cjs

# Save PM2 process list and configure auto-start on Raspberry Pi boot
pm2 save
pm2 startup
```

### 4. Run Option B: Systemd Service Daemon

```bash
# Copy systemd service file to system directory
sudo cp deye-api.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable service to run automatically on boot
sudo systemctl enable deye-api

# Start the service immediately
sudo systemctl start deye-api

# Check status and live logs
sudo systemctl status deye-api
sudo journalctl -u deye-api -f
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
PORT=4000

# Deye Cloud Developer API
DEYE_BASE_URL=https://india-developer.deyecloud.com
DEYE_APP_ID=202610155771006
DEYE_APP_SECRET=your_app_secret_here
DEYE_EMAIL=your_email@example.com
DEYE_USERNAME=your_username
DEYE_PASSWORD=your_password
DEYE_COMPANY_ID=0
DEYE_TOKEN=your_bearer_token

# Fallbacks (Optional)
DEFAULT_STATION_ID=13474
DEFAULT_DEVICE_SN=2506051213

# Automated 15-Minute Sync Background Daemon
AUTO_SYNC_ENABLED=true

# MongoDB Atlas
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/myDatabase?retryWrites=true&w=majority
MONGODB_DB_NAME=myDatabase
MONGODB_COLLECTION=ResidentialAPI
```

---

## 🧪 Testing

Run testing tools included in the repository:

```bash
# Test complete day's telemetry ingestion and print verified units
npm run test:day

# Run simulation test
npm run sync
```

---

## 📄 License

MIT License. Developed for Deye Solar Inverters & Energy Storage Systems.
