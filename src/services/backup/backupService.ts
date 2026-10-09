/**
 * backupService — full-app backup as ONE portable JSON file (v1.40.0).
 *
 * Contains (v1 format):
 *  - chats:       chat_sessions + messages + per-session completion_settings
 *  - assistants:  local_assistants (user-created + Drshub-downloaded)
 *  - settings:    global_settings (completion params, preferences, flags)
 *
 * Rows are exported as WatermelonDB raw records and re-imported with
 * `prepareCreateFromDirtyRaw`, which re-sanitizes every field against the
 * current table schema. Import is strictly additive: existing ids are
 * skipped, so a restore can never destroy or overwrite current data —
 * it only brings back what is missing (perfect for device migration or
 * recovering after a destructive DB reset).
 *
 * This complements the existing per-domain exports (chats-only v1.38.0,
 * assistants-only v1.39.0) with a single comprehensive file.
 */

import Share from 'react-native-share';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick, types} from '@react-native-documents/picker';
import {format} from 'date-fns';

import {database} from '../../database';
import {logger} from '../../utils/logger';

export const BACKUP_FORMAT = 'drs-ai-backup';
export const BACKUP_FORMAT_VERSION = 1;

export type BackupTable =
  | 'chat_sessions'
  | 'messages'
  | 'completion_settings'
  | 'global_settings'
  | 'local_assistants';

export const BACKUP_TABLES: BackupTable[] = [
  'chat_sessions',
  'messages',
  'completion_settings',
  'global_settings',
  'local_assistants',
];

export interface BackupPayload {
  format: string;
  formatVersion: number;
  createdAt: number;
  appVersion: string;
  tables: Record<BackupTable, Array<Record<string, unknown>>>;
}

export interface BackupCounts {
  chatSessions: number;
  messages: number;
  assistants: number;
  settings: number;
}

export interface RestoreResult {
  inserted: Record<string, number>;
  skipped: Record<string, number>;
}

const BATCH_SIZE = 200;

/** Dump one table's rows as JSON-safe raw records. */
const dumpTable = async (
  table: BackupTable,
): Promise<Array<Record<string, unknown>>> => {
  const records = await database.get(table).query().fetch();
  return records.map(record => ({...record._raw}));
};

/** Build the full in-memory backup payload (pure DB read, no I/O). */
export const collectBackupPayload = async (
  appVersion: string,
): Promise<BackupPayload> => {
  const tables = {} as Record<BackupTable, Array<Record<string, unknown>>>;
  for (const table of BACKUP_TABLES) {
    tables[table] = await dumpTable(table);
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: Date.now(),
    appVersion,
    tables,
  };
};

/** Validate an untrusted parsed-JSON object as a backup payload. */
export const validateBackupPayload = (
  parsed: unknown,
): BackupPayload | null => {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const candidate = parsed as Partial<BackupPayload>;
  if (candidate.format !== BACKUP_FORMAT) {
    return null;
  }
  if (
    typeof candidate.formatVersion !== 'number' ||
    candidate.formatVersion < 1 ||
    candidate.formatVersion > BACKUP_FORMAT_VERSION
  ) {
    return null;
  }
  if (!candidate.tables || typeof candidate.tables !== 'object') {
    return null;
  }
  const tables = {} as Record<BackupTable, Array<Record<string, unknown>>>;
  for (const table of BACKUP_TABLES) {
    const rows = (candidate.tables as Record<string, unknown>)[table];
    if (rows === undefined) {
      tables[table] = [];
    } else if (Array.isArray(rows)) {
      tables[table] = rows.filter(
        row =>
          !!row &&
          typeof row === 'object' &&
          typeof (row as {id?: unknown}).id === 'string' &&
          (row as {id: string}).id.length > 0,
      );
    } else {
      tables[table] = [];
    }
  }
  return {
    format: candidate.format,
    formatVersion: candidate.formatVersion,
    createdAt:
      typeof candidate.createdAt === 'number' ? candidate.createdAt : 0,
    appVersion:
      typeof candidate.appVersion === 'string' ? candidate.appVersion : '',
    tables,
  };
};

export const describeBackupCounts = (payload: BackupPayload): BackupCounts => ({
  chatSessions: payload.tables.chat_sessions.length,
  messages: payload.tables.messages.length,
  assistants: payload.tables.local_assistants.length,
  settings: payload.tables.global_settings.length,
});

/**
 * Export the whole app as a single backup file and hand it to the
 * system share sheet (user chooses where to save it).
 */
export const createBackupFile = async (appVersion: string): Promise<void> => {
  const payload = await collectBackupPayload(appVersion);
  const filename = `drs-ai-backup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;
  const filePath = `${RNFS.CachesDirectoryPath}/${filename}`;

  await RNFS.writeFile(filePath, JSON.stringify(payload), 'utf8');

  try {
    await Share.open({
      title: filename,
      url: `file://${filePath}`,
      type: 'application/json',
      failOnCancel: false,
    });
  } finally {
    // Best-effort cleanup of the cache copy after the share sheet closes.
    try {
      const exists = await RNFS.exists(filePath);
      if (exists) {
        await RNFS.unlink(filePath);
      }
    } catch (cleanupError) {
      logger.debug('backupService: cache cleanup failed', cleanupError);
    }
  }
};

/** Insert missing rows of one table (existing ids are skipped). */
const restoreTable = async (
  table: BackupTable,
  rows: Array<Record<string, unknown>>,
): Promise<{inserted: number; skipped: number}> => {
  const collection = database.get(table);
  const existing = await collection.query().fetch();
  const existingIds = new Set(existing.map(record => record.id));

  const toInsert = rows
    .filter(row => !existingIds.has(row.id as string))
    .map(row =>
      collection.prepareCreateFromDirtyRaw(row as Record<string, unknown>),
    );

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const chunk = toInsert.slice(i, i + BATCH_SIZE);

    await database.batch(chunk);
  }

  return {inserted: toInsert.length, skipped: rows.length - toInsert.length};
};

/**
 * Pick a backup file with the system document picker and restore it.
 * Additive only — see module docs.
 */
export const restoreFromBackupFile = async (): Promise<RestoreResult> => {
  const [pickResult] = await pick({type: [types.json, types.allFiles]});
  if (!pickResult) {
    throw new Error('No file selected');
  }

  const uri = pickResult.uri.replace(/^file:\/\//, '');
  const raw = await RNFS.readFile(uri, 'utf8');
  const payload = validateBackupPayload(JSON.parse(raw));
  if (!payload) {
    throw new Error('Invalid backup file');
  }

  const inserted: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  // One write transaction per table keeps memory bounded on huge backups
  // while still making every table's restore atomic.
  for (const table of BACKUP_TABLES) {
    const rows = payload.tables[table];
    if (rows.length === 0) {
      inserted[table] = 0;
      skipped[table] = 0;
      continue;
    }

    const result = await database.write(async () => restoreTable(table, rows));
    inserted[table] = result.inserted;
    skipped[table] = result.skipped;
  }

  logger.debug('backupService: restore complete', {inserted, skipped});
  return {inserted, skipped};
};
