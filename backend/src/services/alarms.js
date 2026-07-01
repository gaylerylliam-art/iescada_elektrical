export function generateAlarms(substation, telemetry) {
  const alarms = [];
  const timestamp = telemetry.timestamp || new Date().toISOString();

  if (telemetry.loadingPercent >= 85 && telemetry.loadingPercent <= 100) {
    alarms.push(alarm(substation, "LOAD_WARNING", "Warning", `Loading is ${telemetry.loadingPercent}%`, timestamp));
  }
  if (telemetry.loadingPercent > 100) {
    alarms.push(alarm(substation, "LOAD_OVERLOAD", "Critical", `Loading is ${telemetry.loadingPercent}%`, timestamp));
  }
  if (telemetry.voltageKv < substation.voltageLevelKv * 0.95 || telemetry.voltageKv > substation.voltageLevelKv * 1.05) {
    alarms.push(alarm(substation, "VOLTAGE_LIMIT", "Warning", `Voltage is ${telemetry.voltageKv} kV`, timestamp));
  }
  if (telemetry.transformerTempC >= 95) {
    alarms.push(alarm(substation, "TRANSFORMER_TEMP", "Critical", `Transformer temperature is ${telemetry.transformerTempC} C`, timestamp));
  }
  if (telemetry.isStale) {
    alarms.push(alarm(substation, "TELEMETRY_STALE", "Critical", "Telemetry data is stale or missing", timestamp));
  }
  if (telemetry.connectionStatus === "lost") {
    alarms.push(alarm(substation, "SOURCE_CONNECTION", "Critical", "Connection lost to telemetry source", timestamp));
  }

  return alarms;
}

function alarm(substation, type, severity, message, timestamp) {
  return {
    id: `${substation.id}-${type}`,
    substationId: substation.id,
    substationName: substation.name,
    type,
    severity,
    message,
    active: true,
    acknowledged: false,
    timestamp
  };
}
