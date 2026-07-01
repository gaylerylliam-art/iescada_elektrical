import { BaseConnector } from "./BaseConnector.js";

export class HistorianConnector extends BaseConnector {
  async readTelemetry() {
    if (!this.config.historianBaseUrl) {
      throw new Error("HISTORIAN_BASE_URL is not configured");
    }
    throw new Error("Historian connector requires point mapping before use");
  }
}
