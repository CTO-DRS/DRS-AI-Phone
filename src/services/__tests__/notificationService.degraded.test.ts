import {Platform} from 'react-native';

/**
 * v1.41.0 regression: the notifee package must NEVER be able to take the
 * module graph down. When the native module cannot be resolved, the
 * package itself throws at evaluation time ('Notifee native module not
 * found.') — the service must degrade to no-ops instead of propagating
 * that throw into the startup graph.
 */

describe('notificationService — degraded notifee resolution', () => {
  const originalOS = Platform.OS;
  beforeAll(() => {
    (Platform as {OS: string}).OS = 'android';
  });
  afterAll(() => {
    (Platform as {OS: string}).OS = originalOS;
  });

  afterEach(() => {
    jest.dontMock('@notifee/react-native');
    jest.resetModules();
  });

  it('no-ops every public call when the package throws on require', async () => {
    jest.resetModules();
    jest.mock('@notifee/react-native', () => {
      throw new Error('Notifee native module not found.');
    });

    const service =
      require('../notificationService') as typeof import('../notificationService');

    await expect(service.ensureNotificationPermission()).resolves.toBe(false);
    await expect(
      service.startGenerationNotification('title', 'body'),
    ).resolves.toBeUndefined();
    await expect(
      service.completeGenerationNotification('title', 'body', 'reply'),
    ).resolves.toBeUndefined();
    await expect(
      service.cancelGenerationNotification(),
    ).resolves.toBeUndefined();
  });

  it('keeps buildPreview working without notifee', async () => {
    jest.resetModules();
    jest.mock('@notifee/react-native', () => {
      throw new Error('Notifee native module not found.');
    });

    const service =
      require('../notificationService') as typeof import('../notificationService');
    expect(service.buildPreview('  a  b  ')).toBe('a b');
  });
});
