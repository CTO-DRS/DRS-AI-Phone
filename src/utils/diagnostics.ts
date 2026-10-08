/**
 * In-app diagnostics and error capture.
 *
 * Why: users on real devices reported freezes and silent closes that could
 * not be reproduced anywhere else. This module records a timestamped
 * timeline of every startup phase, captures JS errors (global handler +
 * console.error + the root error boundary), persists them to a file that
 * survives crashes, and assembles a shareable report including the native
 * crash files and the app's own logcat tail.
 *
 * Design constraints:
 * - NEVER throw: every export is defensive; diagnostics failing must not
 *   take the app down. All native access goes through try/catch getters.
 * - NO import-time native access: RNFS and the DiagnosticsModule spec are
 *   required lazily, so `import './diagnostics/install'` is safe as the
 *   very first app module (before the rest of the graph evaluates).
 */

export type DiagKind = 'session' | 'phase' | 'warn' | 'error' | 'crash';

export interface DiagEvent {
  ts: string;
  kind: DiagKind;
  msg: string;
  detail?: string;
}

const MAX_EVENTS = 250;
const MAX_PREVIOUS_EVENTS = 100;
const PERSIST_DEBOUNCE_MS = 1200;
const LOGCAT_TAIL_LINES = 200;

/** Current session's events (bounded ring buffer, newest last). */
const events: DiagEvent[] = [];
/** Events loaded from the previous session's persisted log. */
let previousSession: DiagEvent[] = [];

let handlersInstalled = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInFlight = false;
let persistPending = false;

// ---------------------------------------------------------------------------
// Lazy native access
// ---------------------------------------------------------------------------

interface DeviceSnapshot {
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
  nativeCrashFiles: string[];
}

interface NativeDiagnosticsModule {
  installNativeCrashHandler(): void;
  getLogcatTail(lines: number): Promise<string>;
  getDeviceSnapshot(): Promise<DeviceSnapshot>;
}

function getNativeModule(): NativeDiagnosticsModule | null {
  try {
    // Lazy require: TurboModuleRegistry.getEnforcing throws at import time
    // when the native side is absent (e.g. a JS bundle older than its
    // native build), which would break the whole app if done eagerly.

    const mod = require('../specs/NativeDiagnostics');
    return mod?.default ?? null;
  } catch {
    return null;
  }
}

interface FsModule {
  DocumentDirectoryPath: string;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, contents: string): Promise<void>;
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

function getFs(): FsModule | null {
  try {
    const mod = require('@dr.pogodin/react-native-fs');
    return mod ?? null;
  } catch {
    return null;
  }
}

function logDir(): string | null {
  const fs = getFs();
  return fs ? `${fs.DocumentDirectoryPath}/diagnostics` : null;
}

export function logFilePath(): string | null {
  const dir = logDir();
  return dir ? `${dir}/drsai-diagnostics.json` : null;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

function nowIso(): string {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}

export function recordEvent(
  kind: DiagKind,
  msg: string,
  detail?: string,
): void {
  try {
    events.push({ts: nowIso(), kind, msg, detail: detail?.slice(0, 2000)});
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }
    schedulePersist(kind === 'error' || kind === 'crash');
  } catch {
    // Never let recording itself fail the caller.
  }
}

export const recordPhase = (msg: string, detail?: string) =>
  recordEvent('phase', msg, detail);
export const recordWarning = (msg: string, detail?: string) =>
  recordEvent('warn', msg, detail);

export function recordError(err: unknown, context?: string): void {
  const message = err instanceof Error ? err.message : String(err ?? 'unknown');
  const stack = err instanceof Error && err.stack ? err.stack : undefined;
  recordEvent(
    'error',
    context ? `${context}: ${message}` : message,
    [stack].filter(Boolean).join('\n') || undefined,
  );
}

export function getEvents(): readonly DiagEvent[] {
  return events;
}

export function getPreviousSession(): readonly DiagEvent[] {
  return previousSession;
}

export function clearEvents(): void {
  try {
    events.length = 0;
    previousSession = [];
    const path = logFilePath();
    if (path) {
      persistNow().catch(() => undefined);
    }
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function serialize(): string {
  return JSON.stringify({
    savedAt: nowIso(),
    previousSession,
    events,
  });
}

/** Write the current buffer to disk immediately (best effort). */
export async function persistNow(): Promise<void> {
  const fs = getFs();
  const dir = logDir();
  const path = logFilePath();
  if (!fs || !dir || !path) {
    return;
  }
  if (persistInFlight) {
    persistPending = true;
    return;
  }
  persistInFlight = true;
  try {
    await fs.mkdir(dir).catch(() => undefined);
    await fs.writeFile(path, serialize());
  } catch {
    // Storage full / permissions — diagnostics must stay silent.
  } finally {
    persistInFlight = false;
    if (persistPending) {
      persistPending = false;
      schedulePersist(false);
    }
  }
}

function schedulePersist(immediate: boolean): void {
  try {
    if (immediate) {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      persistNow().catch(() => undefined);
      return;
    }
    if (persistTimer) {
      return;
    }
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistNow().catch(() => undefined);
    }, PERSIST_DEBOUNCE_MS);
  } catch {
    // Ignore.
  }
}

/** Load the previous session's persisted events (called once, on install). */
async function loadPreviousSession(): Promise<void> {
  const fs = getFs();
  const path = logFilePath();
  if (!fs || !path) {
    return;
  }
  try {
    if (!(await fs.exists(path))) {
      return;
    }
    const raw = await fs.readFile(path);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.events)) {
      previousSession = parsed.events.slice(-MAX_PREVIOUS_EVENTS);
    }
  } catch {
    // Corrupt file — start clean.
  }
}

// ---------------------------------------------------------------------------
// Global handlers
// ---------------------------------------------------------------------------

interface GlobalErrorUtils {
  getGlobalHandler?():
    | ((error: unknown, isFatal?: boolean) => void)
    | undefined;
  setGlobalHandler?(handler: (error: unknown, isFatal?: boolean) => void): void;
}

export function installGlobalErrorHandlers(): void {
  if (handlersInstalled) {
    return;
  }
  handlersInstalled = true;

  recordEvent('session', 'app:bootstrap');

  try {
    loadPreviousSession().catch(() => undefined);
  } catch {
    // Ignore.
  }

  // 1. Fatal/uncaught JS errors. In release builds the default handler
  //    kills the process; we record the error first so the log survives.
  try {
    const errorUtils = (global as unknown as {ErrorUtils?: GlobalErrorUtils})
      .ErrorUtils;
    const previous = errorUtils?.getGlobalHandler?.();
    errorUtils?.setGlobalHandler?.((error, isFatal) => {
      recordEvent(
        'crash',
        `${isFatal === false ? 'non-fatal ' : ''}uncaught: ${
          error instanceof Error ? error.message : String(error ?? 'unknown')
        }`,
        error instanceof Error && error.stack ? error.stack : undefined,
      );
      previous?.(error, isFatal);
    });
  } catch {
    // Ignore.
  }

  // 2. console.error capture (unhandled promise rejections surface here
  //    in RN, among other failures).
  try {
    const original = console.error.bind(console);
    let inCapture = false;
    console.error = (...args: unknown[]) => {
      try {
        if (!inCapture) {
          inCapture = true;
          const text = args
            .map(a => {
              if (a instanceof Error) {
                return a.stack ?? a.message;
              }
              return typeof a === 'string' ? a : String(a);
            })
            .join(' ');
          if (!text.includes('[GlobalErrorBoundary]')) {
            // The boundary already records itself; avoid double entries.
            recordEvent('error', text.slice(0, 1000));
          }
        }
      } catch {
        // Ignore.
      } finally {
        inCapture = false;
      }
      original(...args);
    };
  } catch {
    // Ignore.
  }

  // 3. Native crash handler (best effort).
  try {
    getNativeModule()?.installNativeCrashHandler();
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function formatEvents(list: readonly DiagEvent[]): string {
  if (list.length === 0) {
    return '  (none)';
  }
  return list
    .slice()
    .reverse()
    .map(
      e =>
        `  ${e.ts} [${e.kind}] ${e.msg}${e.detail ? `\n      ${e.detail.split('\n').join('\n      ')}` : ''}`,
    )
    .join('\n');
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return '?';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)}${units[unit]}`;
}

/**
 * Assemble the full text report: app/device facts, native crash files,
 * JS timeline, previous session, and the app's own logcat tail.
 */
export async function buildDiagnosticsReport(): Promise<string> {
  const lines: string[] = [];
  const native = getNativeModule();

  let snapshot: DeviceSnapshot | null = null;
  try {
    snapshot = native ? await native.getDeviceSnapshot() : null;
  } catch {
    snapshot = null;
  }

  lines.push('=== DRS AI diagnostics report ===');
  lines.push(`generated: ${nowIso()}`);
  if (snapshot) {
    lines.push(`app: ${snapshot.appVersionName} (${snapshot.appVersionCode})`);
    lines.push(
      `device: ${snapshot.manufacturer} ${snapshot.model} (${snapshot.device})`,
    );
    lines.push(`android: ${snapshot.androidVersion} (API ${snapshot.sdkInt})`);
    lines.push(`abis: ${snapshot.abis.join(', ')}`);
    lines.push(
      `ram: total ${fmtBytes(snapshot.totalMemoryBytes)}, low-ram device: ${
        snapshot.isLowRamDevice ? 'yes' : 'no'
      }, app max heap ${fmtBytes(snapshot.maxHeapBytes)}`,
    );
    lines.push(`uptime: ${Math.round(snapshot.uptimeMs / 1000)}s`);
    if (snapshot.nativeCrashFiles.length > 0) {
      lines.push(`native crash files: ${snapshot.nativeCrashFiles.join(', ')}`);
    }
  } else {
    lines.push('app/device snapshot unavailable (native module missing)');
  }

  lines.push('');
  lines.push('--- startup timeline (newest first) ---');
  lines.push(formatEvents(events));

  if (previousSession.length > 0) {
    lines.push('');
    lines.push('--- previous session (newest first) ---');
    lines.push(formatEvents(previousSession));
  }

  if (snapshot && snapshot.nativeCrashFiles.length > 0) {
    const fs = getFs();
    const dir = logDir();
    if (fs && dir) {
      for (const name of snapshot.nativeCrashFiles.slice(0, 3)) {
        try {
          const content = await fs.readFile(`${dir}/${name}`);
          lines.push('');
          lines.push(`--- native crash: ${name} ---`);
          lines.push(content.slice(0, 4000));
        } catch {
          // Ignore unreadable crash file.
        }
      }
    }
  }

  try {
    const logcat = native ? await native.getLogcatTail(LOGCAT_TAIL_LINES) : '';
    if (logcat) {
      lines.push('');
      lines.push(`--- logcat tail (last ${LOGCAT_TAIL_LINES} lines) ---`);
      lines.push(logcat);
    }
  } catch {
    // logcat unavailable — skip the section.
  }

  return lines.join('\n');
}

/** Test-only: reset module state. */
export function _resetForTests(): void {
  events.length = 0;
  previousSession = [];
  handlersInstalled = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}
