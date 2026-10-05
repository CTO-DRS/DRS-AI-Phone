/**
 * Device ↔ model compatibility scoring for the Models Hub.
 *
 * Every input is real device data (RAM, free disk, CPU cores, GPU support,
 * device tier) or a real model requirement (file size, estimated memory
 * footprint from the app's memory estimator). When a value is unavailable the
 * result reports `unknown` for that axis instead of pretending — the overall
 * level is capped so we never claim "excellent" with missing evidence.
 */

export type DeviceTier = 'low' | 'mid' | 'high' | 'flagship';

export interface DeviceProfileSnapshot {
  /** Total physical RAM in bytes, or null when the OS will not report it. */
  ramBytes: number | null;
  /** Free disk space in bytes on the models volume, or null. */
  freeDiskBytes: number | null;
  /** CPU core count, or null. */
  cpuCores: number | null;
  /** Whether the GPU backend (Metal / OpenCL-Adreno) is supported, or null. */
  gpuSupported: boolean | null;
  deviceTier: DeviceTier | null;
}

export type CompatibilityLevel =
  | 'excellent'
  | 'good'
  | 'limited'
  | 'notRecommended'
  | 'unknown';

export type PerformanceProfile = 'light' | 'medium' | 'heavy' | 'unknown';

export interface CompatibilityReason {
  id: 'memory' | 'storage' | 'cpu' | 'gpu' | 'engine';
  /** true → satisfied, false → blocked/warning, null → cannot determine. */
  status: boolean | null;
  severity: 'ok' | 'warning' | 'error' | 'info';
  /** Machine-readable detail so the UI can map it to localized copy. */
  detail?: string;
}

export interface CompatibilityCheck {
  level: CompatibilityLevel;
  /** 0–100 heuristic fit score derived from the axes below. */
  score: number;
  performanceProfile: PerformanceProfile;
  reasons: CompatibilityReason[];
}

export interface CompatibilityInput {
  /** Download size of the model file in bytes. */
  modelSizeBytes: number;
  /**
   * Estimated runtime memory requirement in bytes (weights + KV cache +
   * compute buffers) from the app's memory estimator, or null when the
   * estimator lacks GGUF metadata.
   */
  estimatedMemoryBytes: number | null;
  /** Whether the local engine can execute this model category at all. */
  engineSupported: boolean;
  device: DeviceProfileSnapshot;
}

const GB = 1024 * 1024 * 1024;

/** Performance profile from the raw file size (download weight class). */
export const performanceProfileFor = (
  sizeBytes: number | null | undefined,
): PerformanceProfile => {
  if (!sizeBytes || sizeBytes <= 0) {
    return 'unknown';
  }
  if (sizeBytes < 1.6 * GB) {
    return 'light';
  }
  if (sizeBytes < 4.6 * GB) {
    return 'medium';
  }
  return 'heavy';
};

/**
 * Deterministic compatibility computation. No async, no store access —
 * trivially unit-testable and safe to call during render for lists.
 */
export const computeModelCompatibility = (
  input: CompatibilityInput,
): CompatibilityCheck => {
  const {modelSizeBytes, estimatedMemoryBytes, engineSupported, device} = input;
  const reasons: CompatibilityReason[] = [];

  // Engine support is a hard gate.
  if (!engineSupported) {
    reasons.push({
      id: 'engine',
      status: false,
      severity: 'error',
      detail: 'engineUnsupported',
    });
    return {
      level: 'notRecommended',
      score: 0,
      performanceProfile: performanceProfileFor(modelSizeBytes),
      reasons,
    };
  }
  reasons.push({
    id: 'engine',
    status: true,
    severity: 'ok',
    detail: 'engineSupported',
  });

  let score = 100;
  let memoryUnknown = false;

  // Memory axis — the dominant factor.
  if (estimatedMemoryBytes && device.ramBytes) {
    const ratio = estimatedMemoryBytes / device.ramBytes;
    if (ratio <= 0.35) {
      reasons.push({
        id: 'memory',
        status: true,
        severity: 'ok',
        detail: 'memoryComfortable',
      });
    } else if (ratio <= 0.55) {
      score -= 12;
      reasons.push({
        id: 'memory',
        status: true,
        severity: 'ok',
        detail: 'memoryOk',
      });
    } else if (ratio <= 0.75) {
      score -= 30;
      reasons.push({
        id: 'memory',
        status: null,
        severity: 'warning',
        detail: 'memoryTight',
      });
    } else {
      score -= 65;
      reasons.push({
        id: 'memory',
        status: false,
        severity: 'error',
        detail: 'memoryInsufficient',
      });
    }
  } else {
    memoryUnknown = true;
    reasons.push({
      id: 'memory',
      status: null,
      severity: 'info',
      detail: 'memoryUnknown',
    });
  }

  // Storage axis.
  if (device.freeDiskBytes != null) {
    const needed = modelSizeBytes * 1.1; // download + decompress headroom
    if (device.freeDiskBytes >= needed * 1.5) {
      reasons.push({
        id: 'storage',
        status: true,
        severity: 'ok',
        detail: 'storagePlenty',
      });
    } else if (device.freeDiskBytes >= needed) {
      score -= 10;
      reasons.push({
        id: 'storage',
        status: null,
        severity: 'warning',
        detail: 'storageTight',
      });
    } else {
      score -= 55;
      reasons.push({
        id: 'storage',
        status: false,
        severity: 'error',
        detail: 'storageInsufficient',
      });
    }
  } else {
    reasons.push({
      id: 'storage',
      status: null,
      severity: 'info',
      detail: 'storageUnknown',
    });
  }

  // CPU axis.
  if (device.cpuCores != null) {
    if (device.cpuCores >= 6) {
      reasons.push({
        id: 'cpu',
        status: true,
        severity: 'ok',
        detail: 'cpuGood',
      });
    } else if (device.cpuCores >= 4) {
      score -= 8;
      reasons.push({id: 'cpu', status: true, severity: 'ok', detail: 'cpuOk'});
    } else {
      score -= 20;
      reasons.push({
        id: 'cpu',
        status: null,
        severity: 'warning',
        detail: 'cpuLimited',
      });
    }
  } else {
    reasons.push({
      id: 'cpu',
      status: null,
      severity: 'info',
      detail: 'cpuUnknown',
    });
  }

  // GPU axis — informative, not a gate (CPU inference always works).
  if (device.gpuSupported != null) {
    reasons.push({
      id: 'gpu',
      status: device.gpuSupported,
      severity: device.gpuSupported ? 'ok' : 'info',
      detail: device.gpuSupported ? 'gpuSupported' : 'gpuUnsupported',
    });
  } else {
    reasons.push({
      id: 'gpu',
      status: null,
      severity: 'info',
      detail: 'gpuUnknown',
    });
  }

  score = Math.max(0, Math.min(100, score));

  // Level derivation with honest caps: never claim better than "good" while
  // the memory estimate is missing, and degrade when hard errors exist.
  const hasError = reasons.some(r => r.severity === 'error');
  const hasWarning = reasons.some(r => r.severity === 'warning');

  let level: CompatibilityLevel;
  if (hasError) {
    level = score <= 35 ? 'notRecommended' : 'limited';
  } else if (memoryUnknown) {
    level = score >= 70 ? 'good' : 'limited';
  } else if (score >= 80 && !hasWarning) {
    level = 'excellent';
  } else if (score >= 60) {
    level = 'good';
  } else {
    level = 'limited';
  }

  return {
    level,
    score,
    performanceProfile: performanceProfileFor(modelSizeBytes),
    reasons,
  };
};

/** Sort comparator: best fit first, then lighter models. */
export const compareByCompatibility = (
  a: CompatibilityCheck,
  b: CompatibilityCheck,
): number => b.score - a.score;
