/**
 * bootHealth — consecutive-failed-boot detection (v1.41.0).
 *
 * The startup-crash reports that cannot be reproduced locally all share
 * one property: the app never reaches a screen where the diagnostics
 * report could be shared, so every launch repeats the same death. This
 * module flips the default: every boot is assumed failing until proven
 * otherwise, and `SAFE_MODE_THRESHOLD` consecutive failed boots switch
 * the NEXT launch into safe mode — the app still opens, but the
 * non-critical subsystems added across v1.36–v1.40 (widget bridge,
 * startup update alert) are skipped so a failure in any of them cannot
 * wedge the boot again, and the user at least reaches a usable app with
 * working diagnostics.
 *
 * The counter lives in AsyncStorage because a crash can happen before
 * anything else is ready. Storage failure degrades to "disabled"
 * (fail open) — boot health is defense in depth, never a boot
 * dependency.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_STREAK = 'bootHealth.failureStreak';

/** Failed boots in a row that trigger a safe-mode launch. */
export const SAFE_MODE_THRESHOLD = 2;

let cachedStreak: number | null = null;
let attemptStarted = false;
let attemptCompleted = false;
let readyResolve: (() => void) | undefined;
let readyPromise: Promise<void> | undefined;

/**
 * Persist "this boot may fail". Called from index.js BEFORE the app
 * graph evaluates, so even a module-evaluation crash leaves the streak
 * incremented. Idempotent within a single process.
 */
export const beginBootAttempt = async (): Promise<void> => {
  if (attemptStarted) {
    return;
  }
  attemptStarted = true;
  try {
    const raw = await AsyncStorage.getItem(KEY_STREAK);
    const previous = raw ? parseInt(raw, 10) : 0;
    // The gate reads the failures observed BEFORE this attempt: the
    // launch following two consecutive deaths runs in safe mode, while
    // boot #2 itself still gets a full-fledged startup.
    cachedStreak = Number.isFinite(previous) ? previous : 0;
    await AsyncStorage.setItem(KEY_STREAK, String(cachedStreak + 1));
  } catch {
    // Storage unavailable — boot health degrades to disabled (fail open).
    cachedStreak = cachedStreak ?? 0;
  } finally {
    attemptCompleted = true;
    readyResolve?.();
  }
};

/**
 * Promise that settles once the boot-attempt bookkeeping is durable.
 * Effects that consult `isSafeModeBoot` await this first, otherwise the
 * async read would race the effect schedule.
 */
export const bootHealthReady = (): Promise<void> => {
  if (!readyPromise) {
    if (attemptCompleted) {
      // beginBootAttempt already ran to completion before anyone asked
      // (fast storage in tests) — nothing to wait for.
      readyPromise = Promise.resolve();
      return readyPromise;
    }
    readyPromise = new Promise<void>(resolve => {
      readyResolve = resolve;
    });
    // The caller (index.js) starts the attempt at graph-eval time; if
    // nobody called beginBootAttempt yet, start it lazily here so the
    // promise can never hang.
    beginBootAttempt().catch(() => {
      // beginBootAttempt never rejects (all failures are swallowed
      // internally); this catch only satisfies the floating-promise lint.
    });
  }
  return readyPromise;
};

/** Mark the current boot healthy. Clears the failure streak. */
export const markBootSuccess = async (): Promise<void> => {
  cachedStreak = 0;
  try {
    await AsyncStorage.setItem(KEY_STREAK, '0');
  } catch {
    // In-memory streak is already cleared; persistence is best-effort.
  }
};

/** Consecutive failed boots observed so far (0 when healthy/unknown). */
export const getBootFailureStreak = (): number => cachedStreak ?? 0;

/**
 * True when the streak reached SAFE_MODE_THRESHOLD and this launch
 * should skip non-critical subsystems. Consult after bootHealthReady().
 */
export const isSafeModeBoot = (): boolean =>
  getBootFailureStreak() >= SAFE_MODE_THRESHOLD;

/** Test seam: reset the in-process state between suites. */
export const resetBootHealthForTests = (): void => {
  cachedStreak = null;
  attemptStarted = false;
  attemptCompleted = false;
  readyResolve = undefined;
  readyPromise = undefined;
};
