import {NativeModules} from 'react-native';

import {basicModel} from '../../../../jest/fixtures/models';

import {DownloadManager} from '../DownloadManager';

jest.mock('react-native', () => {
  const mockDownloadModule = {
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    getActiveDownloads: jest.fn(),
    reattachDownloadObserver: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    pauseDownload: jest.fn(),
    resumeDownload: jest.fn(),
    retryDownload: jest.fn(),
    logDownloadDatabase: jest.fn(),
  };

  return {
    NativeModules: {
      DownloadModule: mockDownloadModule,
    },
    NativeEventEmitter: jest.fn(() => ({
      addListener: jest.fn(),
      removeListeners: jest.fn(),
      removeAllListeners: jest.fn(),
    })),
    Platform: {
      OS: 'android',
    },
    Appearance: {
      getColorScheme: jest.fn(() => 'light'),
    },
    TurboModuleRegistry: {
      getEnforcing: jest.fn((name: string) => {
        if (name === 'DownloadModule') {
          return mockDownloadModule;
        }
        return null;
      }),
    },
  };
});

jest.mock('../../../../src/utils', () => ({
  ...jest.requireActual('../../../../src/utils'),
  hasEnoughSpace: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../../src/store', () => ({
  uiStore: {
    l10n: {
      common: {
        minutes: 'min',
        seconds: 'sec',
        calculating: '…',
        downloadETA: 'ETA',
      },
    },
    iOSBackgroundDownloading: false,
  },
}));

const mockNative = NativeModules.DownloadModule as {
  startDownload: jest.Mock;
  pauseDownload: jest.Mock;
  resumeDownload: jest.Mock;
};

describe('DownloadManager pause/resume (Android native wiring)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pauses an active Android download and marks the job paused', async () => {
    const manager = new DownloadManager();
    mockNative.startDownload.mockResolvedValue({downloadId: 'dl-1'});
    mockNative.pauseDownload.mockResolvedValue(true);

    await manager.startDownload(basicModel, '/tmp/basic.gguf');

    const paused = await manager.pauseDownload(basicModel.id);
    expect(mockNative.pauseDownload).toHaveBeenCalledWith('dl-1');
    expect(paused).toBe(true);
    expect(manager.isPaused(basicModel.id)).toBe(true);
    expect(manager.pausedJobs.map(j => j.model.id)).toContain(basicModel.id);
  });

  it('resumes a paused download and clears the paused flag', async () => {
    const manager = new DownloadManager();
    mockNative.startDownload.mockResolvedValue({downloadId: 'dl-2'});
    mockNative.pauseDownload.mockResolvedValue(true);
    mockNative.resumeDownload.mockResolvedValue(true);

    await manager.startDownload(basicModel, '/tmp/basic.gguf');
    await manager.pauseDownload(basicModel.id);
    const resumed = await manager.resumeDownload(basicModel.id);

    expect(mockNative.resumeDownload).toHaveBeenCalledWith('dl-2');
    expect(resumed).toBe(true);
    expect(manager.isPaused(basicModel.id)).toBe(false);
    expect(manager.pausedJobs).toHaveLength(0);
  });

  it('reports failure when the native pause rejects', async () => {
    const manager = new DownloadManager();
    mockNative.startDownload.mockResolvedValue({downloadId: 'dl-3'});
    mockNative.pauseDownload.mockRejectedValue(new Error('native boom'));

    await manager.startDownload(basicModel, '/tmp/basic.gguf');
    const paused = await manager.pauseDownload(basicModel.id);
    expect(paused).toBe(false);
    expect(manager.isPaused(basicModel.id)).toBe(false);
  });

  it('returns false for unknown model ids without touching native', async () => {
    const manager = new DownloadManager();
    const paused = await manager.pauseDownload('nope');
    const resumed = await manager.resumeDownload('nope');
    expect(paused).toBe(false);
    expect(resumed).toBe(false);
    expect(mockNative.pauseDownload).not.toHaveBeenCalled();
    expect(mockNative.resumeDownload).not.toHaveBeenCalled();
  });
});
