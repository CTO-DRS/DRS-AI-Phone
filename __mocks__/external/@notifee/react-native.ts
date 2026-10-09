/**
 * Manual mock for @notifee/react-native (used via moduleNameMapper).
 * The notification service treats every notifee call as best-effort, so
 * tests only need callable stubs. Individual tests can import the mock
 * and assert on calls via `require('@notifee/react-native')`.
 */

export const AndroidImportance = {
  DEFAULT: 3,
  HIGH: 4,
  LOW: 2,
  MIN: 1,
  NONE: 0,
} as const;

export const AndroidForegroundServiceType = {
  FOREGROUND_SERVICE_TYPE_SPECIAL_USE: 1073741824,
} as const;

export const AuthorizationStatus = {
  NOT_DETERMINED: 0,
  DENIED: 1,
  AUTHORIZED: 2,
  PROVISIONAL: 3,
} as const;

const notifee = {
  requestPermission: jest.fn(async () => ({authorizationStatus: 2})),
  createChannel: jest.fn(async () => 'drsai-generation'),
  displayNotification: jest.fn(async () => 'notification-id'),
  stopForegroundService: jest.fn(async () => undefined),
  cancelNotification: jest.fn(async () => undefined),
  cancelAllNotifications: jest.fn(async () => undefined),
  onForegroundEvent: jest.fn(() => () => undefined),
  onBackgroundEvent: jest.fn(() => () => undefined),
};

export default notifee;
