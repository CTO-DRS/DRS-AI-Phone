import * as RNFS from '@dr.pogodin/react-native-fs';
import Share from 'react-native-share';
import {pick} from '@react-native-documents/picker';

jest.mock('../../../database', () => {
  const makeCollection = (table: string) => ({
    table,
    query: () => ({
      fetch: jest.fn(async () => existingByTable[table] ?? []),
    }),
    prepareCreateFromDirtyRaw: jest.fn((raw: {id: string}) => ({_raw: raw})),
  });

  const existingByTable: Record<string, Array<{id: string}>> = {};
  const collections: Record<string, ReturnType<typeof makeCollection>> = {};

  return {
    database: {
      get: jest.fn((table: string) => {
        if (!collections[table]) {
          collections[table] = makeCollection(table);
        }
        return collections[table];
      }),
      batch: jest.fn(async () => undefined),
      write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
      _collections: collections,
      _existingByTable: existingByTable,
    },
  };
});

jest.mock('react-native-share', () => ({
  open: jest.fn(async () => undefined),
}));

import {database} from '../../../database';
import {
  collectBackupPayload,
  createBackupFile,
  restoreFromBackupFile,
} from '../backupService';

const db = database as unknown as {
  get: jest.Mock;
  batch: jest.Mock;
  write: jest.Mock;
  _collections: Record<string, {query: () => {fetch: jest.Mock}}>;
  _existingByTable: Record<string, Array<{id: string}>>;
};

describe('backupService — DB round trip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db._existingByTable.chat_sessions = [{id: 's-existing'}];
    db._existingByTable.messages = [];
    db._existingByTable.local_assistants = [];
    db._existingByTable.global_settings = [];
    db._existingByTable.completion_settings = [];
  });

  describe('collectBackupPayload', () => {
    it('dumps raw rows from all five tables', async () => {
      // Fake rows carry both `.id` (existing check) and `._raw` (dump).
      db._existingByTable.chat_sessions = [
        {id: 's1', _raw: {id: 's1', title: 'Hello'}} as unknown as {
          id: string;
        },
      ];
      const payload = await collectBackupPayload('1.40.0');
      expect(payload.format).toBe('drs-ai-backup');
      expect(payload.appVersion).toBe('1.40.0');
      expect(payload.tables.chat_sessions).toEqual([
        {id: 's1', title: 'Hello'},
      ]);
    });
  });

  describe('createBackupFile', () => {
    it('writes JSON to the cache dir and hands it to the share sheet', async () => {
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);

      await createBackupFile('1.40.0');

      const writtenPath = (RNFS.writeFile as jest.Mock).mock
        .calls[0][0] as string;
      expect(writtenPath).toContain('/drs-ai-backup_');
      expect(writtenPath.endsWith('.json')).toBe(true);

      const shareCall = (Share.open as jest.Mock).mock.calls[0][0];
      expect(shareCall.url).toBe(`file://${writtenPath}`);
      expect(shareCall.type).toBe('application/json');

      // Cache copy is cleaned up afterwards.
      expect(RNFS.unlink).toHaveBeenCalledWith(writtenPath);
    });

    it('still resolves when cache cleanup fails', async () => {
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      (RNFS.exists as jest.Mock).mockRejectedValue(new Error('fs gone'));

      await expect(createBackupFile('1.40.0')).resolves.toBeUndefined();
      expect(Share.open).toHaveBeenCalled();
    });
  });

  describe('restoreFromBackupFile', () => {
    const backupJson = (rows: Record<string, unknown>[]) =>
      JSON.stringify({
        format: 'drs-ai-backup',
        formatVersion: 1,
        createdAt: 1,
        appVersion: '1.40.0',
        tables: {
          chat_sessions: rows,
          messages: [],
          completion_settings: [],
          global_settings: [],
          local_assistants: [],
        },
      });

    const seedPicker = (content: string) => {
      (pick as jest.Mock).mockResolvedValueOnce([
        {uri: 'file:///tmp/backup.json'},
      ]);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(content);
    };

    it('inserts only missing rows and reports skip/insert counts', async () => {
      seedPicker(
        backupJson([
          {id: 's-existing', title: 'already here'},
          {id: 's-new-1', title: 'fresh one'},
          {id: 's-new-2', title: 'fresh two'},
        ]),
      );

      const result = await restoreFromBackupFile();

      expect(result.inserted.chat_sessions).toBe(2);
      expect(result.skipped.chat_sessions).toBe(1);

      const prepared = db
        .get('chat_sessions')
        .prepareCreateFromDirtyRaw.mock.calls.map(
          (call: [{id: string}]) => call[0].id,
        );
      expect(prepared).toEqual(['s-new-1', 's-new-2']);
      expect(db.batch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({_raw: {id: 's-new-1', title: 'fresh one'}}),
          expect.objectContaining({_raw: {id: 's-new-2', title: 'fresh two'}}),
        ]),
      );
    });

    it('rejects invalid payloads without touching the database', async () => {
      seedPicker('{"format":"something-else"}');

      await expect(restoreFromBackupFile()).rejects.toThrow(
        'Invalid backup file',
      );
      expect(db.batch).not.toHaveBeenCalled();
    });

    it('rejects corrupt JSON before any write', async () => {
      seedPicker('not-json{');
      await expect(restoreFromBackupFile()).rejects.toThrow();
      expect(db.write).not.toHaveBeenCalled();
    });
  });
});
