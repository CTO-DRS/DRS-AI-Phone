/**
 * Generation notifications (v1.38.0, lazily bound since v1.41.0).
 *
 * A thin, failure-proof wrapper around `@notifee/react-native` that:
 * 1. Shows an ongoing low-importance notification backed by a foreground
 *    service while a completion is running. The foreground service is what
 *    keeps the OS from freezing or killing the process (and the native
 *    llama.cpp inference threads) when the user leaves the app — the
 *    "background generation continues" behaviour.
 * 2. When the response finishes while the app is NOT in the foreground,
 *    posts a completion notification carrying a short preview of the reply
 *    (tapping it opens the chat).
 * 3. Cleans everything up when the run ends, fails, or is stopped.
 *
 * Every public call is defensive: notification/FGS failures must never
 * break the chat flow, so everything is caught and logged. On platforms
 * or builds where notifee's native module is unavailable (e.g. unit
 * tests, iOS without pod install) the functions degrade to no-ops.
 *
 * v1.41.0: the package is resolved lazily on first use. Importing it
 * eagerly used to run `new NativeEventEmitter(nativeModule)` at module
 * scope, which THROWS ('Notifee native module not found.') whenever the
 * native module cannot be resolved — and because useChatSession sits in
 * the startup graph, that throw used to kill the entire boot with a bare
 * splash. A lazy require confines any such failure to the notification
 * surface, which is designed to degrade to no-ops.
 */

import {AppState, Platform} from 'react-native';

import type {Notification} from '@notifee/react-native';

type NotifeeNamespace = typeof import('@notifee/react-native');

let notifeeNamespace: NotifeeNamespace | null | undefined;

/**
 * Resolve the notifee package namespace (enums + default API) on first
 * use; null on any resolution failure. Memoized — including the failure,
 * so a broken install doesn't retry the throw on every call. The default
 * export (the API object) is at `namespace.default`; enums live directly
 * on the namespace.
 */
const getNotifee = (): NotifeeNamespace | null => {
  if (notifeeNamespace !== undefined) {
    return notifeeNamespace;
  }
  try {
    notifeeNamespace = require('@notifee/react-native') as NotifeeNamespace;
  } catch (error) {
    console.warn('[notifications] notifee unavailable:', error);
    notifeeNamespace = null;
  }
  return notifeeNamespace;
};

const CHANNEL_ID = 'drsai-generation';
const GENERATION_NOTIFICATION_ID = 'drsai-generation-active';
const COMPLETION_NOTIFICATION_ID = 'drsai-generation-complete';

/** Best-effort trim of a response preview for the completion notification. */
export const buildPreview = (text: string, max = 160): string => {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1).trimEnd()}…`;
};

const ensureChannel = (() => {
  let done = false;
  return async () => {
    if (done) {
      return;
    }
    const notifee = getNotifee();
    if (!notifee) {
      return;
    }
    await notifee.default.createChannel({
      id: CHANNEL_ID,
      name: 'DRS AI',
      importance: notifee.AndroidImportance.LOW,
      vibration: false,
      vibrationPattern: undefined,
    });
    done = true;
  };
})();

/**
 * Ask for POST_NOTIFICATIONS on Android 13+ (no-op when already granted).
 * Called lazily right before the first notification so we never prompt on
 * a cold app start. Resolves to whether notifications will actually show.
 */
export const ensureNotificationPermission = async (): Promise<boolean> => {
  try {
    const notifee = getNotifee();
    if (!notifee) {
      return false;
    }
    const settings = await notifee.default.requestPermission();
    return (
      settings.authorizationStatus === notifee.AuthorizationStatus.AUTHORIZED ||
      settings.authorizationStatus === notifee.AuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    console.warn('[notifications] permission request failed:', error);
    return false;
  }
};

/**
 * Start the foreground-service backed "generating" notification. Must be
 * called while the app is in the foreground (we call it synchronously in
 * the send path, which is always a foreground interaction).
 */
export const startGenerationNotification = async (
  title: string,
  body: string,
): Promise<void> => {
  if (Platform.OS !== 'android') {
    // iOS has no user-visible benefit here without background modes;
    // keep the surface Android-only for now.
    return;
  }
  try {
    const namespace = getNotifee();
    if (!namespace) {
      return;
    }
    const notifee = namespace.default;
    const granted = await ensureNotificationPermission();
    if (!granted) {
      return;
    }
    await ensureChannel();
    const notification: Notification = {
      id: GENERATION_NOTIFICATION_ID,
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true,
        ongoing: true,
        autoCancel: false,
        smallIcon: 'ic_launcher',
        pressAction: {id: 'default', launchActivity: 'default'},
        importance: namespace.AndroidImportance.LOW,
        // Indeterminate progress = "alive" feedback without fake numbers.
        progress: {indeterminate: true},
        foregroundServiceTypes: [
          namespace.AndroidForegroundServiceType
            .FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
        ],
      },
    };
    await notifee.displayNotification(notification);
  } catch (error) {
    console.warn(
      '[notifications] start generation notification failed:',
      error,
    );
  }
};

/**
 * Finish the generation notification. If the app is backgrounded at this
 * moment, swap the ongoing bar for a completion notification with the
 * response preview. If the user is already looking at the chat, just
 * clean up silently.
 */
export const completeGenerationNotification = async (
  previewTitle: string,
  previewBody: string,
  responsePreview: string,
): Promise<void> => {
  try {
    const namespace = getNotifee();
    if (!namespace) {
      return;
    }
    const notifee = namespace.default;
    await notifee.stopForegroundService();
    await notifee.cancelNotification(GENERATION_NOTIFICATION_ID);

    const isBackgrounded = AppState.currentState !== 'active';
    const trimmed = buildPreview(responsePreview ?? '');
    if (isBackgrounded && trimmed.length > 0) {
      await notifee.displayNotification({
        id: COMPLETION_NOTIFICATION_ID,
        title: previewTitle,
        body: trimmed,
        android: {
          channelId: CHANNEL_ID,
          smallIcon: 'ic_launcher',
          pressAction: {id: 'default', launchActivity: 'default'},
          importance: namespace.AndroidImportance.HIGH,
          autoCancel: true,
        },
      });
    }
  } catch (error) {
    console.warn('[notifications] completion notification failed:', error);
  }
};

/**
 * Tear down any generation notification without a completion post
 * (error path, user stop, model unload).
 */
export const cancelGenerationNotification = async (): Promise<void> => {
  try {
    const notifee = getNotifee()?.default;
    if (!notifee) {
      return;
    }
    await notifee.stopForegroundService();
    await notifee.cancelNotification(GENERATION_NOTIFICATION_ID);
  } catch (error) {
    console.warn(
      '[notifications] cancel generation notification failed:',
      error,
    );
  }
};
