/**
 * One-time legacy data migration (schema v9).
 *
 * Moves user data out of the pre-DRS-AI-named tables/columns/values
 * into their renamed counterparts, and relocates the legacy on-device
 * thumbnail directory. Runs once per install, is fully idempotent, and
 * never destructive: rows are copied with an explicit column list
 * before the legacy tables are dropped, and every statement tolerates
 * the "already migrated / never existed" case.
 *
 * Only this module and src/database/migrations.ts may reference the
 * legacy names — see src/database/legacyCompat.ts.
 */
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import type {SQLiteQuery} from '@nozbe/watermelondb/adapters/sqlite';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {database} from './index';
import {logger} from '../utils/logger';
import {
  LEGACY_SCHEMA,
  LEGACY_ASSISTANT_COPY_COLUMNS,
  LEGACY_CACHED_ASSISTANT_COPY_COLUMNS,
} from './legacyCompat';

const MIGRATION_FLAG = 'drs-legacy-data-migration-complete.flag';

/** Promisified raw-SQL execution on the SQLite adapter. */
const executeSqls = (sqls: SQLiteQuery[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const adapter = database.adapter as unknown as SQLiteAdapter;
    adapter.unsafeExecute({sqls}, error => (error ? reject(error) : resolve()));
  });

/** A statement failing because its legacy source no longer exists. */
const isExpectedMiss = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table|no such column/i.test(message);
};

/** Copy + drop one legacy table pair. */
const migrateLegacyTable = async (
  legacyTable: string,
  renamedTable: string,
  columns: readonly string[],
): Promise<void> => {
  const columnList = columns.join(', ');
  await executeSqls([
    [
      `INSERT INTO ${renamedTable} (${columnList}) ` +
        `SELECT ${columnList} FROM ${legacyTable}`,
      [],
    ],
    [`DROP TABLE ${legacyTable}`, []],
  ]);
  logger.info(`Migrated legacy table ${legacyTable} -> ${renamedTable}`);
};

/** Rename the legacy on-device thumbnail directory, preserving files. */
const migrateLegacyImagesDir = async (): Promise<void> => {
  const legacyDir = `${RNFS.DocumentDirectoryPath}/${LEGACY_SCHEMA.palImagesDirName}`;
  const renamedDir = `${RNFS.DocumentDirectoryPath}/assistant-images`;

  if (!(await RNFS.exists(legacyDir))) {
    return;
  }

  if (!(await RNFS.exists(renamedDir))) {
    await RNFS.mkdir(renamedDir);
  }

  const entries = await RNFS.readDir(legacyDir);
  for (const entry of entries) {
    await RNFS.moveFile(entry.path, `${renamedDir}/${entry.name}`);
  }
  await RNFS.unlink(legacyDir);
  logger.info(
    `Migrated legacy images dir (${entries.length} files) -> assistant-images`,
  );
};

const runLegacyDataMigration = async (): Promise<void> => {
  // Belt-and-braces guard so repeated launches stay quiet even if a
  // statement below ever becomes non-idempotent.
  const flagPath = `${RNFS.DocumentDirectoryPath}/${MIGRATION_FLAG}`;
  if (await RNFS.exists(flagPath)) {
    return;
  }

  // 1. Local assistants (user-created — the irreplaceable data).
  try {
    await migrateLegacyTable(
      LEGACY_SCHEMA.localPalsTable,
      'local_assistants',
      LEGACY_ASSISTANT_COPY_COLUMNS,
    );
  } catch (error) {
    if (!isExpectedMiss(error)) {
      logger.warn('Legacy local-assistants table migration failed:', error);
    }
  }

  // 2. DRS Hub catalogue cache (rebuildable, but migrated for continuity).
  try {
    await migrateLegacyTable(
      LEGACY_SCHEMA.cachedPalsTable,
      'cached_assistants',
      LEGACY_CACHED_ASSISTANT_COPY_COLUMNS,
    );
  } catch (error) {
    if (!isExpectedMiss(error)) {
      logger.warn('Legacy cached-assistants table migration failed:', error);
    }
  }

  // 3. chat_sessions: repoint the active-assistant column and normalize
  //    the settings_source value. The legacy column itself is left as an
  //    inert orphan on devices that had it (SQLite on minSdk 24 cannot
  //    DROP COLUMN); fresh installs never create it.
  try {
    await executeSqls([
      [
        'UPDATE chat_sessions SET active_assistant_id = ' +
          `${LEGACY_SCHEMA.activePalIdColumn} WHERE ` +
          `${LEGACY_SCHEMA.activePalIdColumn} IS NOT NULL`,
        [],
      ],
    ]);
  } catch (error) {
    if (!isExpectedMiss(error)) {
      logger.warn('Legacy active-assistant column migration failed:', error);
    }
  }

  try {
    await executeSqls([
      [
        'UPDATE chat_sessions SET settings_source = ? WHERE settings_source = ?',
        ['assistant', LEGACY_SCHEMA.settingsSourcePalValue],
      ],
    ]);
  } catch (error) {
    if (!isExpectedMiss(error)) {
      logger.warn('Legacy settings_source value migration failed:', error);
    }
  }

  // 4. sync_status: normalize the entity_type value.
  try {
    await executeSqls([
      [
        'UPDATE sync_status SET entity_type = ? WHERE entity_type = ?',
        ['assistant', LEGACY_SCHEMA.entityTypePalValue],
      ],
    ]);
  } catch (error) {
    if (!isExpectedMiss(error)) {
      logger.warn('Legacy sync_status entity_type migration failed:', error);
    }
  }

  // 5. Thumbnail directory.
  try {
    await migrateLegacyImagesDir();
  } catch (error) {
    logger.warn('Legacy images directory migration failed:', error);
  }

  try {
    await RNFS.writeFile(flagPath, 'true');
  } catch (error) {
    logger.warn('Could not write legacy-migration flag:', error);
  }
};

let pending: Promise<void> | null = null;

/**
 * Ensures the one-time legacy data migration has run. Safe to call from
 * every repository/store bootstrap path: the work executes once and is
 * memoized for the rest of the session.
 */
export const ensureLegacyDataMigrated = (): Promise<void> => {
  if (!pending) {
    pending = runLegacyDataMigration().catch(error => {
      logger.warn('Legacy data migration error:', error);
      pending = null; // allow a retry on the next bootstrap
      throw error;
    });
  }
  return pending;
};
