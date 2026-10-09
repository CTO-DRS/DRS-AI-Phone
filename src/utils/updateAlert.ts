/**
 * Startup update-alert gating (v1.40.0) — pure logic + small AsyncStorage
 * persistence, layered on top of the v1.37 About-screen update banner.
 *
 * The alert fires at most once per DISMISS_COOLDOWN_MS per app start,
 * and never for a version the user already dismissed with "Later"
 * (per-version dismissal, so the next real release re-arms the alert).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type {AppUpdateInfo} from './appUpdate';

const DISMISSED_VERSION_KEY = '@drsai/app-update-dismissed-v1';
const LAST_ALERT_AT_KEY = '@drsai/app-update-last-alert-at-v1';

/** Re-prompt this often even when the user dismissed ("Later"). */
export const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const getDismissedUpdateVersion = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
  } catch {
    return null;
  }
};

export const dismissUpdateVersion = async (version: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(DISMISSED_VERSION_KEY, version);
  } catch {
    // Non-fatal.
  }
};

export const getLastUpdateAlertAt = async (): Promise<number> => {
  try {
    const raw = await AsyncStorage.getItem(LAST_ALERT_AT_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
};

export const markUpdateAlerted = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(LAST_ALERT_AT_KEY, String(Date.now()));
  } catch {
    // Non-fatal.
  }
};

/**
 * Pure decision: should the startup alert fire for this update right now?
 * - never for the exact version the user dismissed ("Later" silences it
 *   until a NEWER release appears);
 * - never more often than once per DISMISS_COOLDOWN_MS overall.
 */
export const shouldShowUpdateAlert = (
  update: AppUpdateInfo,
  dismissedVersion: string | null,
  lastAlertAt: number,
  now: number = Date.now(),
): boolean => {
  if (dismissedVersion === update.latestVersion) {
    return false;
  }
  return now - lastAlertAt >= DISMISS_COOLDOWN_MS;
};
