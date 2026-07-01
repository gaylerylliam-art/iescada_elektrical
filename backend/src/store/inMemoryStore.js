import crypto from "node:crypto";
import { sampleSubstations } from "../data/sampleSubstations.js";

const substations = new Map(sampleSubstations.map((substation) => [substation.id, structuredClone(substation)]));
const latestTelemetry = new Map();
const telemetryHistory = new Map();
const activeAlarms = new Map();
const historicalAlarms = [];
const auditLogs = [];

const users = [
  createUser("u-admin", "admin@utility.local", "Admin", "admin123"),
  createUser("u-engineer", "engineer@utility.local", "Engineer", "engineer123"),
  createUser("u-viewer", "viewer@utility.local", "Viewer", "viewer123")
];

export const store = {
  listSubstations: () => [...substations.values()],
  getSubstation: (id) => substations.get(id),
  upsertSubstation: (substation) => {
    const id = substation.id || slugify(substation.name);
    const existing = substations.get(id) || {};
    const next = { ...existing, ...substation, id };
    substations.set(id, next);
    return next;
  },
  saveTelemetry: (telemetryItems) => {
    for (const item of telemetryItems) {
      latestTelemetry.set(item.substationId, item);
      const history = telemetryHistory.get(item.substationId) || [];
      history.push(item);
      telemetryHistory.set(item.substationId, history.slice(-288));
    }
  },
  getLatestTelemetry: (substationId) => latestTelemetry.get(substationId),
  getHistory: (substationId, limit = 96) => (telemetryHistory.get(substationId) || []).slice(-limit),
  replaceActiveAlarmsForSubstation: (substationId, alarms) => {
    for (const key of activeAlarms.keys()) {
      if (key.startsWith(`${substationId}-`)) activeAlarms.delete(key);
    }
    for (const alarm of alarms) {
      activeAlarms.set(alarm.id, alarm);
      historicalAlarms.push({ ...alarm, event: "raised" });
    }
  },
  listActiveAlarms: () => [...activeAlarms.values()],
  listHistoricalAlarms: () => historicalAlarms.slice(-500).reverse(),
  acknowledgeAlarm: (alarmId, user) => {
    const alarm = activeAlarms.get(alarmId);
    if (!alarm) return null;
    const acknowledged = { ...alarm, acknowledged: true, acknowledgedBy: user.email, acknowledgedAt: new Date().toISOString() };
    activeAlarms.set(alarmId, acknowledged);
    historicalAlarms.push({ ...acknowledged, event: "acknowledged" });
    return acknowledged;
  },
  findUserByEmail: (email) => users.find((user) => user.email.toLowerCase() === String(email).toLowerCase()),
  addAuditLog: (entry) => auditLogs.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry }),
  listAuditLogs: () => auditLogs.slice(-200).reverse()
};

export function verifyPassword(user, password) {
  const hash = crypto.pbkdf2Sync(password, user.salt, 100000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash));
}

function createUser(id, email, role, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id,
    email,
    role,
    salt,
    passwordHash: crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex")
  };
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
