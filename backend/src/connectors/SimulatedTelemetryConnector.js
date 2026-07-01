import { BaseConnector } from "./BaseConnector.js";
import { apparentPowerMva, round } from "../services/capacity.js";

export class SimulatedTelemetryConnector extends BaseConnector {
  async readTelemetry(substations) {
    const now = new Date();
    return substations.map((substation, index) => {
      const cycle = Math.sin(Date.now() / 120000 + index);
      const baseLoad = 0.58 + index * 0.035;
      const loadFactor = Math.max(0.35, Math.min(1.16, baseLoad + cycle * 0.18));
      const mw = substation.ratedMva * loadFactor * 0.92;
      const mvar = substation.ratedMva * loadFactor * 0.22;
      const mva = apparentPowerMva(mw, mvar);
      return {
        substationId: substation.id,
        timestamp: now.toISOString(),
        voltageKv: round(substation.voltageLevelKv * (0.985 + Math.cos(Date.now() / 180000 + index) * 0.025)),
        currentA: round(substation.ratedCurrentA * loadFactor),
        mw: round(mw),
        mvar: round(mvar),
        mva: round(mva),
        transformerTempC: round(55 + loadFactor * 38 + Math.max(0, loadFactor - 1) * 24),
        feederLoading: substation.feeders.map((feeder, feederIndex) => ({
          name: feeder.name,
          loadingPercent: round(Math.min(125, loadFactor * 82 + feederIndex * 7 + Math.sin(Date.now() / 90000 + feederIndex) * 8))
        })),
        connectionStatus: index === 8 && Math.sin(Date.now() / 200000) > 0.92 ? "lost" : "connected"
      };
    });
  }
}
