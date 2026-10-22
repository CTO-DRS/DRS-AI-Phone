import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  isValidSessionPayload,
  supabaseSecureStorage,
} from './supabaseSecureStorage';

/**
 * One-time legacy session migration: AsyncStorage → Keychain (fix 2).
 * See docs/audit-worklog.md — "fix 2".
 *
 * Contract:
 * ─────────
 * 1. Scope: only legacy auth-js session keys matching /^sb-.+-auth-token$/
 *    (the key pattern v1.41.0 wrote through AsyncStorage). Other legacy keys
 *    (code verifiers etc.) are NOT swept — the adapter's read-through
 *    fallback serves them until they naturally expire or rewrite.
 * 2. Ordering — write → verify → delete: a legacy key is removed ONLY after
 *    its value was written to the Keychain AND read back byte-identical.
 *    Any verification mismatch keeps the legacy key (never lose a session).
 * 3. Idempotent: re-running finds no legacy keys and does nothing. A second
 *    run after a partially failed run retries only the remaining keys.
 * 4. Conservatism: if the Keychain already holds a DIFFERENT value for the
 *    key (a newer session), the legacy key is left in place untouched —
 *    the adapter's authoritative order (Keychain hit wins) makes it inert,
 *    and this sweep refuses to delete anything it did not just verify.
 * 5. Corrupt legacy payloads (invalid JSON on a *-auth-token key) are never
 *    promoted: they are skipped and left in place, inert debris.
 * 6. Top-level failure: warn-only (console.warn), never throws — a migration
 *    problem must never crash startup. The read-through fallback keeps the
 *    session functional even if this sweep never completes.
 */

const LEGACY_SESSION_KEY_PATTERN = /^sb-.+-auth-token$/;

export interface LegacySessionMigrationReport {
  /** Legacy keys copied to the Keychain and deleted from AsyncStorage. */
  migrated: string[];
  /** Legacy keys intentionally left in place (already migrated, stale,
   *  or corrupt — see contract 4 and 5). */
  skipped: string[];
  /** Legacy keys that failed write/verify — kept, retried next run. */
  failed: string[];
}

export async function migrateLegacySession(): Promise<LegacySessionMigrationReport> {
  const report: LegacySessionMigrationReport = {
    migrated: [],
    skipped: [],
    failed: [],
  };

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const legacyKeys = allKeys.filter(k => LEGACY_SESSION_KEY_PATTERN.test(k));

    for (const key of legacyKeys) {
      try {
        const legacyValue = await AsyncStorage.getItem(key);
        if (legacyValue === null) {
          // Vanished between getAllKeys and getItem — nothing to do.
          report.skipped.push(key);
          continue;
        }

        const authoritative = await supabaseSecureStorage.getItem(key);

        if (authoritative === legacyValue) {
          // Already migrated (idempotent re-run, or the read-through path
          // served it earlier and a verified copy exists): drop the legacy.
          await AsyncStorage.removeItem(key);
          report.migrated.push(key);
          continue;
        }

        if (authoritative !== null) {
          // Keychain holds a different (newer) session — legacy is stale.
          // Left in place by contract 4; inert because Keychain hits win.
          report.skipped.push(key);
          continue;
        }

        if (!isValidSessionPayload(key, legacyValue)) {
          // Corrupt legacy payload — never promote debris (contract 5).
          report.skipped.push(key);
          continue;
        }

        await supabaseSecureStorage.setItem(key, legacyValue);
        const verified = await supabaseSecureStorage.getItem(key);
        if (verified === legacyValue) {
          await AsyncStorage.removeItem(key);
          report.migrated.push(key);
        } else {
          // Verification mismatch — keep legacy, retry next run (contract 2).
          report.failed.push(key);
        }
      } catch {
        // Per-key failure — keep the key, keep going with the rest.
        report.failed.push(key);
      }
    }
  } catch (error) {
    // Contract 6: warn-only, never throw.
    console.warn('[migrateLegacySession] sweep failed:', error);
  }

  return report;
}
