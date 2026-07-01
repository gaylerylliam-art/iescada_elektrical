import { BaseConnector } from "./BaseConnector.js";

export class MqttConnector extends BaseConnector {
  async readTelemetry() {
    throw new Error("MQTT connector requires broker topic mapping before use");
  }
}
