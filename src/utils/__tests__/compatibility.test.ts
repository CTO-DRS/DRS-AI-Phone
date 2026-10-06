import {
  computeModelCompatibility,
  performanceProfileFor,
  DeviceProfileSnapshot,
} from '../compatibility';

const GB = 1024 * 1024 * 1024;

const device = (
  overrides: Partial<DeviceProfileSnapshot> = {},
): DeviceProfileSnapshot => ({
  ramBytes: 8 * GB,
  freeDiskBytes: 40 * GB,
  cpuCores: 8,
  gpuSupported: true,
  deviceTier: 'high',
  ...overrides,
});

describe('computeModelCompatibility', () => {
  it('returns notRecommended with engine reason when the engine cannot run the category', () => {
    const result = computeModelCompatibility({
      modelSizeBytes: 2 * GB,
      estimatedMemoryBytes: 2.4 * GB,
      engineSupported: false,
      device: device(),
    });
    expect(result.level).toBe('notRecommended');
    expect(result.score).toBe(0);
    expect(result.reasons.find(r => r.id === 'engine')?.severity).toBe('error');
  });

  it('reports excellent for a light model on a strong device', () => {
    const result = computeModelCompatibility({
      modelSizeBytes: 1.2 * GB,
      estimatedMemoryBytes: 1.8 * GB,
      engineSupported: true,
      device: device(),
    });
    expect(result.level).toBe('excellent');
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.performanceProfile).toBe('light');
  });

  it('flags insufficient memory as an error and degrades the level', () => {
    const result = computeModelCompatibility({
      modelSizeBytes: 10 * GB,
      estimatedMemoryBytes: 11 * GB,
      engineSupported: true,
      device: device(),
    });
    const memory = result.reasons.find(r => r.id === 'memory');
    expect(memory?.severity).toBe('error');
    expect(result.level).toBe('notRecommended');
  });

  it('flags tight memory as a warning with limited/good level', () => {
    // 5.2/8 = 0.65 → tight band (0.55–0.75]
    const result = computeModelCompatibility({
      modelSizeBytes: 4.5 * GB,
      estimatedMemoryBytes: 5.2 * GB,
      engineSupported: true,
      device: device(),
    });
    const memory = result.reasons.find(r => r.id === 'memory');
    expect(memory?.severity).toBe('warning');
    expect(['limited', 'good']).toContain(result.level);
  });

  it('flags insufficient storage', () => {
    const result = computeModelCompatibility({
      modelSizeBytes: 12 * GB,
      estimatedMemoryBytes: 2 * GB,
      engineSupported: true,
      device: device({freeDiskBytes: 6 * GB}),
    });
    expect(result.reasons.find(r => r.id === 'storage')?.severity).toBe(
      'error',
    );
    expect(result.level).toBe('limited');
  });

  it('caps at good when the memory estimate is unknown (no fake claims)', () => {
    const result = computeModelCompatibility({
      modelSizeBytes: 1 * GB,
      estimatedMemoryBytes: null,
      engineSupported: true,
      device: device(),
    });
    expect(result.level).toBe('good');
    expect(result.level).not.toBe('excellent');
    expect(result.reasons.find(r => r.id === 'memory')?.detail).toBe(
      'memoryUnknown',
    );
  });

  it('handles fully unknown device data without crashing', () => {
    const result = computeModelCompatibility({
      modelSizeBytes: 2 * GB,
      estimatedMemoryBytes: null,
      engineSupported: true,
      device: device({
        ramBytes: null,
        freeDiskBytes: null,
        cpuCores: null,
        gpuSupported: null,
        deviceTier: null,
      }),
    });
    expect(['good', 'limited']).toContain(result.level);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('keeps CPU-only devices usable with an info note', () => {
    const result = computeModelCompatibility({
      modelSizeBytes: 1 * GB,
      estimatedMemoryBytes: 1.2 * GB,
      engineSupported: true,
      device: device({gpuSupported: false}),
    });
    expect(result.reasons.find(r => r.id === 'gpu')?.detail).toBe(
      'gpuUnsupported',
    );
    expect(result.level).not.toBe('notRecommended');
  });
});

describe('performanceProfileFor', () => {
  it('buckets by real byte size', () => {
    expect(performanceProfileFor(500_000_000)).toBe('light');
    expect(performanceProfileFor(3 * GB)).toBe('medium');
    expect(performanceProfileFor(8 * GB)).toBe('heavy');
    expect(performanceProfileFor(undefined)).toBe('unknown');
    expect(performanceProfileFor(0)).toBe('unknown');
  });
});
