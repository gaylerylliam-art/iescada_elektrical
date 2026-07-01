import { SimulatedTelemetryConnector } from "./SimulatedTelemetryConnector.js";
import { ScadaRestConnector } from "./ScadaRestConnector.js";
import { OpcUaConnector } from "./OpcUaConnector.js";
import { MqttConnector } from "./MqttConnector.js";
import { HistorianConnector } from "./HistorianConnector.js";

export function createConnector(source, config) {
  switch (source) {
    case "scada_rest":
      return new ScadaRestConnector(config);
    case "opcua":
      return new OpcUaConnector(config);
    case "mqtt":
      return new MqttConnector(config);
    case "historian":
      return new HistorianConnector(config);
    case "simulated":
    default:
      return new SimulatedTelemetryConnector(config);
  }
}
