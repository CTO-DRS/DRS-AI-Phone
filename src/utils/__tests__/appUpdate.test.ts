import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

import {
  checkForAppUpdate,
  compareVersions,
  GITHUB_LATEST_RELEASE_URL,
} from '../appUpdate';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  const storage = {
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
  };
  return {__esModule: true, default: storage, ...storage};
});

const releasePayload = (tag: string) => ({
  tag_name: tag,
  html_url: `https://github.com/CTO-DRS/DRS-AI-Phone/releases/tag/${tag}`,
});

describe('compareVersions', () => {
  it.each([
    ['1.36.0', '1.36.0', 0],
    ['1.37.0', '1.36.0', 1],
    ['1.36.0', '1.37.0', -1],
    ['1.10.0', '1.9.4', 1], // numeric compare, not lexicographic
    ['2.0', '1.9.9', 1], // missing segments padded with 0
    ['1.36', '1.36.0', 0], // padding equalizes
  ])('compareVersions(%s, %s) => %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe('checkForAppUpdate', () => {
  const currentVersion = '1.36.0';

  beforeEach(() => {
    jest.clearAllMocks();
    (DeviceInfo.getVersion as jest.Mock).mockReturnValue(currentVersion);
    global.fetch = jest.fn();
    return AsyncStorage.clear();
  });

  it('returns update info when a newer release is published', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => releasePayload('v1.37.0'),
    });

    const info = await checkForAppUpdate();

    expect(global.fetch).toHaveBeenCalledWith(
      GITHUB_LATEST_RELEASE_URL,
      expect.anything(),
    );
    expect(info).toEqual({
      currentVersion,
      latestVersion: '1.37.0',
      releaseUrl:
        'https://github.com/CTO-DRS/DRS-AI-Phone/releases/tag/v1.37.0',
    });
  });

  it('returns null when the running version is the latest', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => releasePayload('v1.36.0'),
    });

    expect(await checkForAppUpdate()).toBeNull();
  });

  it('returns null when the published release is older than the running build', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => releasePayload('v1.35.2'),
    });

    expect(await checkForAppUpdate()).toBeNull();
  });

  it('returns null on network failure (never throws)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network offline'));

    expect(await checkForAppUpdate()).toBeNull();
  });

  it('returns null on non-2xx API responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    expect(await checkForAppUpdate()).toBeNull();
  });

  it('serves repeat checks from the cache without refetching', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => releasePayload('v1.37.0'),
    });

    const first = await checkForAppUpdate();
    expect(first).not.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const second = await checkForAppUpdate();
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1); // cache hit, no refetch
  });

  it('falls back to a stale cache when the network fails', async () => {
    // Prime the cache with a past successful check.
    await AsyncStorage.setItem(
      '@drsai/app-update-cache-v1',
      JSON.stringify({
        checkedAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
        latestVersion: '1.38.0',
        releaseUrl:
          'https://github.com/CTO-DRS/DRS-AI-Phone/releases/tag/v1.38.0',
      }),
    );

    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    const info = await checkForAppUpdate();
    expect(info).toEqual({
      currentVersion,
      latestVersion: '1.38.0',
      releaseUrl:
        'https://github.com/CTO-DRS/DRS-AI-Phone/releases/tag/v1.38.0',
    });
  });
});
