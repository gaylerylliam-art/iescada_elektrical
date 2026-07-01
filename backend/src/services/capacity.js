export function apparentPowerMva(mw, mvar) {
  return Math.sqrt(mw ** 2 + mvar ** 2);
}

export function loadingFromMva(actualMva, ratedMva) {
  return ratedMva > 0 ? (actualMva / ratedMva) * 100 : 0;
}

export function loadingFromCurrent(actualCurrent, ratedCurrent) {
  return ratedCurrent > 0 ? (actualCurrent / ratedCurrent) * 100 : 0;
}

export function availableCapacityMva(allowableMva, actualMva) {
  return allowableMva - actualMva;
}

export function statusForLoading(loadingPercent) {
  if (loadingPercent > 100) return "Overloaded";
  if (loadingPercent >= 85) return "Warning";
  if (loadingPercent >= 70) return "Watch";
  return "Normal";
}

export function nMinusOneStatus(substation, actualMva) {
  const transformers = substation.transformers || [];
  if (transformers.length < 2) return { status: "Warning", remainingCapacityMva: 0, marginMva: 0 };
  const total = transformers.reduce((sum, transformer) => sum + transformer.ratingMva, 0);
  const largest = Math.max(...transformers.map((transformer) => transformer.ratingMva));
  const remainingCapacityMva = total - largest;
  const marginMva = remainingCapacityMva - actualMva;
  if (marginMva < 0) return { status: "Fail", remainingCapacityMva, marginMva };
  if (marginMva / remainingCapacityMva < 0.1) return { status: "Warning", remainingCapacityMva, marginMva };
  return { status: "Pass", remainingCapacityMva, marginMva };
}

export function enrichTelemetry(substation, telemetry, staleTelemetrySeconds) {
  const mva = telemetry.mva ?? apparentPowerMva(telemetry.mw, telemetry.mvar);
  const loadingPercent = telemetry.loadingPercent ?? loadingFromMva(mva, substation.ratedMva);
  const currentLoadingPercent = loadingFromCurrent(telemetry.currentA, substation.ratedCurrentA);
  const available = availableCapacityMva(substation.allowableMva, mva);
  const ageSeconds = (Date.now() - new Date(telemetry.timestamp).getTime()) / 1000;
  return {
    ...telemetry,
    mva: round(mva),
    loadingPercent: round(loadingPercent),
    currentLoadingPercent: round(currentLoadingPercent),
    availableCapacityMva: round(available),
    status: statusForLoading(loadingPercent),
    nMinusOne: nMinusOneStatus(substation, mva),
    isStale: ageSeconds > staleTelemetrySeconds
  };
}

export function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}
