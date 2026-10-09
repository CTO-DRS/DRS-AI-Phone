import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

/**
 * App self-update check for the About screen.
 *
 * Queries the public GitHub Releases API for the latest published
 * release and compares it against the running version. Results are
 * cached in AsyncStorage so the About screen can be revisited without
 * hammering the API (and so the banner still works while offline).
 * Never throws: any failure degrades to `null` ("no update to show").
 */

export const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/CTO-DRS/DRS-AI-Phone/releases/latest';

const CACHE_KEY = '@drsai/app-update-cache-v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REQUEST_TIMEOUT_MS = 8000;

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
}

interface UpdateCache {
  checkedAt: number;
  latestVersion: string;
  releaseUrl: string;
}

/**
 * Numeric dotted-version compare ("1.10.0" > "1.9.4"). Non-numeric
 * segments fall back to string equality; prerelease/build suffixes are
 * compared loosely (a plain "1.36.0" release is considered newer than a
 * running "1.36.0-rc.1" only by segment count — good enough for an
 * informational banner, never used to gate functionality).
 */
export const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? '0';
    const sb = pb[i] ?? '0';
    const na = parseInt(sa, 10);
    const nb = parseInt(sb, 10);
    const bothNumeric = !isNaN(na) && !isNaN(nb);
    if (bothNumeric) {
      if (na !== nb) {
        return na < nb ? -1 : 1;
      }
    } else if (sa !== sb) {
      return sa < sb ? -1 : 1;
    }
  }
  return 0;
};

const stripLeadingV = (tag: string): string => tag.replace(/^v/i, '');

const readCache = async (): Promise<UpdateCache | null> => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as UpdateCache;
    if (
      typeof parsed.checkedAt !== 'number' ||
      typeof parsed.latestVersion !== 'string' ||
      typeof parsed.releaseUrl !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = async (cache: UpdateCache): Promise<void> => {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache write failures are non-fatal.
  }
};

/**
 * Fetch the latest release info straight from the API. Rejects on any
 * network/parse failure — callers (checkForAppUpdate) handle that.
 */
export const fetchLatestRelease = async (): Promise<{
  latestVersion: string;
  releaseUrl: string;
}> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: {Accept: 'application/vnd.github+json'},
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub API responded ${response.status}`);
    }
    const data = (await response.json()) as {
      tag_name?: unknown;
      html_url?: unknown;
    };
    if (
      typeof data.tag_name !== 'string' ||
      typeof data.html_url !== 'string'
    ) {
      throw new Error('Unexpected GitHub release payload');
    }
    return {
      latestVersion: stripLeadingV(data.tag_name),
      releaseUrl: data.html_url,
    };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Returns update info when the latest published release is newer than
 * the running version, otherwise null. Uses the cache when fresh; a
 * network failure falls back to a stale cache before giving up.
 */
export const checkForAppUpdate = async (): Promise<AppUpdateInfo | null> => {
  const currentVersion = DeviceInfo.getVersion();

  let latest: {latestVersion: string; releaseUrl: string} | null = null;
  let cache: UpdateCache | null = null;

  try {
    cache = await readCache();
    if (cache && Date.now() - cache.checkedAt < CACHE_TTL_MS) {
      latest = {
        latestVersion: cache.latestVersion,
        releaseUrl: cache.releaseUrl,
      };
    } else {
      latest = await fetchLatestRelease();
      await writeCache({
        checkedAt: Date.now(),
        latestVersion: latest.latestVersion,
        releaseUrl: latest.releaseUrl,
      });
    }
  } catch {
    // Network/parse failure: fall back to a stale cache if we have one.
    if (cache) {
      latest = {
        latestVersion: cache.latestVersion,
        releaseUrl: cache.releaseUrl,
      };
    }
  }

  if (!latest) {
    return null;
  }

  if (compareVersions(latest.latestVersion, currentVersion) <= 0) {
    return null;
  }

  return {
    currentVersion,
    latestVersion: latest.latestVersion,
    releaseUrl: latest.releaseUrl,
  };
};
