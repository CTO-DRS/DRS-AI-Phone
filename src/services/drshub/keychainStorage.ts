import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

/**
 * Keychain-backed storage adapter for the Supabase auth session (SEC-07,
 * audit v1.41.0).
 *
 * Supabase-js persists the ENTIRE session — access token, refresh token and
 * user metadata — through the `storage` option of createClient. The default
 * React Native choice is AsyncStorage, which stores everything in plaintext
 * on disk. This adapter routes every read/write through react-native-keychain
 * instead (Android Keystore-backed storage / iOS keychain), so the session
 * never touches plaintext persistence.
 *
 * Migration of existing sessions: on a read that misses the keychain, a
 * value previously written by the AsyncStorage-backed client is copied into
 * the keychain and then ERASED from AsyncStorage — the plaintext copy is
 * removed, not left to linger forever.
 *
 * Degraded path: if the keychain write itself fails, the value is kept in an
 * in-memory map so the CURRENT app run keeps working (the running session
 * always lives in memory anyway), and a loud warning is emitted. The next
 * cold start will require re-authentication — a deliberate trade-off: never
 * silently fall back to plaintext persistence.
 *
 * Each storage key gets its own keychain service entry
 * (`drsai_supabase_session_<key>`): supabase-js may hold several keys at once
 * (session + OAuth code verifiers + lock), and a shared service would
 * overwrite entries. This mirrors the per-provider services used by
 * SearchProviderStore/ServerStore for the same reason.
 */

const SUPABASE_SESSION_SERVICE = 'drsai_supabase_session';

// react-native-keychain resolves `false` (not null) when nothing is stored
// under the service on some platforms, so narrow the union explicitly.
type KeychainCredentials = {username: string; password: string} | false;

/** In-memory fallback used only when a keychain write has failed. */
const memoryFallback = new Map<string, string>();

/** Keychain services must be stable identifiers — keep [A-Za-z0-9_.-]. */
const serviceFor = (key: string): string =>
  `${SUPABASE_SESSION_SERVICE}_${key.replace(/[^A-Za-z0-9_.-]/g, '_')}`;

async function readKeychain(key: string): Promise<string | null> {
  try {
    const credentials = (await Keychain.getGenericPassword({
      service: serviceFor(key),
    })) as KeychainCredentials;
    // username carries the storage key so a stale/foreign entry under the
    // same service can never be mistaken for this key's value.
    if (
      credentials &&
      credentials.username === key &&
      typeof credentials.password === 'string'
    ) {
      return credentials.password;
    }
    return null;
  } catch (error) {
    console.warn('[keychainStorage] keychain read failed:', error);
    return null;
  }
}

async function writeKeychain(key: string, value: string): Promise<boolean> {
  try {
    const ok = await Keychain.setGenericPassword(key, value, {
      service: serviceFor(key),
    });
    if (ok === false) {
      // v10 resolves `false` on some failure paths instead of throwing.
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[keychainStorage] keychain write failed:', error);
    return false;
  }
}

async function eraseKeychain(key: string): Promise<void> {
  try {
    await Keychain.resetGenericPassword({service: serviceFor(key)});
  } catch (error) {
    // Removing a non-existent entry is not an error worth surfacing;
    // anything else is logged and ignored — removeItem must not throw
    // into supabase-js sign-out flows.
    console.warn('[keychainStorage] keychain reset failed:', error);
  }
}

export const keychainStorage = {
  async getItem(key: string): Promise<string | null> {
    const fromKeychain = await readKeychain(key);
    if (fromKeychain !== null) {
      return fromKeychain;
    }

    // Legacy migration: a previous AsyncStorage-backed client may have left
    // the session in plaintext storage. Copy it into the keychain and erase
    // the plaintext copy.
    try {
      const legacy = await AsyncStorage.getItem(key);
      if (legacy !== null) {
        if (await writeKeychain(key, legacy)) {
          await AsyncStorage.removeItem(key);
        }
        return legacy;
      }
    } catch (error) {
      console.warn('[keychainStorage] legacy migration skipped:', error);
    }

    const inMemory = memoryFallback.get(key);
    return inMemory !== undefined ? inMemory : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const stored = await writeKeychain(key, value);
    if (!stored) {
      // Keychain unavailable: keep the value for THIS app run only.
      // Deliberately NOT written to AsyncStorage — that would recreate
      // the plaintext exposure SEC-07 fixes.
      memoryFallback.set(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    await eraseKeychain(key);
    memoryFallback.delete(key);
    // Also clear any legacy plaintext copy so sign-out is thorough.
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn('[keychainStorage] legacy remove failed:', error);
    }
  },
};
