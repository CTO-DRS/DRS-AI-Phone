import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  SAFE_MODE_THRESHOLD,
  beginBootAttempt,
  bootHealthReady,
  getBootFailureStreak,
  isSafeModeBoot,
  markBootSuccess,
  resetBootHealthForTests,
} from '../bootHealth';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

beforeEach(() => {
  resetBootHealthForTests();
  mockGetItem.mockReset();
  mockSetItem.mockReset();
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
});

describe('beginBootAttempt', () => {
  it('persists attempt N+1 while the gate reads the previous streak', async () => {
    mockGetItem.mockResolvedValue('1');
    await beginBootAttempt();
    expect(mockSetItem).toHaveBeenCalledWith('bootHealth.failureStreak', '2');
    expect(getBootFailureStreak()).toBe(1);
  });

  it('starts from an empty streak when storage holds nothing', async () => {
    await beginBootAttempt();
    expect(mockSetItem).toHaveBeenCalledWith('bootHealth.failureStreak', '1');
    expect(getBootFailureStreak()).toBe(0);
  });

  it('is idempotent within one process', async () => {
    await beginBootAttempt();
    await beginBootAttempt();
    expect(mockSetItem).toHaveBeenCalledTimes(1);
  });

  it('fails open when storage is unavailable', async () => {
    mockGetItem.mockRejectedValue(new Error('storage dead'));
    await beginBootAttempt();
    expect(getBootFailureStreak()).toBe(0);
    expect(isSafeModeBoot()).toBe(false);
    // And bootHealthReady never hangs.
    await bootHealthReady();
  });

  it('treats a corrupt streak value as an empty history', async () => {
    mockGetItem.mockResolvedValue('not-a-number');
    await beginBootAttempt();
    expect(getBootFailureStreak()).toBe(0);
  });
});

describe('safe-mode gating', () => {
  it('stays healthy below the threshold', async () => {
    mockGetItem.mockResolvedValue(String(SAFE_MODE_THRESHOLD - 1));
    await beginBootAttempt();
    expect(isSafeModeBoot()).toBe(false);
  });

  it('enters safe mode at the threshold', async () => {
    mockGetItem.mockResolvedValue(String(SAFE_MODE_THRESHOLD));
    await beginBootAttempt();
    expect(isSafeModeBoot()).toBe(true);
  });
});

describe('markBootSuccess', () => {
  it('clears the streak in memory and in storage', async () => {
    mockGetItem.mockResolvedValue('4');
    await beginBootAttempt();
    expect(isSafeModeBoot()).toBe(true);
    await markBootSuccess();
    expect(getBootFailureStreak()).toBe(0);
    expect(mockSetItem).toHaveBeenLastCalledWith(
      'bootHealth.failureStreak',
      '0',
    );
    expect(isSafeModeBoot()).toBe(false);
  });

  it('does not throw when persistence fails', async () => {
    await beginBootAttempt();
    mockSetItem.mockRejectedValue(new Error('disk full'));
    await expect(markBootSuccess()).resolves.toBeUndefined();
    expect(getBootFailureStreak()).toBe(0);
  });
});

describe('bootHealthReady', () => {
  it('resolves after the boot attempt is durable', async () => {
    await expect(bootHealthReady()).resolves.toBeUndefined();
  });

  it('resolves immediately when the attempt already completed', async () => {
    await beginBootAttempt();
    await expect(bootHealthReady()).resolves.toBeUndefined();
  });

  it('resolves when the caller begins the attempt first', async () => {
    const pending = bootHealthReady();
    await beginBootAttempt();
    await expect(pending).resolves.toBeUndefined();
  });
});
