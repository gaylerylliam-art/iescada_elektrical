import { BaseConnector } from "./BaseConnector.js";

export class ScadaRestConnector extends BaseConnector {
  async readTelemetry(substations) {
    if (!this.config.scadaRestBaseUrl) {
      throw new Error("SCADA_REST_BASE_URL is not configured");
    }
    const response = await fetch(`${this.config.scadaRestBaseUrl}/telemetry/substations`, {
      headers: { Authorization: `Bearer ${this.config.scadaRestApiKey || ""}` }
    });
    if (!response.ok) throw new Error(`SCADA REST read failed: ${response.status}`);
    const data = await response.json();
    return normalizeByKnownSubstations(data, substations);
  }
}

function normalizeByKnownSubstations(data, substations) {
  const knownIds = new Set(substations.map((substation) => substation.id));
  return data.filter((item) => knownIds.has(item.substationId));
}
