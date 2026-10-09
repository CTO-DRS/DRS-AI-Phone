import {AppState, Platform} from 'react-native';

import notifee from '@notifee/react-native';

import {
  buildPreview,
  ensureNotificationPermission,
  startGenerationNotification,
  completeGenerationNotification,
  cancelGenerationNotification,
} from '../notificationService';

// The service short-circuits on iOS; force the android path in tests.
// Platform.OS is a plain (non-getter) property in the RN jest preset.
const originalOS = Platform.OS;
beforeAll(() => {
  (Platform as {OS: string}).OS = 'android';
});
afterAll(() => {
  (Platform as {OS: string}).OS = originalOS;
});

// AppState in the RN jest preset exposes `currentState` as a plain
// (non-getter) property — re-define it per test instead of jest.spyOn.
const originalState = AppState.currentState;

const setAppState = (state: string) => {
  Object.defineProperty(AppState, 'currentState', {
    get: () => state,
    configurable: true,
  });
};

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) so rejections configured by a
  // previous test never leak into the next one.
  jest.resetAllMocks();
  setAppState('active');
});

afterAll(() => {
  Object.defineProperty(AppState, 'currentState', {
    value: originalState,
    configurable: true,
    writable: true,
  });
});

describe('buildPreview', () => {
  it('collapses whitespace and trims', () => {
    expect(buildPreview('  hello \n  world  ')).toBe('hello world');
  });

  it('truncates long text with an ellipsis', () => {
    const long = 'a'.repeat(300);
    const out = buildPreview(long, 160);
    expect(out.length).toBe(160);
    expect(out.endsWith('…')).toBe(true);
  });

  it('keeps short text intact', () => {
    expect(buildPreview('short')).toBe('short');
  });

  it('handles empty input', () => {
    expect(buildPreview('')).toBe('');
  });
});

describe('ensureNotificationPermission', () => {
  it('resolves true when authorized', async () => {
    (notifee.requestPermission as jest.Mock).mockResolvedValue({
      authorizationStatus: 2, // AUTHORIZED
    });
    await expect(ensureNotificationPermission()).resolves.toBe(true);
  });

  it('resolves false when denied', async () => {
    (notifee.requestPermission as jest.Mock).mockResolvedValue({
      authorizationStatus: 0, // NOT_DETERMINED / denied
    });
    await expect(ensureNotificationPermission()).resolves.toBe(false);
  });

  it('never throws when notifee rejects', async () => {
    (notifee.requestPermission as jest.Mock).mockRejectedValue(
      new Error('no native module'),
    );
    await expect(ensureNotificationPermission()).resolves.toBe(false);
  });
});

describe('startGenerationNotification', () => {
  it('shows a foreground-service notification when granted', async () => {
    (notifee.requestPermission as jest.Mock).mockResolvedValue({
      authorizationStatus: 2,
    });
    await startGenerationNotification('DRS AI', 'Generating…');
    expect(notifee.createChannel).toHaveBeenCalled();
    expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    const [notification] = (notifee.displayNotification as jest.Mock).mock
      .calls[0];
    expect(notification.android.asForegroundService).toBe(true);
    expect(notification.android.ongoing).toBe(true);
    expect(notification.android.progress.indeterminate).toBe(true);
    expect(notification.title).toBe('DRS AI');
    expect(notification.body).toBe('Generating…');
  });

  it('does not display when permission is denied', async () => {
    (notifee.requestPermission as jest.Mock).mockResolvedValue({
      authorizationStatus: 0,
    });
    await startGenerationNotification('DRS AI', 'Generating…');
    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });

  it('swallows notifee failures', async () => {
    (notifee.requestPermission as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );
    await expect(
      startGenerationNotification('DRS AI', 'Generating…'),
    ).resolves.toBeUndefined();
    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });
});

describe('completeGenerationNotification', () => {
  it('stops the foreground service and cleans the ongoing bar', async () => {
    setAppState('active'); // user watching — no completion post
    await completeGenerationNotification('DRS AI', 'Response ready', 'hello');
    expect(notifee.stopForegroundService).toHaveBeenCalled();
    expect(notifee.cancelNotification).toHaveBeenCalledWith(
      'drsai-generation-active',
    );
    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });

  it('posts a preview notification when backgrounded', async () => {
    setAppState('background');
    await completeGenerationNotification(
      'DRS AI',
      'Response ready',
      'The answer is 42 and here is a very long explanation',
    );
    expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    const [notification] = (notifee.displayNotification as jest.Mock).mock
      .calls[0];
    expect(notification.title).toBe('DRS AI');
    expect(notification.body).toBe(
      'The answer is 42 and here is a very long explanation',
    );
    expect(notification.android.asForegroundService).toBeUndefined();
  });

  it('does not post an empty preview', async () => {
    setAppState('background');
    await completeGenerationNotification('DRS AI', 'Response ready', '   ');
    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });

  it('swallows cleanup failures', async () => {
    (notifee.stopForegroundService as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );
    setAppState('background');
    await expect(
      completeGenerationNotification('DRS AI', 'Response ready', 'text'),
    ).resolves.toBeUndefined();
  });
});

describe('cancelGenerationNotification', () => {
  it('stops the service and cancels without a completion post', async () => {
    await cancelGenerationNotification();
    expect(notifee.stopForegroundService).toHaveBeenCalled();
    expect(notifee.cancelNotification).toHaveBeenCalledWith(
      'drsai-generation-active',
    );
    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });

  it('swallows failures', async () => {
    (notifee.cancelNotification as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );
    await expect(cancelGenerationNotification()).resolves.toBeUndefined();
  });
});
