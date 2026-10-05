import {useState, useEffect} from 'react';
import DeviceInfo from 'react-native-device-info';

import {
  getCpuCoreCount,
  checkGpuSupport,
} from '../../../utils/deviceCapabilities';
import {DeviceProfileSnapshot} from '../../../utils/compatibility';
import {modelStore} from '../../../store';

let cachedProfile: DeviceProfileSnapshot | null = null;
let inFlight: Promise<DeviceProfileSnapshot> | null = null;

/**
 * Collects the real device facts the compatibility engine needs. Gathered
 * once per app session and cached module-level — none of these values change
 * materially at runtime (free disk is refreshed by callers that need it).
 */
export const gatherDeviceProfile = async (): Promise<DeviceProfileSnapshot> => {
  if (cachedProfile) {
    return cachedProfile;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async (): Promise<DeviceProfileSnapshot> => {
    const safe = <T>(fn: () => T): Promise<T | null> =>
      Promise.resolve()
        .then(fn)
        .catch(() => null);
    const [ramBytes, freeDiskBytes, cpuCores, gpuCapabilities] =
      await Promise.all([
        safe(() => DeviceInfo.getTotalMemory()),
        safe(() => DeviceInfo.getFreeDiskStorage('important')),
        safe(() => getCpuCoreCount()),
        safe(() => checkGpuSupport()),
      ]);
    const profile: DeviceProfileSnapshot = {
      ramBytes: typeof ramBytes === 'number' && ramBytes > 0 ? ramBytes : null,
      freeDiskBytes:
        typeof freeDiskBytes === 'number' && freeDiskBytes > 0
          ? freeDiskBytes
          : null,
      cpuCores: typeof cpuCores === 'number' && cpuCores > 0 ? cpuCores : null,
      gpuSupported: gpuCapabilities ? gpuCapabilities.isSupported : null,
      deviceTier: modelStore.deviceTier ?? null,
    };
    cachedProfile = profile;
    return profile;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
};

/** React binding for the device profile snapshot. */
export const useDeviceProfile = (): {
  profile: DeviceProfileSnapshot | null;
} => {
  const [profile, setProfile] = useState<DeviceProfileSnapshot | null>(
    cachedProfile,
  );

  useEffect(() => {
    let cancelled = false;
    gatherDeviceProfile().then(p => {
      if (!cancelled) {
        setProfile(p);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {profile};
};

/** Fresh free-disk reading (used right before a download confirmation). */
export const getFreeDiskBytes = async (): Promise<number | null> => {
  try {
    const free = await DeviceInfo.getFreeDiskStorage('important');
    return typeof free === 'number' && free > 0 ? free : null;
  } catch {
    return null;
  }
};
