/**
 * supabaseSecureStorage contract tests (fix 2).
 * Local per-file mocks — the repository-shared AsyncStorage mock is
 * circularly broken (see docs/audit-worklog.md). Mock variables start with
 * `mock` per the babel-hoisting rule. No console.* at module scope, no
 * timers, no open handles after the suite completes.
 */
import {
  isValidSessionPayload,
  supabaseSecureStorage,
} from '../supabaseSecureStorage';

const mockKeychainStore = new Map<string, string>();
const mockGetGenericPassword = jest.fn();
const mockSetGenericPassword = jest.fn();
const mockResetGenericPassword = jest.fn();

jest.mock('react-native-keychain', () => ({
  __esModule: true,
  ACCESSIBLE: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  },
  getGenericPassword: (...args: unknown[]) => mockGetGenericPassword(...args),
  setGenericPassword: (...args: unknown[]) => mockSetGenericPassword(...args),
  resetGenericPassword: (...args: unknown[]) =>
    mockResetGenericPassword(...args),
}));

const mockAsyncStorageGet = jest.fn();
const mockAsyncStorageSet = jest.fn();
const mockAsyncStorageRemove = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => mockAsyncStorageGet(...args),
    setItem: (...args: unknown[]) => mockAsyncStorageSet(...args),
    removeItem: (...args: unknown[]) => mockAsyncStorageRemove(...args),
  },
}));

const SESSION_KEY = 'sb-ref123-auth-token';
const VERIFIER_KEY = 'sb-ref123-auth-token-code-verifier';
const SESSION_JSON = JSON.stringify({access_token: 'at', refresh_token: 'rt'});

beforeEach(() => {
  mockKeychainStore.clear();
  mockGetGenericPassword.mockReset();
  mockSetGenericPassword.mockReset();
  mockResetGenericPassword.mockReset();
  mockAsyncStorageGet.mockReset();
  mockAsyncStorageSet.mockReset();
  mockAsyncStorageRemove.mockReset();

  mockGetGenericPassword.mockImplementation(
    async ({service}: {service: string}) =>
      mockKeychainStore.has(service)
        ? {username: service, password: mockKeychainStore.get(service)}
        : false,
  );
  mockSetGenericPassword.mockImplementation(
    async (
      username: string,
      password: string,
      {service}: {service: string},
    ) => {
      mockKeychainStore.set(service, password);
      return true;
    },
  );
  mockResetGenericPassword.mockImplementation(
    async ({service}: {service: string}) => {
      mockKeychainStore.delete(service);
      return true;
    },
  );
  mockAsyncStorageGet.mockResolvedValue(null);
});

describe('supabaseSecureStorage', () => {
  it('roundtrips a session payload through the Keychain', async () => {
    await supabaseSecureStorage.setItem(SESSION_KEY, SESSION_JSON);
    await expect(supabaseSecureStorage.getItem(SESSION_KEY)).resolves.toBe(
      SESSION_JSON,
    );
  });

  it('returns null silently for corrupt JSON on a session key — no fallback, no logging', async () => {
    mockKeychainStore.set(`drs.supabase.${SESSION_KEY}`, '{corrupt');
    const warnSpy = jest.spyOn(console, 'warn');
    const errorSpy = jest.spyOn(console, 'error');
    mockAsyncStorageGet.mockResolvedValue('{"legacy":true}');
    await expect(
      supabaseSecureStorage.getItem(SESSION_KEY),
    ).resolves.toBeNull();
    // Keychain HIT wins: corrupt entry must NOT resurrect the legacy session.
    expect(mockAsyncStorageGet).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('passes non-session keys through verbatim even when they are not JSON', async () => {
    mockKeychainStore.set(
      `drs.supabase.${VERIFIER_KEY}`,
      'raw-pkce-verifier-string',
    );
    await expect(supabaseSecureStorage.getItem(VERIFIER_KEY)).resolves.toBe(
      'raw-pkce-verifier-string',
    );
  });

  it('falls back to AsyncStorage on a Keychain miss (read-through legacy)', async () => {
    mockAsyncStorageGet.mockResolvedValue(SESSION_JSON);
    await expect(supabaseSecureStorage.getItem(SESSION_KEY)).resolves.toBe(
      SESSION_JSON,
    );
    expect(mockAsyncStorageGet).toHaveBeenCalledWith(SESSION_KEY);
  });

  it('uses the drs.supabase.* service namespace and iOS THIS_DEVICE_ONLY on write', async () => {
    await supabaseSecureStorage.setItem(SESSION_KEY, SESSION_JSON);
    expect(mockSetGenericPassword).toHaveBeenCalledWith(
      SESSION_KEY,
      SESSION_JSON,
      expect.objectContaining({
        service: `drs.supabase.${SESSION_KEY}`,
        accessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
      }),
    );
  });

  it('scopes reads to the drs.supabase.* service namespace', async () => {
    await supabaseSecureStorage.getItem(SESSION_KEY);
    expect(mockGetGenericPassword).toHaveBeenCalledWith(
      expect.objectContaining({service: `drs.supabase.${SESSION_KEY}`}),
    );
  });

  it('treats a Keychain read error like a miss and serves the legacy value', async () => {
    mockGetGenericPassword.mockRejectedValue(new Error('keystore locked'));
    mockAsyncStorageGet.mockResolvedValue(SESSION_JSON);
    await expect(supabaseSecureStorage.getItem(SESSION_KEY)).resolves.toBe(
      SESSION_JSON,
    );
  });

  it('removes via resetGenericPassword scoped to the same service', async () => {
    await supabaseSecureStorage.setItem(SESSION_KEY, SESSION_JSON);
    await supabaseSecureStorage.removeItem(SESSION_KEY);
    expect(mockResetGenericPassword).toHaveBeenCalledWith(
      expect.objectContaining({service: `drs.supabase.${SESSION_KEY}`}),
    );
    await expect(
      supabaseSecureStorage.getItem(SESSION_KEY),
    ).resolves.toBeNull();
  });

  describe('isValidSessionPayload (pre-write validation)', () => {
    it('accepts valid JSON session payloads and raw verifier strings', () => {
      expect(isValidSessionPayload(SESSION_KEY, SESSION_JSON)).toBe(true);
      expect(isValidSessionPayload(VERIFIER_KEY, 'raw-verifier')).toBe(true);
    });

    it('rejects invalid JSON only on session keys', () => {
      expect(isValidSessionPayload(SESSION_KEY, '{corrupt')).toBe(false);
      expect(isValidSessionPayload(VERIFIER_KEY, '{corrupt')).toBe(true);
    });
  });
});
