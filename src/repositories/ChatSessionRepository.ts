import {Q} from '@nozbe/watermelondb';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  database,
  ChatSession,
  Message,
  CompletionSetting,
  GlobalSetting,
} from '../database';

import {SessionMetaData} from '../store/ChatSessionStore';

import {MessageType} from '../utils/types';
import {CompletionParams} from '../utils/completionTypes';
import {
  defaultCompletionParams,
  migrateCompletionSettings,
} from '../utils/completionSettingsVersions';
import {logger} from '../utils/logger';
import {ensureLegacyDataMigrated} from '../database/legacyDataMigration';
import {withTimeout, yieldToUI} from '../utils/asyncGuard';
import {recordPhase, recordError, recordWarning} from '../utils/diagnostics';

// Default completion settings without prompt and stop
const defaultCompletionSettings = {...defaultCompletionParams};
delete defaultCompletionSettings.prompt;
delete defaultCompletionSettings.stop;

// --- JSON → WatermelonDB migration tuning -------------------------------
const MIGRATION_FLAG = 'db-migration-complete.flag';
const MIGRATION_RESUME_FILE = 'db-migration-progress.json';
const MIGRATION_IN_PROGRESS_FLAG = 'db-migration-in-progress.flag';
const LEGACY_DATA_MIGRATION_FLAG = 'drs-legacy-data-migration-complete.flag';

// The raw-SQL legacy migration crosses the native bridge once per
// statement group. A lost callback must surface as a recoverable error
// after 30s, never as an eternal spinner.
const LEGACY_MIGRATION_TIMEOUT_MS = 30_000;

// Message records are persisted with `database.batch` in chunks; one
// native round-trip per 200 messages instead of one per message.
const MESSAGES_PER_BATCH = 200;

/** Live progress of the JSON → WatermelonDB migration. */
export interface MigrationProgress {
  /** Sessions fully committed (DB write + resume marker done). */
  done: number;
  total: number;
  /** Messages committed so far (including previously resumed ones). */
  messages: number;
}

/** Optional hooks for the caller driving/observing the migration run. */
export interface MigrationRunControl {
  /** Called after each committed session. */
  onProgress?: (progress: MigrationProgress) => void;
  /** Polled between sessions; a `true` result aborts the run cleanly. */
  shouldStop?: () => boolean;
}

class ChatSessionRepository {
  // Check if we need to migrate from JSON files
  async checkAndMigrateFromJSON(
    control?: MigrationRunControl,
  ): Promise<boolean> {
    const doc = RNFS.DocumentDirectoryPath;
    const flagPath = `${doc}/${MIGRATION_FLAG}`;
    const resumePath = `${doc}/${MIGRATION_RESUME_FILE}`;
    const inProgressPath = `${doc}/${MIGRATION_IN_PROGRESS_FLAG}`;
    const oldDataPath = `${doc}/session-metadata.json`;

    try {
      // Move any pre-v9 legacy tables/columns/values into their renamed
      // counterparts before touching the collections below. Bounded by a
      // timeout: a lost native callback must become a recoverable error,
      // not an eternal spinner.
      recordPhase('db:legacy-migration-start');
      await withTimeout(
        ensureLegacyDataMigrated(),
        LEGACY_MIGRATION_TIMEOUT_MS,
        'legacy-data-migration',
      );
      recordPhase('db:legacy-migration-done');

      // Check if we've already migrated
      if (await RNFS.exists(flagPath)) {
        logger.debug('Database migration already completed');
        return false;
      }

      // A leftover in-progress marker means the previous launch was killed
      // mid-migration (crash, force close). The resume marker makes the
      // next attempt skip what was already committed.
      try {
        if (await RNFS.exists(inProgressPath)) {
          recordWarning(
            'db:previous-run-interrupted',
            'migration was killed mid-run on a previous launch',
          );
        }
      } catch {
        // Ignore.
      }

      // Mark this run as in progress so an interrupted attempt is visible
      // to the next launch (and to diagnostics).
      try {
        await RNFS.writeFile(inProgressPath, 'true');
      } catch (error) {
        recordWarning('db:in-progress-flag-write-failed', String(error));
      }

      // Check if old JSON data exists
      if (!(await RNFS.exists(oldDataPath))) {
        // No old data to migrate, mark as complete
        await RNFS.writeFile(flagPath, 'true');
        recordPhase('db:no-legacy-json-marked-done');
        return false;
      }

      logger.debug('Starting migration from JSON to WatermelonDB...');

      // Read old data
      recordPhase('db:json-read-start');
      const jsonData = await RNFS.readFile(oldDataPath);
      recordPhase('db:json-read-done', `${jsonData.length} chars`);
      const sessions: SessionMetaData[] = JSON.parse(jsonData);

      const totalMessages = sessions.reduce(
        (sum, s) => sum + (s.messages?.length ?? 0),
        0,
      );
      recordPhase(
        'db:json-parsed',
        `${sessions.length} sessions, ${totalMessages} messages`,
      );

      // Resume support: sessions already committed by a previous attempt
      // are skipped, so a retried migration neither duplicates data nor
      // re-does work.
      let committed = 0;
      try {
        if (await RNFS.exists(resumePath)) {
          const marker = JSON.parse(await RNFS.readFile(resumePath));
          if (typeof marker?.committed === 'number' && marker.committed >= 0) {
            committed = Math.min(marker.committed, sessions.length);
          }
        }
      } catch {
        committed = 0; // corrupt marker → start over
      }
      if (committed > 0) {
        recordPhase('db:resume', `skipping ${committed} committed sessions`);
      }

      let messagesDone = 0;
      for (let i = 0; i < committed; i++) {
        messagesDone += sessions[i]?.messages?.length ?? 0;
      }

      // Import session-by-session, each in its own transaction, with a
      // resumable marker and a progress event after every commit. The old
      // single monolithic transaction was the freeze: one lost native
      // round-trip among thousands of per-message awaits left the
      // "Upgrading database..." spinner running forever, with nothing
      // recoverable on disk and no error to catch.
      for (let index = committed; index < sessions.length; index++) {
        if (control?.shouldStop?.()) {
          recordPhase('db:migration-aborted-by-caller', `at ${index}`);
          return false;
        }

        const session = sessions[index];
        const sessionMessages = session.messages ?? [];
        const migratedSettings = migrateCompletionSettings(
          session.completionSettings,
        );

        await database.write(async () => {
          const newSession = database.collections
            .get('chat_sessions')
            .prepareCreate((record: any) => {
              record.title = session.title;
              record.date = session.date;
              if (session.activeAssistantId) {
                record.activeAssistantId = session.activeAssistantId;
              }
            });

          const sessionSettings = database.collections
            .get('completion_settings')
            .prepareCreate((record: any) => {
              record.sessionId = newSession.id;
              record.settings = JSON.stringify(migratedSettings);
            });

          const messageRecords = sessionMessages.map((msg, i) =>
            database.collections
              .get('messages')
              .prepareCreate((record: any) => {
                // Use sessionId (JavaScript property), not session_id (DB column)
                record.sessionId = newSession.id;
                record.author =
                  typeof msg.author === 'string'
                    ? msg.author
                    : msg.author?.id || 'unknown';
                if (msg.type === 'text') {
                  record.text = msg.text;
                }
                record.type = msg.type;
                record.metadata = JSON.stringify(
                  this.buildMigrationMetadata(msg),
                );
                record.position = sessionMessages.length - i;
                record.createdAt = msg.createdAt || Date.now();
              }),
          );

          // One native round-trip per chunk instead of one per message.
          const batched = [newSession, sessionSettings, ...messageRecords];
          for (
            let start = 0;
            start < batched.length;
            start += MESSAGES_PER_BATCH
          ) {
            await database.batch(
              ...batched.slice(start, start + MESSAGES_PER_BATCH),
            );
          }
        });

        messagesDone += sessionMessages.length;
        committed = index + 1;

        // Commit marker AFTER the transaction resolved, so a crash can
        // never leave the marker ahead of the actual data.
        try {
          await RNFS.writeFile(resumePath, JSON.stringify({committed}));
        } catch (error) {
          recordWarning('db:resume-write-failed', String(error));
        }
        control?.onProgress?.({
          done: committed,
          total: sessions.length,
          messages: messagesDone,
        });
        // Let pending frames render between sessions so the UI keeps
        // breathing even during a long import.
        await yieldToUI();
      }

      // Global settings, guarded so a resumed run cannot duplicate them.
      await this.importGlobalSettingsIfNeeded();

      // Mark migration as complete and clear the resume bookkeeping.
      await RNFS.writeFile(flagPath, 'true');
      await RNFS.unlink(resumePath).catch(() => undefined);
      logger.debug(
        'Migration from JSON to WatermelonDB completed successfully',
      );
      recordPhase('db:migration-done', `${committed} sessions committed`);
      return true;
    } catch (error) {
      // Surface the failure to the caller (the store shows the recovery
      // UI). Swallowing here used to leave the app running against a
      // half-migrated database with no visible signal.
      recordError(error, 'db:migration');
      console.error('Error during migration:', error);
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      // The run is over (success or JS-visible failure). Only a process
      // kill mid-migration should leave the marker behind.
      try {
        if (await RNFS.exists(inProgressPath)) {
          await RNFS.unlink(inProgressPath);
        }
      } catch {
        // Ignore.
      }
    }
  }

  /** Normalizes author data into the persisted metadata shape. */
  private buildMigrationMetadata(
    msg: SessionMetaData['messages'][number],
  ): string {
    const metadata = {...(msg.metadata || {})};

    if (typeof msg.author === 'object' && msg.author !== null) {
      if (msg.author.firstName || msg.author.lastName || msg.author.imageUrl) {
        metadata.authorData = {
          firstName: msg.author.firstName,
          lastName: msg.author.lastName,
          imageUrl: msg.author.imageUrl,
          role: msg.author.role,
        };
      }
    }

    return JSON.stringify(metadata);
  }

  /**
   * Imports the legacy global completion settings JSON (if present) into
   * `global_settings`, exactly once even across resumed runs.
   */
  private async importGlobalSettingsIfNeeded(): Promise<void> {
    const globalSettingsPath = `${RNFS.DocumentDirectoryPath}/global-completion-settings.json`;
    if (!(await RNFS.exists(globalSettingsPath))) {
      return;
    }

    const existing = await database.collections
      .get('global_settings')
      .query(Q.where('key', 'newChatCompletionSettings'))
      .fetch();
    if (existing.length > 0) {
      return;
    }

    const globalSettingsData = await RNFS.readFile(globalSettingsPath);
    const globalSettings: CompletionParams = JSON.parse(globalSettingsData);
    const migratedGlobalSettings = migrateCompletionSettings(globalSettings);

    await database.write(async () => {
      await database.collections
        .get('global_settings')
        .create((record: any) => {
          record.key = 'newChatCompletionSettings';
          record.value = JSON.stringify(migratedGlobalSettings);
        });
    });
  }

  /**
   * Destructive recovery — the WatermelonDB equivalent of Room's
   * `.fallbackToDestructiveMigration()`. Wipes every row and recreates the
   * schema, removes the legacy JSON sources so the migration does not
   * re-run, and flags both one-time migrations complete. Only invoked
   * from the user-visible recovery UI after a migration stall or failure,
   * with an explicit confirmation.
   */
  async resetDatabaseDestructively(): Promise<void> {
    recordPhase('db:destructive-reset-start');
    await withTimeout(
      database.adapter.unsafeResetDatabase(),
      45_000,
      'destructive-db-reset',
    );

    const doc = RNFS.DocumentDirectoryPath;
    const leftovers = [
      `${doc}/session-metadata.json`,
      `${doc}/global-completion-settings.json`,
      `${doc}/${MIGRATION_RESUME_FILE}`,
      `${doc}/${MIGRATION_IN_PROGRESS_FLAG}`,
    ];
    for (const path of leftovers) {
      try {
        if (await RNFS.exists(path)) {
          await RNFS.unlink(path);
        }
      } catch (error) {
        recordWarning('db:reset-unlink-failed', `${path}: ${String(error)}`);
      }
    }

    await RNFS.writeFile(`${doc}/${MIGRATION_FLAG}`, 'true');
    await RNFS.writeFile(`${doc}/${LEGACY_DATA_MIGRATION_FLAG}`, 'true');
    recordPhase('db:destructive-reset-done');
  }

  // Get all sessions grouped by date
  async getAllSessions(): Promise<ChatSession[]> {
    const sessions = await database.collections
      .get('chat_sessions')
      .query()
      .fetch();
    return sessions as unknown as ChatSession[];
  }

  /**
   * Batched variant of `getAllSessions` + per-session
   * `getSessionMetadataWithSettings` for the startup sweep (v1.36.0).
   * The old path issued 1 + 2N sequential queries (a `find` and a settings
   * fetch per session); this performs exactly two — one for every session
   * row and one `IN` query for every settings row — and joins in memory,
   * so cold-start cost stops scaling linearly with chat history size.
   */
  async getAllSessionsWithSettings(): Promise<
    {session: ChatSession; completionSettings: CompletionSetting | null}[]
  > {
    const sessions = (await database.collections
      .get('chat_sessions')
      .query()
      .fetch()) as unknown as ChatSession[];

    const ids = sessions.map(s => s.id);
    const settingsRows = ids.length
      ? ((await database.collections
          .get('completion_settings')
          .query(Q.where('session_id', Q.oneOf(ids)))
          .fetch()) as unknown as CompletionSetting[])
      : [];

    const settingsBySessionId = new Map<string, CompletionSetting>();
    for (const row of settingsRows) {
      const key = row.sessionId;
      // First row wins, mirroring the `[0]` pick in the per-session path.
      if (key && !settingsBySessionId.has(key)) {
        settingsBySessionId.set(key, row);
      }
    }

    return sessions.map(session => ({
      session,
      completionSettings: settingsBySessionId.get(session.id) ?? null,
    }));
  }

  // Get every message row (for global chat statistics).
  async getAllMessages(): Promise<Message[]> {
    const messages = await database.collections.get('messages').query().fetch();
    return messages as unknown as Message[];
  }

  // Get a single session with its messages and settings
  async getSessionById(id: string): Promise<{
    session: ChatSession;
    messages: Message[];
    completionSettings: CompletionSetting;
  } | null> {
    const session = await database.collections
      .get('chat_sessions')
      .find(id)
      .catch(() => null);

    if (!session) {
      return null;
    }

    const messages = await database.collections
      .get('messages')
      .query(Q.where('session_id', id), Q.sortBy('position', Q.desc))
      .fetch();

    // Since we're using 'has_many' for completion_settings in the model (TypeScript limitation),
    // we need to fetch as an array and get the first item
    const completionSettingsArray = await database.collections
      .get('completion_settings')
      .query(Q.where('session_id', id))
      .fetch();

    const completionSettings =
      completionSettingsArray.length > 0 ? completionSettingsArray[0] : null;

    return {
      session: session as unknown as ChatSession,
      messages: messages as unknown as Message[],
      completionSettings: completionSettings as unknown as CompletionSetting,
    };
  }

  // Get session metadata with settings but without messages (for lazy loading)
  async getSessionMetadataWithSettings(id: string): Promise<{
    session: ChatSession;
    completionSettings: CompletionSetting;
  } | null> {
    const session = await database.collections
      .get('chat_sessions')
      .find(id)
      .catch(() => null);

    if (!session) {
      return null;
    }

    // Get completion settings but NOT messages
    const completionSettingsArray = await database.collections
      .get('completion_settings')
      .query(Q.where('session_id', id))
      .fetch();

    const completionSettings =
      completionSettingsArray.length > 0 ? completionSettingsArray[0] : null;

    return {
      session: session as unknown as ChatSession,
      completionSettings: completionSettings as unknown as CompletionSetting,
    };
  }

  // Create a new session
  async createSession(
    title: string,
    initialMessages: MessageType.Any[] = [],
    completionSettings: CompletionParams = defaultCompletionSettings,
    activeAssistantId?: string,
    settingsSource?: 'assistant' | 'custom',
  ): Promise<ChatSession> {
    let newSession: any;

    await database.write(async () => {
      // Create session
      newSession = await database.collections
        .get('chat_sessions')
        .create((record: any) => {
          record.title = title;
          record.date = new Date().toISOString();
          if (activeAssistantId) {
            record.activeAssistantId = activeAssistantId;
          }
          if (settingsSource) {
            record.settingsSource = settingsSource;
          }
        });

      // Create completion settings with version
      const migratedSettings = migrateCompletionSettings(completionSettings);

      await database.collections
        .get('completion_settings')
        .create((record: any) => {
          record.sessionId = newSession.id;
          record.settings = JSON.stringify(migratedSettings);
        });

      // Create initial messages if any
      for (let i = 0; i < initialMessages.length; i++) {
        const msg = initialMessages[i];

        const authorId = msg.author.id;
        const metadata = msg.metadata || {};

        if (
          msg.author.firstName ||
          msg.author.lastName ||
          msg.author.imageUrl
        ) {
          metadata.authorData = {
            firstName: msg.author.firstName,
            lastName: msg.author.lastName,
            imageUrl: msg.author.imageUrl,
            role: msg.author.role,
          };
        }
        if (msg.type === 'text' && msg.imageUris) {
          metadata.imageUris = msg.imageUris;
        }
        if (msg.type === 'assistant_turn') {
          metadata.steps = (msg as MessageType.AssistantTurn).steps ?? [];
        }

        await database.collections.get('messages').create((record: any) => {
          record.sessionId = newSession.id;
          record.author = authorId;
          if (msg.type === 'text') {
            record.text = msg.text;
          }
          // assistant_turn rows leave `text` unset (see addMessageToSession).
          record.type = msg.type;
          record.metadata = JSON.stringify(metadata);
          record.position = initialMessages.length - i; // Reverse order
          record.createdAt = msg.createdAt || Date.now();
        });
      }
    });

    return newSession as unknown as ChatSession;
  }

  // Delete a session
  async deleteSession(id: string): Promise<void> {
    const session = await database.collections
      .get('chat_sessions')
      .find(id)
      .catch(() => null);

    if (!session) {
      return;
    }

    await database.write(async () => {
      // Delete associated messages
      const messages = await database.collections
        .get('messages')
        .query(Q.where('session_id', id))
        .fetch();

      for (const message of messages) {
        await message.destroyPermanently();
      }

      // Delete associated completion settings
      const settings = await database.collections
        .get('completion_settings')
        .query(Q.where('session_id', id))
        .fetch();

      for (const setting of settings) {
        await setting.destroyPermanently();
      }

      // Delete the session itself
      await session.destroyPermanently();
    });
  }

  // Delete multiple sessions in a single transaction
  async deleteSessions(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await database.write(async () => {
      for (const id of ids) {
        const session = await database.collections
          .get('chat_sessions')
          .find(id)
          .catch(() => null);

        if (!session) {
          console.warn(`Session ${id} not found during bulk delete, skipping`);
          continue;
        }

        // Delete associated messages
        const messages = await database.collections
          .get('messages')
          .query(Q.where('session_id', id))
          .fetch();

        for (const message of messages) {
          await message.destroyPermanently();
        }

        // Delete associated completion settings
        const settings = await database.collections
          .get('completion_settings')
          .query(Q.where('session_id', id))
          .fetch();

        for (const setting of settings) {
          await setting.destroyPermanently();
        }

        // Delete the session itself
        await session.destroyPermanently();
      }
    });
  }

  // Export multiple sessions
  async exportSessions(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const {exportChatSession} = await import('../utils/exportUtils');

    for (const id of ids) {
      await exportChatSession(id);
    }
  }

  // Add a message to a session
  async addMessageToSession(
    sessionId: string,
    message: MessageType.Any,
  ): Promise<Message> {
    let newMessage: any;

    await database.write(async () => {
      // Get the highest position
      const messages = await database.collections
        .get('messages')
        .query(Q.where('session_id', sessionId))
        .fetch();

      // Calculate highest position - need to cast to any to access position property
      const positions = messages.map(m => (m as any).position || 0);
      const highestPosition = positions.length > 0 ? Math.max(...positions) : 0;

      // Extract author ID from User object
      const authorId = message.author.id;

      // Store additional author data in metadata
      const metadata = message.metadata || {};
      if (
        message.author.firstName ||
        message.author.lastName ||
        message.author.imageUrl
      ) {
        metadata.authorData = {
          firstName: message.author.firstName,
          lastName: message.author.lastName,
          imageUrl: message.author.imageUrl,
          role: message.author.role,
          // Add any other User properties you need
        };
      }

      // Store imageUris in metadata for text messages
      if (message.type === 'text' && (message as MessageType.Text).imageUris) {
        metadata.imageUris = (message as MessageType.Text).imageUris;
      }

      // Persist top-level `steps` for assistant_turn rows by writing it
      // into metadata.steps. The in-memory shape strips `steps` from
      // metadata (see Message.toMessageObject); this repository is the
      // sole writer of `metadata.steps` on the way back to disk.
      if (message.type === 'assistant_turn') {
        metadata.steps = (message as MessageType.AssistantTurn).steps ?? [];
      }

      newMessage = await database.collections
        .get('messages')
        .create((record: any) => {
          record.sessionId = sessionId;
          record.author = authorId; // Store just the ID
          if (message.type === 'text') {
            record.text = message.text;
          }
          // For assistant_turn rows the `text` column stays empty;
          // every consumer routes through `derivedText(message)` which
          // reads top-level `steps`. Same pattern as `image` / `file`.
          record.type = message.type;
          record.metadata = JSON.stringify(metadata);
          record.position = highestPosition + 1;
          record.createdAt = message.createdAt || Date.now();
        });
    });

    return newMessage as unknown as Message;
  }

  // Update a message. Accepts either a Text-shaped partial (legacy) or
  // an AssistantTurn-shaped partial (new pipeline). The type is wide to
  // support both shapes; both legacy timings/copyable updates and the
  // new agent runner per-step writes go through this path.
  async updateMessage(
    id: string,
    update:
      | Partial<MessageType.Text>
      | Partial<Omit<MessageType.AssistantTurn, 'type' | 'id' | 'author'>>,
  ): Promise<boolean> {
    try {
      const message = await database.collections
        .get('messages')
        .find(id)
        .catch(() => null);

      if (!message) {
        console.warn(
          `Message with ID ${id} not found in database, cannot update`,
        );
        return false;
      }

      await database.write(async () => {
        await message.update((record: any) => {
          if ('text' in update && update.text !== undefined) {
            record.text = update.text;
          }
          if (update.metadata !== undefined) {
            // MERGE metadata to preserve existing fields (e.g., timings,
            // metadata.steps for assistant_turn rows). The new agent
            // runner uses dedicated `pushAgentStep`/`updateActiveStep
            // Streaming`/`appendToolOutcome` paths that write the whole
            // `steps` array wholesale; ad-hoc `{metadata: {interrupted}}`
            // calls (e.g. error rollback) MUST NOT clobber metadata.steps.
            const existingMetadata = JSON.parse(record.metadata || '{}');
            record.metadata = JSON.stringify({
              ...existingMetadata,
              ...update.metadata,
            });
          }
          // Lift top-level `steps` (in-memory shape) back into
          // metadata.steps on disk. The schema column is unchanged; the
          // asymmetry (top-level on type, nested on disk) is intentional.
          if ('steps' in update && update.steps !== undefined) {
            const existingMetadata = JSON.parse(record.metadata || '{}');
            record.metadata = JSON.stringify({
              ...existingMetadata,
              steps: update.steps,
            });
          }
        });
      });

      return true;
    } catch (error) {
      console.error('Error updating message:', error);
      return false;
    }
  }

  // Update session completion settings
  async updateSessionCompletionSettings(
    sessionId: string,
    settings: CompletionParams,
  ): Promise<void> {
    const completionSettingsArray = await database.collections
      .get('completion_settings')
      .query(Q.where('session_id', sessionId))
      .fetch();

    if (completionSettingsArray.length === 0) {
      return;
    }

    const completionSettings = completionSettingsArray[0];

    await database.write(async () => {
      // Ensure settings have a version
      const migratedSettings = migrateCompletionSettings(settings);

      await completionSettings.update((record: any) => {
        record.settings = JSON.stringify(migratedSettings);
      });
    });
  }

  // Get global completion settings
  async getGlobalCompletionSettings(): Promise<CompletionParams> {
    const globalSettingsArray = await database.collections
      .get('global_settings')
      .query(Q.where('key', 'newChatCompletionSettings'))
      .fetch();

    if (globalSettingsArray.length === 0) {
      return defaultCompletionSettings;
    }

    const globalSettings = globalSettingsArray[0] as any;
    return JSON.parse(globalSettings.value);
  }

  // Save global completion settings
  async saveGlobalCompletionSettings(
    settings: CompletionParams,
  ): Promise<void> {
    await database.write(async () => {
      const existingSettingsArray = await database.collections
        .get('global_settings')
        .query(Q.where('key', 'newChatCompletionSettings'))
        .fetch();

      const migratedSettings = migrateCompletionSettings(settings);

      if (existingSettingsArray.length > 0) {
        const existingSettings = existingSettingsArray[0];
        await existingSettings.update((record: any) => {
          record.value = JSON.stringify(migratedSettings);
        });
      } else {
        await database.collections
          .get('global_settings')
          .create((record: any) => {
            record.key = 'newChatCompletionSettings';
            record.value = JSON.stringify(migratedSettings);
          });
      }
    });
  }

  // Update session title
  async updateSessionTitle(sessionId: string, newTitle: string): Promise<void> {
    const session = await database.collections
      .get('chat_sessions')
      .find(sessionId)
      .catch(() => null);

    if (!session) {
      return;
    }

    await database.write(async () => {
      await session.update((record: any) => {
        record.title = newTitle;
      });
    });
  }

  // Set pinned status for a session.
  // Deliberately does not swallow a missing record the way the sibling setters
  // do: the store must not mirror a pin it could not persist.
  async setSessionPinned(sessionId: string, pinned: boolean): Promise<void> {
    const session = await database.collections
      .get('chat_sessions')
      .find(sessionId);

    await database.write(async () => {
      await session.update((record: any) => {
        record.pinned = pinned;
      });
    });
  }

  // Assign a session to a folder (null removes it from its folder).
  async setSessionFolder(
    sessionId: string,
    folder: string | null,
  ): Promise<void> {
    const session = await database.collections
      .get('chat_sessions')
      .find(sessionId);

    await database.write(async () => {
      await session.update((record: any) => {
        record.folder = folder;
      });
    });
  }

  // Replace the tag list of a session (empty array clears all tags).
  async setSessionTags(sessionId: string, tags: string[]): Promise<void> {
    const session = await database.collections
      .get('chat_sessions')
      .find(sessionId);

    const normalized = [...new Set(tags.map(t => t.trim()).filter(Boolean))];

    await database.write(async () => {
      await session.update((record: any) => {
        record.tags = normalized.length > 0 ? JSON.stringify(normalized) : null;
      });
    });
  }

  // Rename a folder across every session carrying it.
  async renameFolder(oldName: string, newName: string): Promise<void> {
    const sessions = await database.collections
      .get('chat_sessions')
      .query(Q.where('folder', oldName))
      .fetch();

    await database.write(async () => {
      for (const session of sessions) {
        await session.update((record: any) => {
          record.folder = newName;
        });
      }
    });
  }

  // Remove a folder from every session carrying it (sessions are kept).
  async deleteFolder(name: string): Promise<void> {
    const sessions = await database.collections
      .get('chat_sessions')
      .query(Q.where('folder', name))
      .fetch();

    await database.write(async () => {
      for (const session of sessions) {
        await session.update((record: any) => {
          record.folder = null;
        });
      }
    });
  }

  // Remove one tag from every session that carries it.
  async removeTagEverywhere(tag: string): Promise<void> {
    const sessions = (await this.getAllSessions()) as ChatSession[];
    const affected = sessions.filter(session => session.tagList.includes(tag));

    await database.write(async () => {
      for (const session of affected) {
        const next = session.tagList.filter(t => t !== tag);
        await session.update((record: any) => {
          record.tags = next.length > 0 ? JSON.stringify(next) : null;
        });
      }
    });
  }

  // Set active assistant for a session
  async setSessionActiveAssistant(
    sessionId: string,
    assistantId?: string,
  ): Promise<void> {
    const session = await database.collections
      .get('chat_sessions')
      .find(sessionId)
      .catch(() => null);

    if (!session) {
      return;
    }

    await database.write(async () => {
      await session.update((record: any) => {
        record.activeAssistantId = assistantId || null;
      });
    });
  }

  // Set settings source for a session
  async setSessionSettingsSource(
    sessionId: string,
    settingsSource: 'assistant' | 'custom',
  ): Promise<void> {
    const session = await database.collections
      .get('chat_sessions')
      .find(sessionId)
      .catch(() => null);

    if (!session) {
      return;
    }

    await database.write(async () => {
      await session.update((record: any) => {
        record.settingsSource = settingsSource;
      });
    });
  }

  // Delete a message by ID
  async deleteMessage(id: string): Promise<void> {
    const message = await database.collections
      .get('messages')
      .find(id)
      .catch(() => null);

    if (!message) {
      return;
    }

    await database.write(async () => {
      await message.destroyPermanently();
    });
  }

  // Reset migration flag for testing
  async resetMigration(): Promise<void> {
    try {
      const migrationFlagPath = `${RNFS.DocumentDirectoryPath}/db-migration-complete.flag`;
      if (await RNFS.exists(migrationFlagPath)) {
        await RNFS.unlink(migrationFlagPath);
        logger.debug('Migration flag reset successfully');
      } else {
        logger.debug('Migration flag does not exist');
      }

      // Clear the database for a clean migration test
      await database.write(async () => {
        // Get all collections
        const collections = [
          'chat_sessions',
          'messages',
          'completion_settings',
          'global_settings',
        ];

        // Delete all records in each collection
        for (const collectionName of collections) {
          const records = await database.collections
            .get(collectionName)
            .query()
            .fetch();

          for (const record of records) {
            await record.destroyPermanently();
          }
        }
      });

      logger.debug('Database cleared for migration test');
    } catch (error) {
      console.error('Failed to reset migration:', error);
    }
  }

  /**
   * Migrates settings for all sessions and global settings if needed
   * This should be called periodically to ensure all settings are up to date
   */
  async migrateAllSettings(): Promise<void> {
    try {
      logger.debug('Checking for settings that need migration...');

      // Get all completion settings
      const completionSettings = (await database.collections
        .get('completion_settings')
        .query()
        .fetch()) as CompletionSetting[];

      // Get all global settings
      const globalSettings = (await database.collections
        .get('global_settings')
        .query()
        .fetch()) as GlobalSetting[];

      // Check which settings need migration
      const settingsToMigrate = completionSettings.filter(setting => {
        try {
          const parsedSettings = JSON.parse(setting.settings);
          const migratedSettings = migrateCompletionSettings(parsedSettings);
          return migratedSettings.version !== parsedSettings.version;
        } catch (error) {
          console.error('Error checking if settings need migration:', error);
          return false;
        }
      });

      // Check which global settings need migration
      const globalSettingsToMigrate = globalSettings.filter(setting => {
        if (setting.key !== 'newChatCompletionSettings') {
          return false;
        }

        try {
          const parsedSettings = JSON.parse(setting.value);
          const migratedSettings = migrateCompletionSettings(parsedSettings);
          return migratedSettings.version !== parsedSettings.version;
        } catch (error) {
          console.error(
            'Error checking if global settings need migration:',
            error,
          );
          return false;
        }
      });

      logger.debug(
        `Found ${settingsToMigrate.length} session settings and ${globalSettingsToMigrate.length} global settings that need migration`,
      );

      // Migrate settings in a single transaction
      if (settingsToMigrate.length > 0 || globalSettingsToMigrate.length > 0) {
        await database.write(async () => {
          // Migrate completion settings
          for (const setting of settingsToMigrate) {
            const parsedSettings = JSON.parse(setting.settings);
            const migratedSettings = migrateCompletionSettings(parsedSettings);

            await setting.update((record: any) => {
              record.settings = JSON.stringify(migratedSettings);
            });

            logger.debug(
              `Migrated settings for session ${setting.sessionId} from version ${parsedSettings.version} to ${migratedSettings.version}`,
            );
          }

          // Migrate global settings
          for (const setting of globalSettingsToMigrate) {
            const parsedSettings = JSON.parse(setting.value);
            const migratedSettings = migrateCompletionSettings(parsedSettings);

            await setting.update((record: any) => {
              record.value = JSON.stringify(migratedSettings);
            });

            logger.debug(
              `Migrated global settings for key ${setting.key} from version ${parsedSettings.version} to ${migratedSettings.version}`,
            );
          }
        });

        logger.debug('Settings migration completed successfully');
      } else {
        logger.debug('No settings need migration');
      }
    } catch (error) {
      console.error('Error migrating settings:', error);
    }
  }
}

export const chatSessionRepository = new ChatSessionRepository();
