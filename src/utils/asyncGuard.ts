/**
 * Async safety helpers for operations that may never settle.
 *
 * Why: the startup "Upgrading database..." freeze (v1.30–v1.33) was a
 * promise inside the migration chain that never resolved on some devices
 * (a lost native callback inside the WatermelonDB writer or the raw-SQL
 * bridge). Every exception was already handled — but a promise that never
 * settles bypasses try/catch entirely, so the only defense is a timeout
 * race plus resumable work.
 *
 * Design constraints:
 * - `withTimeout` must never leave the losing promise's rejection
 *   unhandled (it attaches a no-op catch), otherwise the late rejection
 *   surfaces as a new crash after the timeout already fired.
 * - Nothing here may import React or native modules.
 */

/** Error thrown by `withTimeout` when the deadline elapses first. */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`timeout after ${ms}ms: ${label}`);
    this.name = 'TimeoutError';
  }
}

/**
 * Races `promise` against a deadline. Rejects with `TimeoutError(label)`
 * if `promise` has not settled within `ms`. A late rejection of the
 * losing promise is swallowed (it is intentionally left unobserved).
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  // Prevent "unhandled promise rejection" for the case where the raced
  // promise rejects after the timeout has already won the race.
  promise.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

/**
 * Yields control back to the event loop so pending frames (spinners,
 * progress updates) can render before the next synchronous chunk of work.
 * A zero-delay timeout is enough — the goal is interleaving, not waiting.
 */
export const yieldToUI = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
