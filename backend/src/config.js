import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "development-only-change-me",
  telemetrySource: process.env.TELEMETRY_SOURCE || "simulated",
  telemetryPollMs: Number(process.env.TELEMETRY_POLL_MS || 5000),
  staleTelemetrySeconds: Number(process.env.STALE_TELEMETRY_SECONDS || 60),
  scadaRestBaseUrl: process.env.SCADA_REST_BASE_URL,
  scadaRestApiKey: process.env.SCADA_REST_API_KEY,
  opcuaEndpoint: process.env.OPCUA_ENDPOINT,
  mqttBrokerUrl: process.env.MQTT_BROKER_URL,
  historianBaseUrl: process.env.HISTORIAN_BASE_URL
};
