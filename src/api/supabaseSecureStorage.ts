import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

/**
 * Keychain-backed storage adapter for the Supabase client (fix 2).
 * See docs/audit-worklog.md — "fix 2" for the full contract.
 *
 * Contract:
 * ─────────
 * 1. Service namespace: one Keychain entry per storage key, service
 *    `drs.supabase.<key>`. Nothing outside this namespace is touched.
 * 2. iOS accessibility: ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY — the
 *    session never leaves the device (no backup, no device migration).
 * 3. JSON guard — SUFFIX match `*-auth-token` only (auth-js session payload).
 *    IMPORTANT: the PKCE key is `sb-<ref>-auth-token-code-verifier`; it
 *    CONTAINS the substring "-auth-token" but must NOT be guarded (it stores
 *    a raw verifier, not JSON). Invalid guarded values return null SILENTLY:
 *    a corrupt session must look like "no session" so auth-js re-authenticates
 *    cleanly. No console.* from this module — ever.
 * 4. Raw pass-through: every non-session key (code verifier, JWKS cache, …)
 *    is returned verbatim and never parsed.
 * 5. Read-through legacy fallback: on a Keychain MISS the same key is read
 *    from AsyncStorage (the v1.41.0 storage). This is what makes the Keychain
 *    migration safe against the auth-js constructor race: createClient()
 *    fires `_recoverAndRefresh()` at module scope — BEFORE App.tsx can run
 *    the migration sweep — so the very first storage read must be able to
 *    see the legacy session. A Keychain HIT always wins; AsyncStorage is
 *    only consulted on a miss, so post-migration state is never shadowed.
 * 6. `migrateLegacySession()` (see ./migrateLegacySession) formalizes the
 *    copy with write → verify → delete; this adapter itself never deletes.
 */

const SERVICE_PREFIX = 'drs.supabase.';
const AUTH_TOKEN_SUFFIX = '-auth-token';

const isSessionKey = (key: string): boolean => key.endsWith(AUTH_TOKEN_SUFFIX);

/**
 * JSON guard for session keys. Invalid payload → null, silently.
 * Non-session keys pass through untouched (raw verifier must survive).
 */
const guardRead = (key: string, value: string | null): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isSessionKey(key)) {
    return value;
  }
  try {
    JSON.parse(value);
    return value;
  } catch {
    // Silent by contract — never log, never throw. Corrupt session == no
    // session from auth-js's point of view; it will re-authenticate.
    return null;
  }
};

const serviceFor = (key: string): string => `${SERVICE_PREFIX}${key}`;

/**
 * Resolved lazily and defensively: some test environments substitute a
 * Keychain mock that lacks the ACCESSIBLE enum; on-device it always exists.
 * Returning undefined under such mocks is harmless (keychain falls back to
 * its own default), and module scope stays load-safe in every suite.
 */
const deviceBoundAccessible = (): string | undefined =>
  (Keychain as {ACCESSIBLE?: {WHEN_UNLOCKED_THIS_DEVICE_ONLY?: string}})
    .ACCESSIBLE?.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

/** Read/reset options — BaseOptions has no `accessible` in keychain v10. */
const readOptions = (key: string): Keychain.BaseOptions => ({
  service: serviceFor(key),
});

/** Write options — `accessible` belongs to SetOptions (iOS, visionOS). */
const writeOptions = (key: string): Keychain.SetOptions => {
  const accessible = deviceBoundAccessible();
  return {
    service: serviceFor(key),
    ...(accessible ? {accessible} : {}),
  } as Keychain.SetOptions;
};

const getItem = async (key: string): Promise<string | null> => {
  try {
    const cred = await Keychain.getGenericPassword({
      ...readOptions(key),
    });
    if (cred && typeof cred.password === 'string') {
      // Keychain HIT — authoritative. Guarded keys: invalid JSON → null
      // (deliberately NO legacy fallback on a hit: never resurrect a stale
      // AsyncStorage session over an existing Keychain entry).
      return guardRead(key, cred.password);
    }
  } catch {
    // Silent: Keychain failure (device-locked, keystore hiccup) behaves like
    // a miss so the legacy fallback can still serve an unmigrated session.
  }
  // Keychain MISS → legacy read-through with the same guard applied.
  try {
    const legacy = await AsyncStorage.getItem(key);
    return guardRead(key, legacy);
  } catch {
    return null;
  }
};

const setItem = async (key: string, data: string): Promise<void> => {
  // Errors propagate: a failed persist is auth-js's signal to keep the
  // session in memory and retry; swallowing it here would fake success.
  await Keychain.setGenericPassword(key, data, writeOptions(key));
};

const removeItem = async (key: string): Promise<void> => {
  await Keychain.resetGenericPassword(readOptions(key));
};

/**
 * Keychain-backed storage adapter — structurally satisfies auth-js's
 * SupportedStorage (checked at the createClient call site in
 * src/services/drshub/supabase.ts). See the contract header above.
 */
export const supabaseSecureStorage = {
  getItem,
  setItem,
  removeItem,
  // auth-js probes these when present; same async paths.
  getItemAsync: getItem,
  setItemAsync: setItem,
  removeItemAsync: removeItem,
  isServer: false,
};

/** Exposed for the migration sweep's pre-write validation (same rule set). */
export const isValidSessionPayload = (key: string, value: string): boolean => {
  if (!isSessionKey(key)) {
    return true;
  }
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};
