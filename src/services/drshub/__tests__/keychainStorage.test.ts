// SEC-07 (audit v1.41.0) regression tests: the Supabase session must live in
// the keychain, never in plaintext AsyncStorage.
//
// The audit's acceptance test ("login → kill app → resume: session restored
// from keychain") needs a device; these unit tests verify the adapter
// mechanics it relies on: keychain round-trip, legacy plaintext migration +
// erasure, sign-out cleanup, and the no-plaintext fallback when the keychain
// write fails.

import * as Keychain from 'react-native-keychain';

import {keychainStorage} from '../keychainStorage';

// In-memory AsyncStorage mock — the established pattern in this repo (see
// appUpdate.test.ts / bootHealth.test.ts): each suite defines its own factory
// instead of relying on the global moduleNameMapper wrapper.
jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
      clear: jest.fn(async () => {
        values.clear();
      }),
    },
  };
});

const AsyncStorage = require('@react-native-async-storage/async-storage')
  .default as typeof import('@react-native-async-storage/async-storage').default;

const setMock = Keychain.setGenericPassword as jest.Mock;
const getMock = Keychain.getGenericPassword as jest.Mock;
const resetMock = Keychain.resetGenericPassword as jest.Mock;

const SESSION_KEY = 'sb-testproject-auth-token';

const keychainHit = (key: string, value: string) =>
  getMock.mockImplementation(async () => ({
    username: key,
    password: value,
    service: `drsai_supabase_session_${key}`,
  }));

describe('keychainStorage (SEC-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMock.mockImplementation(async () => false);
    setMock.mockImplementation(async () => true);
    resetMock.mockImplementation(async () => true);
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  describe('keychain round-trip', () => {
    it('setItem writes the value under a per-key keychain service', async () => {
      await keychainStorage.setItem(
        SESSION_KEY,
        '{"access_token":"at","refresh_token":"rt"}',
      );

      expect(setMock).toHaveBeenCalledWith(
        SESSION_KEY,
        '{"access_token":"at","refresh_token":"rt"}',
        {service: `drsai_supabase_session_${SESSION_KEY}`},
      );
    });

    it('getItem returns the keychain value and never touches AsyncStorage', async () => {
      keychainHit(SESSION_KEY, 'stored-session');

      await expect(keychainStorage.getItem(SESSION_KEY)).resolves.toBe(
        'stored-session',
      );
      expect(getMock).toHaveBeenCalledWith({
        service: `drsai_supabase_session_${SESSION_KEY}`,
      });
      expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    });

    it('ignores a keychain entry stored under a different key', async () => {
      // A foreign entry under the same service must not leak as this key's
      // value: the username must match.
      getMock.mockImplementation(async () => ({
        username: 'sb-other-project-auth-token',
        password: 'foreign-session',
      }));

      await expect(keychainStorage.getItem(SESSION_KEY)).resolves.toBeNull();
    });

    it('sanitizes unsafe characters out of the derived service name', async () => {
      await keychainStorage.setItem('odd key/with spaces', 'v');
      expect(setMock).toHaveBeenCalledWith('odd key/with spaces', 'v', {
        service: 'drsai_supabase_session_odd_key_with_spaces',
      });
    });
  });

  describe('legacy plaintext migration', () => {
    it('moves an existing AsyncStorage session into the keychain and erases the plaintext copy', async () => {
      await AsyncStorage.setItem(SESSION_KEY, 'legacy-plaintext-session');

      await expect(keychainStorage.getItem(SESSION_KEY)).resolves.toBe(
        'legacy-plaintext-session',
      );

      expect(setMock).toHaveBeenCalledWith(
        SESSION_KEY,
        'legacy-plaintext-session',
        {service: `drsai_supabase_session_${SESSION_KEY}`},
      );
      await expect(AsyncStorage.getItem(SESSION_KEY)).resolves.toBeNull();
    });

    it('does not migrate when the keychain already holds the session', async () => {
      keychainHit(SESSION_KEY, 'keychain-session');
      await AsyncStorage.setItem(SESSION_KEY, 'stale-plaintext');

      await expect(keychainStorage.getItem(SESSION_KEY)).resolves.toBe(
        'keychain-session',
      );
      expect(setMock).not.toHaveBeenCalled();
      await expect(AsyncStorage.getItem(SESSION_KEY)).resolves.toBe(
        'stale-plaintext', // untouched — the keychain value wins
      );
    });
  });

  describe('sign-out cleanup', () => {
    it('removeItem clears keychain, memory and any legacy plaintext copy', async () => {
      await AsyncStorage.setItem(SESSION_KEY, 'legacy');

      await keychainStorage.removeItem(SESSION_KEY);

      expect(resetMock).toHaveBeenCalledWith({
        service: `drsai_supabase_session_${SESSION_KEY}`,
      });
      await expect(AsyncStorage.getItem(SESSION_KEY)).resolves.toBeNull();
    });
  });

  describe('no silent plaintext fallback', () => {
    it('keeps a failed write in memory for the current run only', async () => {
      setMock.mockImplementation(async () => false); // keychain unavailable

      await keychainStorage.setItem(SESSION_KEY, 'session-value');

      await expect(keychainStorage.getItem(SESSION_KEY)).resolves.toBe(
        'session-value',
      );
      // The value must NOT have been persisted to plaintext storage.
      await expect(AsyncStorage.getItem(SESSION_KEY)).resolves.toBeNull();
    });

    it('returns null after a cold start when the keychain write had failed', async () => {
      setMock.mockImplementation(async () => false);
      await keychainStorage.setItem(SESSION_KEY, 'session-value');

      // Simulate the cold start: fresh module instance, empty keychain.
      jest.resetModules();
      const fresh = require('../keychainStorage').keychainStorage;
      await expect(fresh.getItem(SESSION_KEY)).resolves.toBeNull();
    });

    it('treats a thrown keychain write like a failed one', async () => {
      setMock.mockRejectedValue(new Error('keychain locked'));

      await keychainStorage.setItem(SESSION_KEY, 'session-value');

      await expect(keychainStorage.getItem(SESSION_KEY)).resolves.toBe(
        'session-value',
      );
      await expect(AsyncStorage.getItem(SESSION_KEY)).resolves.toBeNull();
    });
  });
});
