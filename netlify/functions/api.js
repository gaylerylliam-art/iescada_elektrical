import { generateAlarms } from "../../backend/src/services/alarms.js";
import { enrichTelemetry } from "../../backend/src/services/capacity.js";
import { config as appConfig } from "../../backend/src/config.js";
import { createConnector } from "../../backend/src/connectors/index.js";
import { parseCsv } from "../../backend/src/utils/csv.js";
import { signToken, verifyToken } from "../../backend/src/middleware/auth.js";
import { store, verifyPassword } from "../../backend/src/store/inMemoryStore.js";

const connector = createConnector(appConfig.telemetrySource, appConfig);
let initialized = false;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

export default async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  await initializeTelemetry();

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === "/health" && request.method === "GET") {
      return json({ ok: true, source: appConfig.telemetrySource });
    }

    if (path === "/api/auth/login" && request.method === "POST") {
      const { email, password } = await request.json();
      const user = store.findUserByEmail(email);
      if (!user || !verifyPassword(user, password || "")) {
        return json({ error: "Invalid email or password" }, 401);
      }
      store.addAuditLog({ action: "user_login", userId: user.id, email: user.email });
      const token = signToken({ id: user.id, email: user.email, role: user.role });
      return json({ token, user: { id: user.id, email: user.email, role: user.role } });
    }

    const user = authenticate(request);
    if (!user) return json({ error: "Authentication required" }, 401);

    if (path === "/api/substations" && request.method === "GET") {
      const rows = store.listSubstations().map((substation) => withTelemetrySummary(substation));
      return json(applySubstationQuery(rows, Object.fromEntries(url.searchParams)));
    }

    if (path === "/api/substations" && request.method === "POST") {
      if (!hasRole(user, ["Admin", "Engineer"])) return json({ error: "Insufficient role" }, 403);
      const body = sanitizeMetadata(await request.json());
      if (!body.name || !body.region || !body.voltageLevelKv || !body.ratedMva) {
        return json({ error: "name, region, voltageLevelKv, and ratedMva are required" }, 400);
      }
      const substation = store.upsertSubstation(body);
      store.addAuditLog({ action: "metadata_change", userId: user.id, substationId: substation.id });
      return json(substation, 201);
    }

    const historyMatch = path.match(/^\/api\/substations\/([^/]+)\/history$/);
    if (historyMatch && request.method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit") || 96), 288);
      return json(store.getHistory(historyMatch[1], limit));
    }

    const telemetryMatch = path.match(/^\/api\/substations\/([^/]+)\/telemetry$/);
    if (telemetryMatch && request.method === "GET") {
      if (!store.getSubstation(telemetryMatch[1])) return json({ error: "Substation not found" }, 404);
      return json(store.getLatestTelemetry(telemetryMatch[1]) || null);
    }

    const substationMatch = path.match(/^\/api\/substations\/([^/]+)$/);
    if (substationMatch && request.method === "GET") {
      const substation = store.getSubstation(substationMatch[1]);
      if (!substation) return json({ error: "Substation not found" }, 404);
      return json(withTelemetrySummary(substation));
    }

    if (path === "/api/alarms" && request.method === "GET") {
      const includeHistorical = url.searchParams.get("history") === "true";
      return json(includeHistorical ? store.listHistoricalAlarms() : store.listActiveAlarms());
    }

    const acknowledgeMatch = path.match(/^\/api\/alarms\/([^/]+)\/acknowledge$/);
    if (acknowledgeMatch && request.method === "POST") {
      if (!hasRole(user, ["Admin", "Engineer"])) return json({ error: "Insufficient role" }, 403);
      const alarm = store.acknowledgeAlarm(acknowledgeMatch[1], user);
      if (!alarm) return json({ error: "Alarm not found" }, 404);
      store.addAuditLog({ action: "alarm_acknowledged", userId: user.id, alarmId: acknowledgeMatch[1] });
      return json(alarm);
    }

    if (path === "/api/audit-logs" && request.method === "GET") {
      if (!hasRole(user, ["Admin"])) return json({ error: "Insufficient role" }, 403);
      return json(store.listAuditLogs());
    }

    if (path === "/api/import/ratings" && request.method === "POST") {
      if (!hasRole(user, ["Admin", "Engineer"])) return json({ error: "Insufficient role" }, 403);
      const form = await request.formData();
      const file = form.get("file");
      if (!file) return json({ error: "CSV file is required" }, 400);
      const rows = parseCsv(await file.text());
      const imported = rows.map((row) => store.upsertSubstation({
        id: row.id,
        name: row.name,
        region: row.region,
        latitude: Number(row.latitude || 0),
        longitude: Number(row.longitude || 0),
        voltageLevelKv: Number(row.voltage_level_kv),
        ratedMva: Number(row.rated_mva),
        allowableMva: Number(row.allowable_mva || row.rated_mva),
        ratedCurrentA: Number(row.rated_current_a || 0),
        transformers: parseRatings(row.transformer_ratings_mva, "T"),
        feeders: parseRatings(row.feeder_ratings_mva, "F").map((item) => ({ name: item.id, ratingMva: item.ratingMva }))
      }));
      store.addAuditLog({ action: "ratings_import", userId: user.id, count: imported.length });
      return json({ imported: imported.length, substations: imported });
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error.message || "Request failed" }, 500);
  }
};

export const config = {
  path: ["/health", "/api/*"]
};

async function initializeTelemetry() {
  if (initialized) return;
  initialized = true;
  const substations = store.listSubstations();
  const rawTelemetry = await connector.readTelemetry(substations);
  const enriched = rawTelemetry.map((telemetry) => {
    const substation = store.getSubstation(telemetry.substationId);
    return enrichTelemetry(substation, telemetry, appConfig.staleTelemetrySeconds);
  });
  store.saveTelemetry(enriched);
  for (const telemetry of enriched) {
    const substation = store.getSubstation(telemetry.substationId);
    store.replaceActiveAlarmsForSubstation(substation.id, generateAlarms(substation, telemetry));
  }
}

function authenticate(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return verifyToken(token);
}

function hasRole(user, roles) {
  return roles.includes(user.role);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function withTelemetrySummary(substation) {
  const telemetry = store.getLatestTelemetry(substation.id);
  const activeAlarms = store.listActiveAlarms().filter((alarm) => alarm.substationId === substation.id);
  return {
    ...substation,
    telemetry,
    alarms: activeAlarms,
    alarmStatus: activeAlarms.some((alarm) => alarm.severity === "Critical") ? "Critical" : activeAlarms.length ? "Warning" : "Normal"
  };
}

function applySubstationQuery(rows, query) {
  const search = String(query.search || "").toLowerCase();
  const region = String(query.region || "");
  const status = String(query.status || "");
  const alarm = String(query.alarm || "");
  const sort = String(query.sort || "name");
  return rows.filter((row) => {
    const matchesSearch = !search || `${row.name} ${row.region} ${row.voltageLevelKv}`.toLowerCase().includes(search);
    const matchesRegion = !region || row.region === region;
    const matchesStatus = !status || row.telemetry?.status === status;
    const matchesAlarm = !alarm || row.alarmStatus === alarm;
    return matchesSearch && matchesRegion && matchesStatus && matchesAlarm;
  }).sort((a, b) => {
    if (sort === "loading") return (b.telemetry?.loadingPercent || 0) - (a.telemetry?.loadingPercent || 0);
    if (sort === "voltage") return a.voltageLevelKv - b.voltageLevelKv;
    if (sort === "alarm") return a.alarmStatus.localeCompare(b.alarmStatus);
    return a.name.localeCompare(b.name);
  });
}

function sanitizeMetadata(body) {
  return {
    id: body.id,
    name: String(body.name || "").slice(0, 120),
    region: String(body.region || "").slice(0, 80),
    latitude: Number(body.latitude || 0),
    longitude: Number(body.longitude || 0),
    voltageLevelKv: Number(body.voltageLevelKv),
    ratedMva: Number(body.ratedMva),
    allowableMva: Number(body.allowableMva || body.ratedMva),
    ratedCurrentA: Number(body.ratedCurrentA || 0),
    transformers: Array.isArray(body.transformers) ? body.transformers : [],
    feeders: Array.isArray(body.feeders) ? body.feeders : []
  };
}

function parseRatings(value, prefix) {
  return String(value || "").split(/[|;]/).filter(Boolean).map((rating, index) => ({
    id: `${prefix}${index + 1}`,
    ratingMva: Number(rating)
  }));
}
