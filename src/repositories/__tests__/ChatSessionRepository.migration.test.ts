import {chatSessionRepository} from '../ChatSessionRepository';
import type {SessionMetaData} from '../../store/ChatSessionStore';

// jest/setup.ts globally swaps this module for the manual mock in
// __mocks__/repositories. These tests exercise the REAL migration
// implementation, so opt out of the global mock for this file only.
jest.unmock('../../repositories/ChatSessionRepository');

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// In-memory fake of the document-directory files the migration touches.
const mockFs = new Map<string, string>();

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/docs',
  exists: jest.fn(async (path: string) => mockFs.has(path)),
  readFile: jest.fn(async (path: string) => {
    const content = mockFs.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return content;
  }),
  writeFile: jest.fn(async (path: string, content: string) => {
    mockFs.set(path, content);
  }),
  unlink: jest.fn(async (path: string) => {
    mockFs.delete(path);
  }),
  mkdir: jest.fn(async () => undefined),
}));

jest.mock('../../database/legacyDataMigration', () => ({
  ensureLegacyDataMigrated: jest.fn(async () => undefined),
}));

const mockCollections: Record<string, any> = {};
const makeCollection = (table: string) => ({
  table,
  prepareCreate: jest.fn((builder: any) => {
    const record: any = {
      table,
      id: `mock-${table}-${Math.random().toString(36).slice(2, 10)}`,
    };
    builder(record);
    return record;
  }),
  create: jest.fn(async (builder: any) => {
    const record: any = {table, id: `mock-${table}-created`};
    builder(record);
    return record;
  }),
  query: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  fetch: jest.fn(async () => []),
});

jest.mock('../../database', () => ({
  database: {
    write: jest.fn(async (callback: () => Promise<void>) => callback()),
    batch: jest.fn(async () => undefined),
    collections: {
      get: jest.fn((table: string) => {
        if (!mockCollections[table]) {
          mockCollections[table] = makeCollection(table);
        }
        return mockCollections[table];
      }),
    },
    adapter: {
      unsafeResetDatabase: jest.fn(async () => undefined),
    },
  },
}));

import {database} from '../../database';
import {_resetForTests as resetDiagnostics} from '../../utils/diagnostics';

const DOC = '/mock/docs';
const FLAG = `${DOC}/db-migration-complete.flag`;
const RESUME = `${DOC}/db-migration-progress.json`;
const IN_PROGRESS = `${DOC}/db-migration-in-progress.flag`;
const OLD_DATA = `${DOC}/session-metadata.json`;
const GLOBAL_SETTINGS = `${DOC}/global-completion-settings.json`;

const makeSession = (title: string, messageCount = 1): SessionMetaData =>
  ({
    id: title,
    title,
    date: new Date().toISOString(),
    messages: Array.from({length: messageCount}, (_, i) => ({
      id: `${title}-msg-${i}`,
      type: 'text',
      text: `message ${i} of ${title}`,
      author: 'user',
      createdAt: Date.now(),
    })),
    completionSettings: {},
    settingsSource: 'custom',
  }) as unknown as SessionMetaData;

const seedOldData = (sessions: SessionMetaData[]) => {
  mockFs.set(OLD_DATA, JSON.stringify(sessions));
};

const getWrites = () => (database.write as jest.Mock).mock.calls.length;

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.clear();
});

afterEach(() => {
  // Stop diagnostics' debounced persistence timer so jest can exit.
  resetDiagnostics();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkAndMigrateFromJSON (v1.34.0 resumable migration)', () => {
  it('flags completion when there is no legacy JSON data', async () => {
    const result = await chatSessionRepository.checkAndMigrateFromJSON();
    expect(result).toBe(false);
    expect(mockFs.get(FLAG)).toBe('true');
    expect(getWrites()).toBe(0);
  });

  it('short-circuits when the migration flag already exists', async () => {
    mockFs.set(FLAG, 'true');
    seedOldData([makeSession('old', 2)]);
    const result = await chatSessionRepository.checkAndMigrateFromJSON();
    expect(result).toBe(false);
    expect(getWrites()).toBe(0);
  });

  it('imports every session with per-session progress commits', async () => {
    seedOldData([
      makeSession('a', 2),
      makeSession('b', 1),
      makeSession('c', 3),
    ]);
    const progress: {done: number; total: number; messages: number}[] = [];
    const result = await chatSessionRepository.checkAndMigrateFromJSON({
      onProgress: p => progress.push({...p}),
    });

    expect(result).toBe(true);
    expect(progress).toEqual([
      {done: 1, total: 3, messages: 2},
      {done: 2, total: 3, messages: 3},
      {done: 3, total: 3, messages: 6},
    ]);
    // One transaction per session (3) — the settings import is skipped
    // because no legacy global settings file exists.
    expect(getWrites()).toBe(3);
    expect(database.batch).toHaveBeenCalled();
    // Final bookkeeping: flag written, resume + in-progress cleared.
    expect(mockFs.get(FLAG)).toBe('true');
    expect(mockFs.has(RESUME)).toBe(false);
    expect(mockFs.has(IN_PROGRESS)).toBe(false);
  });

  it('resumes from the marker without re-importing committed sessions', async () => {
    seedOldData([makeSession('a', 5), makeSession('b', 2)]);
    mockFs.set(RESUME, JSON.stringify({committed: 1}));

    const progress: {done: number; total: number; messages: number}[] = [];
    const result = await chatSessionRepository.checkAndMigrateFromJSON({
      onProgress: p => progress.push({...p}),
    });

    expect(result).toBe(true);
    // Only session #2 is imported; progress reports the cumulative view.
    expect(progress).toEqual([{done: 2, total: 2, messages: 7}]);
    expect(getWrites()).toBe(1);
  });

  it('aborts cleanly when shouldStop fires, leaving no in-progress marker', async () => {
    seedOldData([makeSession('a', 1), makeSession('b', 1)]);
    const result = await chatSessionRepository.checkAndMigrateFromJSON({
      shouldStop: () => true,
    });

    expect(result).toBe(false);
    expect(getWrites()).toBe(0);
    expect(mockFs.get(FLAG)).toBeUndefined();
    expect(mockFs.has(IN_PROGRESS)).toBe(false);
  });

  it('propagates parse failures to the caller instead of swallowing them', async () => {
    mockFs.set(OLD_DATA, '{this is not json');
    await expect(
      chatSessionRepository.checkAndMigrateFromJSON(),
    ).rejects.toThrow();
    expect(mockFs.get(FLAG)).toBeUndefined();
  });

  it('imports legacy global settings exactly once', async () => {
    seedOldData([makeSession('a', 1)]);
    mockFs.set(GLOBAL_SETTINGS, JSON.stringify({temperature: 0.7}));

    await chatSessionRepository.checkAndMigrateFromJSON();
    expect(getWrites()).toBe(2); // 1 session + 1 global settings

    // A second, resumed-style run must not duplicate the global settings:
    // the guard query now finds the row imported by the first run.
    mockFs.delete(FLAG);
    mockFs.set(RESUME, JSON.stringify({committed: 1}));
    mockCollections.global_settings.fetch.mockResolvedValueOnce([
      {id: 'existing'},
    ]);
    await chatSessionRepository.checkAndMigrateFromJSON();
    expect(mockCollections.global_settings.create).toHaveBeenCalledTimes(1);
  });
});

describe('resetDatabaseDestructively (fallbackToDestructiveMigration path)', () => {
  it('resets the adapter, removes legacy sources and writes both flags', async () => {
    seedOldData([makeSession('a', 1)]);
    mockFs.set(GLOBAL_SETTINGS, '{}');
    mockFs.set(RESUME, JSON.stringify({committed: 2}));
    mockFs.set(IN_PROGRESS, 'true');

    await chatSessionRepository.resetDatabaseDestructively();

    expect(database.adapter.unsafeResetDatabase).toHaveBeenCalledTimes(1);
    expect(mockFs.has(OLD_DATA)).toBe(false);
    expect(mockFs.has(GLOBAL_SETTINGS)).toBe(false);
    expect(mockFs.has(RESUME)).toBe(false);
    expect(mockFs.has(IN_PROGRESS)).toBe(false);
    expect(mockFs.get(FLAG)).toBe('true');
    expect(mockFs.get(`${DOC}/drs-legacy-data-migration-complete.flag`)).toBe(
      'true',
    );
  });

  it('surfaces a reset failure instead of half-completing silently', async () => {
    (database.adapter.unsafeResetDatabase as jest.Mock).mockRejectedValueOnce(
      new Error('disk busy'),
    );
    await expect(
      chatSessionRepository.resetDatabaseDestructively(),
    ).rejects.toThrow('disk busy');
    // No flags were written — the app stays in the recovery state.
    expect(mockFs.get(FLAG)).toBeUndefined();
  });
});
