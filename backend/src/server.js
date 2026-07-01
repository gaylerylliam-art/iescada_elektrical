import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { config } from "./config.js";
import { createConnector } from "./connectors/index.js";
import { store, verifyPassword } from "./store/inMemoryStore.js";
import { enrichTelemetry } from "./services/capacity.js";
import { generateAlarms } from "./services/alarms.js";
import { requireAuth, requireRole, signToken } from "./middleware/auth.js";
import { parseCsv } from "./utils/csv.js";

export const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const connector = createConnector(config.telemetrySource, config);
let telemetryStarted = false;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));

app.get("/health", (_req, res) => res.json({ ok: true, source: config.telemetrySource }));

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = store.findUserByEmail(email);
  if (!user || !verifyPassword(user, password || "")) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  store.addAuditLog({ action: "user_login", userId: user.id, email: user.email });
  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

app.use("/api", requireAuth);

app.get("/api/substations", (req, res) => {
  const rows = store.listSubstations().map((substation) => withTelemetrySummary(substation));
  res.json(applySubstationQuery(rows, req.query));
});

app.get("/api/substations/:id", (req, res) => {
  const substation = store.getSubstation(req.params.id);
  if (!substation) return res.status(404).json({ error: "Substation not found" });
  res.json(withTelemetrySummary(substation));
});

app.post("/api/substations", requireRole(["Admin", "Engineer"]), (req, res) => {
  const body = sanitizeMetadata(req.body);
  if (!body.name || !body.region || !body.voltageLevelKv || !body.ratedMva) {
    return res.status(400).json({ error: "name, region, voltageLevelKv, and ratedMva are required" });
  }
  const substation = store.upsertSubstation(body);
  store.addAuditLog({ action: "metadata_change", userId: req.user.id, substationId: substation.id });
  res.status(201).json(substation);
});

app.get("/api/substations/:id/telemetry", (req, res) => {
  const substation = store.getSubstation(req.params.id);
  if (!substation) return res.status(404).json({ error: "Substation not found" });
  res.json(store.getLatestTelemetry(req.params.id) || null);
});

app.get("/api/substations/:id/history", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 96), 288);
  res.json(store.getHistory(req.params.id, limit));
});

app.get("/api/alarms", (req, res) => {
  const includeHistorical = req.query.history === "true";
  res.json(includeHistorical ? store.listHistoricalAlarms() : store.listActiveAlarms());
});

app.post("/api/alarms/:id/acknowledge", requireRole(["Admin", "Engineer"]), (req, res) => {
  const alarm = store.acknowledgeAlarm(req.params.id, req.user);
  if (!alarm) return res.status(404).json({ error: "Alarm not found" });
  store.addAuditLog({ action: "alarm_acknowledged", userId: req.user.id, alarmId: req.params.id });
  res.json(alarm);
});

app.get("/api/audit-logs", requireRole(["Admin"]), (_req, res) => {
  res.json(store.listAuditLogs());
});

app.post("/api/import/ratings", requireRole(["Admin", "Engineer"]), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "CSV file is required" });
  const rows = parseCsv(req.file.buffer.toString("utf8"));
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
  store.addAuditLog({ action: "ratings_import", userId: req.user.id, count: imported.length });
  res.json({ imported: imported.length, substations: imported });
});

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
  let result = rows.filter((row) => {
    const matchesSearch = !search || `${row.name} ${row.region} ${row.voltageLevelKv}`.toLowerCase().includes(search);
    const matchesRegion = !region || row.region === region;
    const matchesStatus = !status || row.telemetry?.status === status;
    const matchesAlarm = !alarm || row.alarmStatus === alarm;
    return matchesSearch && matchesRegion && matchesStatus && matchesAlarm;
  });
  const sort = String(query.sort || "name");
  result = result.sort((a, b) => {
    if (sort === "loading") return (b.telemetry?.loadingPercent || 0) - (a.telemetry?.loadingPercent || 0);
    if (sort === "voltage") return a.voltageLevelKv - b.voltageLevelKv;
    if (sort === "alarm") return a.alarmStatus.localeCompare(b.alarmStatus);
    return a.name.localeCompare(b.name);
  });
  return result;
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

export async function ingestOnce() {
  const substations = store.listSubstations();
  try {
    const rawTelemetry = await connector.readTelemetry(substations);
    const enriched = rawTelemetry.map((telemetry) => {
      const substation = store.getSubstation(telemetry.substationId);
      return enrichTelemetry(substation, telemetry, config.staleTelemetrySeconds);
    });
    store.saveTelemetry(enriched);
    for (const telemetry of enriched) {
      const substation = store.getSubstation(telemetry.substationId);
      store.replaceActiveAlarmsForSubstation(substation.id, generateAlarms(substation, telemetry));
    }
  } catch (error) {
    store.addAuditLog({ action: "ingestion_error", message: error.message });
  }
}

export async function initializeTelemetry({ poll = false } = {}) {
  if (telemetryStarted) return;
  telemetryStarted = true;
  await connector.connect();
  await ingestOnce();
  if (poll) setInterval(ingestOnce, config.telemetryPollMs);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href) {
  await initializeTelemetry({ poll: true });
  app.listen(config.port, () => {
    console.log(`Substation Capacity Monitoring API listening on http://localhost:${config.port}`);
  });
}
