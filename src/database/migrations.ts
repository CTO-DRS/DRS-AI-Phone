import {
  schemaMigrations,
  createTable,
  addColumns,
} from '@nozbe/watermelondb/Schema/migrations';
import {LEGACY_SCHEMA} from './legacyCompat';

export default schemaMigrations({
  migrations: [
    // Initial migration is handled by the schema
    {
      toVersion: 2,
      steps: [
        createTable({
          name: LEGACY_SCHEMA.cachedPalsTable,
          columns: [
            {name: 'drshub_id', type: 'string', isIndexed: true},
            {name: 'title', type: 'string'},
            {name: 'description', type: 'string', isOptional: true},
            {name: 'thumbnail_url', type: 'string', isOptional: true},
            {name: 'creator_id', type: 'string'},
            {name: 'creator_name', type: 'string', isOptional: true},
            {name: 'creator_avatar_url', type: 'string', isOptional: true},
            {name: 'protection_level', type: 'string'},
            {name: 'price_cents', type: 'number'},
            {name: 'allow_fork', type: 'boolean'},
            {name: 'average_rating', type: 'number', isOptional: true},
            {name: 'review_count', type: 'number'},
            {name: 'is_owned', type: 'boolean'},
            {name: 'categories', type: 'string'}, // JSON array
            {name: 'tags', type: 'string'}, // JSON array
            {name: 'system_prompt', type: 'string', isOptional: true},
            {name: 'model_settings', type: 'string'}, // JSON object
            {name: 'cached_at', type: 'number'},
            {name: 'created_at', type: 'number'},
            {name: 'updated_at', type: 'number'},
          ],
        }),
        createTable({
          name: 'user_library',
          columns: [
            {name: 'user_id', type: 'string', isIndexed: true},
            {name: 'drshub_id', type: 'string', isIndexed: true},
            {name: 'purchased_at', type: 'number'},
            {name: 'purchase_id', type: 'string', isOptional: true},
            {name: 'is_downloaded', type: 'boolean'},
            {name: 'download_path', type: 'string', isOptional: true},
            {name: 'created_at', type: 'number'},
          ],
        }),
        createTable({
          name: 'sync_status',
          columns: [
            {name: 'entity_type', type: 'string', isIndexed: true},
            {name: 'entity_id', type: 'string', isOptional: true},
            {name: 'last_sync', type: 'number'},
            {name: 'sync_version', type: 'string', isOptional: true},
            {name: 'status', type: 'string'},
            {name: 'error_message', type: 'string', isOptional: true},
            {name: 'created_at', type: 'number'},
            {name: 'updated_at', type: 'number'},
          ],
        }),
      ],
    },
    // Migration to version 3: Add the local assistants table
    // (legacy table name — see legacyCompat.ts)
    {
      toVersion: 3,
      steps: [
        createTable({
          name: LEGACY_SCHEMA.localPalsTable,
          columns: [
            {name: 'name', type: 'string'},
            {name: 'system_prompt', type: 'string'},
            {name: 'original_system_prompt', type: 'string', isOptional: true},
            {name: 'is_system_prompt_changed', type: 'boolean'},
            {name: 'use_ai_prompt', type: 'boolean'},
            {name: 'default_model', type: 'string', isOptional: true}, // JSON stringified
            {name: 'prompt_generation_model', type: 'string', isOptional: true}, // JSON stringified
            {name: 'generating_prompt', type: 'string', isOptional: true},
            {name: 'color', type: 'string', isOptional: true}, // JSON stringified [string, string]
            {name: 'capabilities', type: 'string'}, // JSON stringified AssistantCapabilities
            {name: 'parameters', type: 'string'}, // JSON stringified Record<string, any>
            {name: 'parameter_schema', type: 'string'}, // JSON stringified ParameterDefinition[]
            {name: 'source', type: 'string'}, // 'local' | 'drshub'
            {name: 'drshub_id', type: 'string', isOptional: true},
            {name: 'creator_info', type: 'string', isOptional: true}, // JSON stringified
            {name: 'categories', type: 'string', isOptional: true}, // JSON stringified string[]
            {name: 'tags', type: 'string', isOptional: true}, // JSON stringified string[]
            {name: 'rating', type: 'number', isOptional: true},
            {name: 'review_count', type: 'number', isOptional: true},
            {name: 'protection_level', type: 'string', isOptional: true},
            {name: 'price_cents', type: 'number', isOptional: true},
            {name: 'is_owned', type: 'boolean', isOptional: true},
            {name: 'generation_settings', type: 'string', isOptional: true}, // JSON stringified
            {name: 'created_at', type: 'number'},
            {name: 'updated_at', type: 'number'},
          ],
        }),
      ],
    },
    // Migration to version 4: Add description column
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: LEGACY_SCHEMA.localPalsTable,
          columns: [{name: 'description', type: 'string', isOptional: true}],
        }),
      ],
    },
    // Migration to version 5: Add thumbnail_url column
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: LEGACY_SCHEMA.localPalsTable,
          columns: [{name: 'thumbnail_url', type: 'string', isOptional: true}],
        }),
      ],
    },
    // Migration to version 6: Add settings_source column to chat_sessions
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'chat_sessions',
          columns: [
            {name: 'settings_source', type: 'string', isOptional: true},
          ],
        }),
      ],
    },
    // Migration to version 7: Add pact and greeting columns
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: LEGACY_SCHEMA.localPalsTable,
          columns: [
            {name: 'pact', type: 'string', isOptional: true}, // JSON stringified { talents: TalentRef[] }
            {name: 'greeting', type: 'string', isOptional: true}, // JSON stringified Assistant['greeting']
          ],
        }),
      ],
    },
    // Migration to version 8: Add pinned column to chat_sessions
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'chat_sessions',
          columns: [{name: 'pinned', type: 'boolean'}],
        }),
      ],
    },
    // Migration to version 9: Rename the legacy data layer to the DRS AI
    // naming. Creates the renamed tables; the one-time data move happens
    // in src/database/legacyDataMigration.ts right after the adapter
    // finishes migrating (raw-SQL copy, then the legacy tables are
    // dropped). See legacyCompat.ts for the legacy-name island rationale.
    {
      toVersion: 9,
      steps: [
        createTable({
          name: 'cached_assistants',
          columns: [
            {name: 'drshub_id', type: 'string', isIndexed: true},
            {name: 'title', type: 'string'},
            {name: 'description', type: 'string', isOptional: true},
            {name: 'thumbnail_url', type: 'string', isOptional: true},
            {name: 'creator_id', type: 'string'},
            {name: 'creator_name', type: 'string', isOptional: true},
            {name: 'creator_avatar_url', type: 'string', isOptional: true},
            {name: 'protection_level', type: 'string'},
            {name: 'price_cents', type: 'number'},
            {name: 'allow_fork', type: 'boolean'},
            {name: 'average_rating', type: 'number', isOptional: true},
            {name: 'review_count', type: 'number'},
            {name: 'is_owned', type: 'boolean'},
            {name: 'categories', type: 'string'}, // JSON array
            {name: 'tags', type: 'string'}, // JSON array
            {name: 'system_prompt', type: 'string', isOptional: true},
            {name: 'model_settings', type: 'string'}, // JSON object
            {name: 'cached_at', type: 'number'},
            {name: 'created_at', type: 'number'},
            {name: 'updated_at', type: 'number'},
          ],
        }),
        createTable({
          name: 'local_assistants',
          columns: [
            {name: 'name', type: 'string'},
            {name: 'description', type: 'string', isOptional: true},
            {name: 'thumbnail_url', type: 'string', isOptional: true},
            {name: 'system_prompt', type: 'string'},
            {name: 'original_system_prompt', type: 'string', isOptional: true},
            {name: 'is_system_prompt_changed', type: 'boolean'},
            {name: 'use_ai_prompt', type: 'boolean'},
            {name: 'default_model', type: 'string', isOptional: true}, // JSON stringified
            {name: 'prompt_generation_model', type: 'string', isOptional: true}, // JSON stringified
            {name: 'generating_prompt', type: 'string', isOptional: true},
            {name: 'color', type: 'string', isOptional: true}, // JSON stringified [string, string]
            {name: 'capabilities', type: 'string'}, // JSON stringified AssistantCapabilities
            {name: 'parameters', type: 'string'}, // JSON stringified Record<string, any>
            {name: 'parameter_schema', type: 'string'}, // JSON stringified ParameterDefinition[]
            {name: 'source', type: 'string'}, // 'local' | 'drshub'
            {name: 'drshub_id', type: 'string', isOptional: true},
            {name: 'creator_info', type: 'string', isOptional: true}, // JSON stringified
            {name: 'categories', type: 'string', isOptional: true}, // JSON stringified string[]
            {name: 'tags', type: 'string', isOptional: true}, // JSON stringified string[]
            {name: 'rating', type: 'number', isOptional: true},
            {name: 'review_count', type: 'number', isOptional: true},
            {name: 'protection_level', type: 'string', isOptional: true},
            {name: 'price_cents', type: 'number', isOptional: true},
            {name: 'is_owned', type: 'boolean', isOptional: true},
            {name: 'generation_settings', type: 'string', isOptional: true}, // JSON stringified
            {name: 'pact', type: 'string', isOptional: true}, // JSON stringified { talents: TalentRef[] }
            {name: 'greeting', type: 'string', isOptional: true}, // JSON stringified Assistant['greeting']
            {name: 'created_at', type: 'number'},
            {name: 'updated_at', type: 'number'},
          ],
        }),
        addColumns({
          table: 'chat_sessions',
          columns: [
            {name: 'active_assistant_id', type: 'string', isOptional: true},
          ],
        }),
      ],
    },
    // Migration to version 10: Chat organization — folder + tags columns
    // on chat_sessions. `folder` holds the folder name directly (folders
    // are virtual: their list is the distinct set across sessions);
    // `tags` is a JSON stringified string[].
    {
      toVersion: 10,
      steps: [
        addColumns({
          table: 'chat_sessions',
          columns: [
            {name: 'folder', type: 'string', isOptional: true},
            {name: 'tags', type: 'string', isOptional: true}, // JSON stringified string[]
          ],
        }),
      ],
    },
  ],
});
