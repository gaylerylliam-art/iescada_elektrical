# Substation Capacity Monitoring System

A monitoring-only web application for utility engineers and operators to view real-time and historical substation loading, capacity, alarms, and N-1 risk.

The system never sends breaker, relay, RTU, IED, or SCADA control commands. It is intentionally read-only for utility operations.

## Architecture

- **Frontend:** React + Vite dashboard for substations, filters, status indicators, alarm views, trend charts, and detail pages.
- **Backend:** Node.js + Express API with authentication, role checks, rate limiting, audit logs, CSV import, alarm generation, and modular telemetry connectors.
- **Data layer:** PostgreSQL schema with TimescaleDB-ready hypertables for telemetry and alarm events.
- **Development source:** Built-in simulated telemetry for 10 substations.
- **Real source adapters:** Connector classes for SCADA/EMS/DMS REST APIs, OPC UA, MQTT, data historians, CSV/Excel import, and simulation.

## Local Setup

1. Install Node.js 20+.
2. Copy backend environment settings:

   ```bash
   cp backend/.env.example backend/.env
   ```

3. Install dependencies:

   ```bash
   npm run install:all
   ```

4. Run the app:

   ```bash
   npm run dev
   ```

5. Open the frontend at `http://localhost:5173`.

Default users:

- `admin@utility.local` / `admin123` with Admin role
- `engineer@utility.local` / `engineer123` with Engineer role
- `viewer@utility.local` / `viewer123` with Viewer role

## Environment Variables

See [backend/.env.example](backend/.env.example).

Important settings:

- `PORT`: Backend API port.
- `JWT_SECRET`: HMAC signing secret for API sessions.
- `DATABASE_URL`: PostgreSQL connection string for production persistence.
- `TELEMETRY_SOURCE`: `simulated`, `scada_rest`, `opcua`, `mqtt`, or `historian`.
- Source-specific values such as `SCADA_REST_BASE_URL`, `OPCUA_ENDPOINT`, `MQTT_BROKER_URL`, and `HISTORIAN_BASE_URL`.

## Database

The schema is in [db/migrations/001_init.sql](db/migrations/001_init.sql). It includes:

- Substation metadata
- Transformer and feeder ratings
- Equipment IDs
- Time-series telemetry
- Alarm events
- Users, roles, and audit logs
- TimescaleDB hypertable creation where the extension is available

For local database setup:

```bash
createdb substation_capacity
psql "$DATABASE_URL" -f db/migrations/001_init.sql
```

The development server uses in-memory sample data so the dashboard works before PostgreSQL is connected.

## Capacity Calculations

Transformer loading:

```text
loading_percent = actual_mva / rated_mva * 100
```

Available capacity:

```text
available_capacity_mva = allowable_mva - actual_mva
```

Apparent power:

```text
mva = sqrt(mw^2 + mvar^2)
```

Current-based loading:

```text
loading_percent = actual_current / rated_current * 100
```

Status categories:

- Normal: 0-70%
- Watch: 70-85%
- Warning: 85-100%
- Overloaded: above 100%

N-1 analysis estimates whether remaining transformers can carry present load if the largest transformer is unavailable:

- **Pass:** Remaining capacity can carry the load with margin.
- **Warning:** Remaining capacity can carry the load, but margin is tight.
- **Fail:** Remaining capacity cannot carry the load.

## Connecting Real Utility Data Sources

The backend uses a connector pattern in `backend/src/connectors`. Each connector exposes:

- `connect()`
- `readTelemetry(substations)`
- `disconnect()`

To connect a real source:

1. Set `TELEMETRY_SOURCE` in `backend/.env`.
2. Fill in the required endpoint and credential environment variables.
3. Map external equipment IDs to `equipment_id` values in the `equipment` table.
4. Normalize source telemetry into the app telemetry shape:

   ```json
   {
     "substationId": "ss-north-01",
     "voltageKv": 132,
     "currentA": 840,
     "mw": 78.2,
     "mvar": 18.4,
     "transformerTempC": 78,
     "feederLoading": [{ "name": "F1", "loadingPercent": 63 }]
   }
   ```

The included SCADA REST, OPC UA, MQTT, and historian connectors are intentionally read-only. Do not add command/write endpoints to those connectors.

## Security Notes

- All API routes except login require a signed session token.
- Roles are Admin, Engineer, and Viewer.
- Admin and Engineer can manage metadata and import ratings.
- Viewer can only read data.
- API requests are rate-limited.
- Inputs are validated and sanitized at route boundaries.
- Credentials should be supplied through environment variables or a secrets manager.
- Password storage in the demo uses PBKDF2. Use a managed identity provider or hardened password policy for production.

## Monitoring-Only Boundary

This app is for observation, capacity analysis, alarms, and planning support. It deliberately excludes:

- Remote breaker open/close
- Switching operations
- Trip or reset commands
- Relay setting writes
- RTU, IED, or SCADA write-back

That boundary reduces operational risk and keeps the system suitable as a read-only engineering and control-room visibility layer.

## Future Improvements

- GIS map integration with utility service territories
- Weather-aware load forecasting
- Outage planning and contingency simulation
- Persistent ingestion workers with queue-backed retries
- Timescale continuous aggregates
- SSO/SAML/OIDC integration
- Per-region access controls
- Automated data quality scoring
