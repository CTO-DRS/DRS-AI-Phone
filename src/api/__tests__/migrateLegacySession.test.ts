/**
 * migrateLegacySession contract tests (fix 2) — write → verify → delete,
 * never-lose-a-session invariants. Local per-file mocks (shared mock is
 * circularly broken — see docs/audit-worklog.md); mock vars carry the
 * `mock` prefix for babel hoisting; no logging, no timers, no handles.
 *
 * MOCKING BOUNDARY (documented): the sweep is tested against the
 * supabaseSecureStorage INTERFACE (jest.mock on the relative path — outside
 * moduleNameMapper, hence deterministic). jest.mock factories do NOT reach
 * modules imported transitively in this jest/mapper setup (verified by 4
 * controlled probes — see docs/audit-worklog.md); the adapter's own real
 * behavior is fully covered by supabaseSecureStorage.test.ts, which imports
 * it directly.
 */
import {migrateLegacySession} from '../migrateLegacySession';

const mockSecureGetItem = jest.fn();
const mockSecureSetItem = jest.fn();
const mockSecureRemoveItem = jest.fn();

jest.mock('../supabaseSecureStorage', () => ({
  __esModule: true,
  supabaseSecureStorage: {
    getItem: (...args: unknown[]) => mockSecureGetItem(...args),
    setItem: (...args: unknown[]) => mockSecureSetItem(...args),
    removeItem: (...args: unknown[]) => mockSecureRemoveItem(...args),
  },
  isValidSessionPayload: (key: string, value: string): boolean =>
    !key.endsWith('-auth-token') ||
    (() => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    })(),
}));

const mockAsyncStorageKeys = jest.fn();
const mockAsyncStorageGet = jest.fn();
const mockAsyncStorageRemove = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getAllKeys: (...args: unknown[]) => mockAsyncStorageKeys(...args),
    getItem: (...args: unknown[]) => mockAsyncStorageGet(...args),
    setItem: (...args: unknown[]) => jest.fn()(...args),
    removeItem: (...args: unknown[]) => mockAsyncStorageRemove(...args),
  },
}));

const KEY = 'sb-ref123-auth-token';
const OTHER_KEY = 'sb-ref999-auth-token';
const VERIFIER_KEY = 'sb-ref123-auth-token-code-verifier';
const SESSION_JSON = JSON.stringify({access_token: 'at', refresh_token: 'rt'});
const OTHER_SESSION_JSON = JSON.stringify({
  access_token: 'at2',
  refresh_token: 'rt2',
});

beforeEach(() => {
  [
    mockSecureGetItem,
    mockSecureSetItem,
    mockSecureRemoveItem,
    mockAsyncStorageKeys,
    mockAsyncStorageGet,
    mockAsyncStorageRemove,
  ].forEach(m => m.mockReset());
  mockAsyncStorageKeys.mockResolvedValue([] as string[]);
  mockAsyncStorageGet.mockResolvedValue(null);
  mockSecureGetItem.mockResolvedValue(null);
});

describe('migrateLegacySession', () => {
  it('copies a legacy session, then deletes the legacy key only after verified write', async () => {
    mockAsyncStorageKeys.mockResolvedValue([KEY]);
    mockAsyncStorageGet.mockImplementation(async (k: string) =>
      k === KEY ? SESSION_JSON : null,
    );
    mockSecureGetItem
      .mockResolvedValueOnce(null) // authoritative read: Keychain empty
      .mockResolvedValueOnce(SESSION_JSON); // verify read: matches

    const report = await migrateLegacySession();

    expect(report.migrated).toEqual([KEY]);
    expect(report.failed).toEqual([]);
    expect(mockSecureSetItem).toHaveBeenCalledWith(KEY, SESSION_JSON);
    expect(mockAsyncStorageRemove).toHaveBeenCalledWith(KEY);
  });

  it('keeps the legacy key when the read-back verification mismatches', async () => {
    mockAsyncStorageKeys.mockResolvedValue([KEY]);
    mockAsyncStorageGet.mockResolvedValue(SESSION_JSON);
    mockSecureGetItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(OTHER_SESSION_JSON); // verify mismatch

    const report = await migrateLegacySession();

    expect(report.failed).toEqual([KEY]);
    expect(mockAsyncStorageRemove).not.toHaveBeenCalled();
  });

  it('is idempotent — a second run finds nothing to do', async () => {
    mockAsyncStorageKeys.mockResolvedValue([KEY]);
    mockAsyncStorageGet.mockResolvedValue(SESSION_JSON);
    mockSecureGetItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(SESSION_JSON);
    await migrateLegacySession();
    expect(mockAsyncStorageRemove).toHaveBeenCalledWith(KEY);

    mockAsyncStorageKeys.mockResolvedValue([] as string[]);
    mockAsyncStorageRemove.mockClear();
    mockSecureSetItem.mockClear();

    const report = await migrateLegacySession();

    expect(report).toEqual({migrated: [], skipped: [], failed: []});
    expect(mockSecureSetItem).not.toHaveBeenCalled();
    expect(mockAsyncStorageRemove).not.toHaveBeenCalled();
  });

  it('drops the legacy key without rewriting when secure storage already matches', async () => {
    mockAsyncStorageKeys.mockResolvedValue([KEY]);
    mockAsyncStorageGet.mockResolvedValue(SESSION_JSON);
    mockSecureGetItem.mockResolvedValue(SESSION_JSON); // authoritative match

    const report = await migrateLegacySession();

    expect(report.migrated).toEqual([KEY]);
    expect(mockSecureSetItem).not.toHaveBeenCalled();
    expect(mockAsyncStorageRemove).toHaveBeenCalledWith(KEY);
  });

  it('leaves the legacy key in place when secure storage holds a different, newer session', async () => {
    mockAsyncStorageKeys.mockResolvedValue([KEY]);
    mockAsyncStorageGet.mockResolvedValue(SESSION_JSON);
    mockSecureGetItem.mockResolvedValue(OTHER_SESSION_JSON);

    const report = await migrateLegacySession();

    expect(report.skipped).toEqual([KEY]);
    expect(mockAsyncStorageRemove).not.toHaveBeenCalled();
    expect(mockSecureSetItem).not.toHaveBeenCalled();
  });

  it('never promotes a corrupt legacy payload — skipped and preserved', async () => {
    mockAsyncStorageKeys.mockResolvedValue([KEY]);
    mockAsyncStorageGet.mockResolvedValue('{corrupt');

    const report = await migrateLegacySession();

    expect(report.skipped).toEqual([KEY]);
    expect(mockSecureSetItem).not.toHaveBeenCalled();
    expect(mockAsyncStorageRemove).not.toHaveBeenCalled();
  });

  it('does nothing when no legacy session keys exist', async () => {
    mockAsyncStorageKeys.mockResolvedValue(['unrelated.key', 'ui.theme']);

    const report = await migrateLegacySession();

    expect(report).toEqual({migrated: [], skipped: [], failed: []});
    expect(mockSecureSetItem).not.toHaveBeenCalled();
    expect(mockAsyncStorageRemove).not.toHaveBeenCalled();
  });

  it('does not sweep non-session legacy keys (PKCE verifier stays raw, untouched)', async () => {
    mockAsyncStorageKeys.mockResolvedValue([VERIFIER_KEY]);
    mockAsyncStorageGet.mockResolvedValue('raw-verifier');

    const report = await migrateLegacySession();

    expect(report).toEqual({migrated: [], skipped: [], failed: []});
    expect(mockSecureSetItem).not.toHaveBeenCalled();
  });

  it('handles multiple legacy keys with mixed outcomes and aggregates the report', async () => {
    // Stateful secure-storage stub: KEY starts empty (→ migrate),
    // OTHER_KEY already holds a DIFFERENT newer session (→ skipped).
    const secureStore = new Map<string, string>([
      [OTHER_KEY, JSON.stringify({access_token: 'newer'})],
    ]);
    mockSecureGetItem.mockImplementation(
      async (k: string) => secureStore.get(k) ?? null,
    );
    mockSecureSetItem.mockImplementation(async (k: string, v: string) => {
      secureStore.set(k, v);
    });
    mockAsyncStorageKeys.mockResolvedValue([KEY, OTHER_KEY]);
    mockAsyncStorageGet.mockImplementation(async (k: string) =>
      k === KEY ? SESSION_JSON : OTHER_SESSION_JSON,
    );

    const report = await migrateLegacySession();

    expect(report.migrated).toEqual([KEY]);
    expect(report.skipped).toEqual([OTHER_KEY]);
    expect(mockAsyncStorageRemove).toHaveBeenCalledTimes(1);
    expect(mockAsyncStorageRemove).toHaveBeenCalledWith(KEY);
  });

  it('survives a storage-level failure with a warn-only catch and an empty report', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAsyncStorageKeys.mockRejectedValue(new Error('storage blown up'));

    const report = await migrateLegacySession();

    expect(report).toEqual({migrated: [], skipped: [], failed: []});
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(mockSecureSetItem).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
