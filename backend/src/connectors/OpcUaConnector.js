import { BaseConnector } from "./BaseConnector.js";

export class OpcUaConnector extends BaseConnector {
  async readTelemetry() {
    throw new Error("OPC UA connector requires node-opcua mapping configuration before use");
  }
}
