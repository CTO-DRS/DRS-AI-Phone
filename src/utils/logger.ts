/**
 * Central logger (audit finding R-07 / recommendation R-07).
 *
 * `logger.debug` / `logger.info` are silenced in production builds, so debug
 * noise and potentially sensitive content (chat text, prompts, tokens' shape)
 * no longer reach logcat / the unified log in release builds.
 * `logger.warn` / `logger.error` stay active everywhere — they carry real
 * failure diagnostics users and bug reports depend on.
 *
 * Replaces direct `console.log` calls across `src/`. Keep this module free
 * of project imports so it can be used from anywhere without cycles.
 */

type LogArgs = unknown[];

const sink = console;

function emit(method: 'log' | 'info' | 'warn' | 'error', args: LogArgs): void {
  if (!__DEV__ && (method === 'log' || method === 'info')) {
    return;
  }
  sink[method](...args);
}

export const logger = {
  /** Dev-only debug logging (no-op in release builds). */
  debug: (...args: LogArgs) => emit('log', args),
  /** Dev-only informational logging (no-op in release builds). */
  info: (...args: LogArgs) => emit('info', args),
  /** Warnings are logged in all builds. */
  warn: (...args: LogArgs) => emit('warn', args),
  /** Errors are logged in all builds. */
  error: (...args: LogArgs) => emit('error', args),
};
