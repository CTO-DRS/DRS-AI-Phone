import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

/**
 * Snapshot of app + device facts used by the diagnostics report. All
 * fields are primitives or string arrays so the codegen can map them
 * 1:1 to a WritableMap on the Kotlin side.
 */
export interface DeviceSnapshot {
  manufacturer: string;
  model: string;
  device: string;
  androidVersion: string;
  sdkInt: number;
  abis: string[];
  totalMemoryBytes: number;
  isLowRamDevice: boolean;
  maxHeapBytes: number;
  appVersionName: string;
  appVersionCode: number;
  uptimeMs: number;
  /** Names of persisted native crash files (newest first), if any. */
  nativeCrashFiles: string[];
}

export interface Spec extends TurboModule {
  /**
   * Install an uncaught-exception handler that persists the crashing
   * thread + stack trace to filesDir/diagnostics/ before delegating to
   * the previous handler (so the normal crash flow is unchanged).
   * Idempotent; safe to call on every cold start.
   */
  installNativeCrashHandler(): void;
  /**
   * Last `lines` lines of this app's own logcat buffer. Reading the
   * app's own logs needs no permission on any supported API level.
   */
  getLogcatTail(lines: number): Promise<string>;
  /** Device + app facts for the diagnostics report (see DeviceSnapshot). */
  getDeviceSnapshot(): Promise<DeviceSnapshot>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('DiagnosticsModule');
