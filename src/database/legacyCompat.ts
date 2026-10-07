/**
 * LEGACY SCHEMA NAME ISLAND — the single place in the codebase where
 * pre-DRS-AI data-layer names are allowed to appear.
 *
 * DRS AI v9 (schema version 9) renamed every persisted identifier that
 * was inherited from the project's original codebase:
 *   table  local_assistants                -> local_assistants
 *   table  cached_assistants               -> cached_assistants
 *   column chat_sessions.active_assistant_id -> active_assistant_id
 *   value  settings_source 'assistant'     -> 'assistant'
 *   value  sync_status.entity_type 'assistant' -> 'assistant'
 *
 * These legacy literals must survive in exactly two places so that
 * databases created by older app versions (schema versions 2-8) can
 * still migrate their user data:
 *   1. src/database/migrations.ts        — the historical steps that
 *      built the old tables on devices that are still on v2-v8
 *   2. src/database/legacyDataMigration.ts — the one-time SQL that
 *      moves legacy rows into the renamed tables
 *
 * Fresh installs never touch any of these: they create the renamed
 * tables directly at version 9. Do not reference these constants
 * anywhere else in the codebase.
 */
export const LEGACY_SCHEMA = {
  /** Old table holding user-created assistants (renamed in v9). */
  localAssistantsTable: 'local_assistants',
  /** Old table caching DRS Hub catalogue entries (renamed in v9). */
  cachedAssistantsTable: 'cached_assistants',
  /** Old chat_sessions column pointing at the active assistant. */
  activeAssistantIdColumn: 'active_assistant_id',
  /** Old settings_source value meaning "use the assistant's settings". */
  settingsSourceAssistantValue: 'assistant',
  /** Old sync_status.entity_type value for assistants. */
  entityTypeAssistantValue: 'assistant',
  /** Old on-device directory holding downloaded assistant thumbnails. */
  assistantImagesDirName: 'assistant-images',
  /** Old AsyncStorage migration flag written by earlier app versions. */
  assistantDbMigrationFlag: 'assistant-db-migration-complete.flag',
} as const;

/**
 * Shared column list for the legacy -> renamed assistant tables copy.
 * Every column exists on both `local_assistants` (after migration v7) and
 * `local_assistants` (created at v9), so an explicit-column INSERT
 * INTO ... SELECT is safe regardless of physical column order.
 */
export const LEGACY_ASSISTANT_COPY_COLUMNS = [
  'id',
  '_status',
  'last_modified',
  'name',
  'description',
  'thumbnail_url',
  'system_prompt',
  'original_system_prompt',
  'is_system_prompt_changed',
  'use_ai_prompt',
  'default_model',
  'prompt_generation_model',
  'generating_prompt',
  'color',
  'capabilities',
  'parameters',
  'parameter_schema',
  'source',
  'drshub_id',
  'creator_info',
  'categories',
  'tags',
  'rating',
  'review_count',
  'protection_level',
  'price_cents',
  'is_owned',
  'generation_settings',
  'pact',
  'greeting',
  'created_at',
  'updated_at',
] as const;

/**
 * Shared column list for the legacy -> renamed DRS Hub cache copy.
 * The legacy table was created at migration v2 with exactly this
 * layout, so the renamed table (identical columns, v9) copies 1:1.
 */
export const LEGACY_CACHED_ASSISTANT_COPY_COLUMNS = [
  'id',
  '_status',
  'last_modified',
  'drshub_id',
  'title',
  'description',
  'thumbnail_url',
  'creator_id',
  'creator_name',
  'creator_avatar_url',
  'protection_level',
  'price_cents',
  'allow_fork',
  'average_rating',
  'review_count',
  'is_owned',
  'categories',
  'tags',
  'system_prompt',
  'model_settings',
  'cached_at',
  'created_at',
  'updated_at',
] as const;
