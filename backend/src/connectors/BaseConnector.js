export class BaseConnector {
  constructor(config = {}) {
    this.config = config;
  }

  async connect() {}

  async readTelemetry() {
    throw new Error("Connector must implement readTelemetry");
  }

  async disconnect() {}
}
