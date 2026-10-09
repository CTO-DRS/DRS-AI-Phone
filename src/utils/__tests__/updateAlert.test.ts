import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  shouldShowUpdateAlert,
  dismissUpdateVersion,
  getDismissedUpdateVersion,
  getLastUpdateAlertAt,
  markUpdateAlerted,
  DISMISS_COOLDOWN_MS,
} from '../updateAlert';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      _store: store,
    },
  };
});

const storage = (AsyncStorage as unknown as {_store: Map<string, string>})
  ._store;

const update = {
  currentVersion: '1.40.0',
  latestVersion: '1.41.0',
  releaseUrl: 'https://github.com/x/r/releases/tag/v1.41.0',
};

describe('shouldShowUpdateAlert', () => {
  const NOW = 1_800_000_000_000;

  it('alerts when there is no dismissal and no recent alert', () => {
    expect(shouldShowUpdateAlert(update, null, 0, NOW)).toBe(true);
  });

  it('stays silent for the exact version the user dismissed', () => {
    expect(shouldShowUpdateAlert(update, '1.41.0', 0, NOW)).toBe(false);
  });

  it('re-arms for a NEWER version after a dismissal', () => {
    expect(shouldShowUpdateAlert(update, '1.40.0', 0, NOW)).toBe(true);
  });

  it('throttles repeat alerts within the cooldown window', () => {
    expect(
      shouldShowUpdateAlert(
        update,
        null,
        NOW - DISMISS_COOLDOWN_MS + 1000,
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldShowUpdateAlert(update, null, NOW - DISMISS_COOLDOWN_MS, NOW),
    ).toBe(true);
  });
});

describe('dismissal persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clear();
  });

  it('stores and reads back the dismissed version', async () => {
    await dismissUpdateVersion('1.41.0');
    expect(await getDismissedUpdateVersion()).toBe('1.41.0');
  });

  it('stores and reads back the last-alert timestamp', async () => {
    expect(await getLastUpdateAlertAt()).toBe(0);
    await markUpdateAlerted();
    expect(await getLastUpdateAlertAt()).toBeGreaterThan(0);
  });

  it('degrades to defaults when storage fails', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error('locked'),
    );
    expect(await getDismissedUpdateVersion()).toBeNull();
    expect(await getLastUpdateAlertAt()).toBe(0);
  });
});
