import * as RNFS from '@dr.pogodin/react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Q} from '@nozbe/watermelondb';
import {database} from '../database';
import LocalAssistant from '../database/models/LocalAssistant';
import type {Assistant} from '../types/assistant';
import {
  migrateLegacyAssistantToNew,
  type LegacyAssistantData,
} from '../utils/assistant-migration';
import {CompletionParams} from '../utils/completionTypes';
import {migrateCompletionSettings} from '../utils/completionSettingsVersions';
import {logger} from '../utils/logger';

class AssistantRepository {
  // Check if we need to migrate from JSON/AsyncStorage
  async checkAndMigrateFromJSON(): Promise<boolean> {
    try {
      // Check if we've already migrated
      const migrationFlagPath = `${RNFS.DocumentDirectoryPath}/assistant-db-migration-complete.flag`;
      const migrationComplete = await RNFS.exists(migrationFlagPath);

      if (migrationComplete) {
        logger.debug('Assistant database migration already completed');
        return false;
      }

      // Check if old AsyncStorage data exists
      const oldData = await AsyncStorage.getItem('AssistantStore');

      if (!oldData) {
        // No old data to migrate, mark as complete
        await RNFS.writeFile(migrationFlagPath, 'true');
        return false;
      }

      logger.debug(
        'Starting assistant migration from AsyncStorage to WatermelonDB...',
      );

      // Parse old data
      const parsedData = JSON.parse(oldData);
      const legacyAssistants: LegacyAssistantData[] =
        parsedData.assistants || [];

      if (legacyAssistants.length === 0) {
        // No assistants to migrate
        await RNFS.writeFile(migrationFlagPath, 'true');
        return false;
      }

      // Begin database transaction for atomic migration
      await database.write(async () => {
        // Migrate each legacy assistant to new format
        for (const legacyAssistant of legacyAssistants) {
          // Convert legacy assistant to new format
          const assistant = migrateLegacyAssistantToNew(legacyAssistant);
          await database.collections
            .get<LocalAssistant>('local_assistants')
            .create((record: LocalAssistant) => {
              record.name = assistant.name;
              record.description = assistant.description;
              record.thumbnailUrl = assistant.thumbnail_url;
              // logger.debug('Creating assistant with description:', assistant.description);
              record.systemPrompt = assistant.systemPrompt;
              record.originalSystemPrompt = assistant.originalSystemPrompt;
              record.isSystemPromptChanged = assistant.isSystemPromptChanged;
              record.useAIPrompt = assistant.useAIPrompt;
              record.defaultModel = LocalAssistant.safeStringify(
                assistant.defaultModel,
              );
              record.promptGenerationModel = LocalAssistant.safeStringify(
                assistant.promptGenerationModel,
              );
              record.generatingPrompt = assistant.generatingPrompt;
              record.color = LocalAssistant.safeStringify(assistant.color);
              record.capabilities = LocalAssistant.safeStringify(
                assistant.capabilities,
              );
              record.parameters = LocalAssistant.safeStringify(
                assistant.parameters,
              );
              record.parameterSchema = LocalAssistant.safeStringifyArray(
                assistant.parameterSchema || [],
              );
              record.source = assistant.source || 'local';
              record.drshubId = assistant.drshub_id;
              record.creatorInfo = LocalAssistant.safeStringify(
                assistant.creator_info,
              );
              record.categories = LocalAssistant.safeStringifyArray(
                assistant.categories || [],
              );
              record.tags = LocalAssistant.safeStringifyArray(
                assistant.tags || [],
              );
              record.rating = assistant.rating;
              record.reviewCount = assistant.review_count;
              record.protectionLevel = assistant.protection_level;
              record.priceCents = assistant.price_cents;
              record.isOwned = assistant.is_owned;
              record.generationSettings = LocalAssistant.safeStringify(
                assistant.rawDrshubGenerationSettings,
              );
            });
        }
      });

      // Mark migration as complete
      await RNFS.writeFile(migrationFlagPath, 'true');

      // Optionally remove old data
      await AsyncStorage.removeItem('AssistantStore');

      logger.debug(
        `Successfully migrated ${legacyAssistants.length} assistants to database`,
      );
      return true;
    } catch (error) {
      console.error('Error migrating assistants from AsyncStorage:', error);
      return false;
    }
  }

  // CRUD Operations

  async getAllAssistants(): Promise<Assistant[]> {
    try {
      const localAssistants = await database.collections
        .get<LocalAssistant>('local_assistants')
        .query()
        .fetch();

      return localAssistants.map(assistant => assistant.toAssistant());
    } catch (error) {
      console.error('Error fetching all assistants:', error);
      return [];
    }
  }

  async getAssistantById(id: string): Promise<Assistant | null> {
    try {
      const localAssistant = await database.collections
        .get<LocalAssistant>('local_assistants')
        .find(id);

      return localAssistant.toAssistant();
    } catch (error) {
      console.error('Error fetching assistant by id:', error);
      return null;
    }
  }

  async createAssistant(
    assistantData: Omit<Assistant, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Assistant> {
    try {
      const newAssistant = await database.write(async () => {
        return await database.collections
          .get<LocalAssistant>('local_assistants')
          .create((record: LocalAssistant) => {
            record.name = assistantData.name;
            record.description = assistantData.description;
            record.thumbnailUrl = assistantData.thumbnail_url;
            record.systemPrompt = assistantData.systemPrompt;
            record.originalSystemPrompt = assistantData.originalSystemPrompt;
            record.isSystemPromptChanged = assistantData.isSystemPromptChanged;
            record.useAIPrompt = assistantData.useAIPrompt;
            record.defaultModel = LocalAssistant.safeStringify(
              assistantData.defaultModel,
            );
            record.promptGenerationModel = LocalAssistant.safeStringify(
              assistantData.promptGenerationModel,
            );
            record.generatingPrompt = assistantData.generatingPrompt;
            record.color = LocalAssistant.safeStringify(assistantData.color);
            record.capabilities = LocalAssistant.safeStringify(
              assistantData.capabilities,
            );
            record.parameters = LocalAssistant.safeStringify(
              assistantData.parameters,
            );
            record.parameterSchema = LocalAssistant.safeStringifyArray(
              assistantData.parameterSchema || [],
            );
            record.source = assistantData.source || 'local';
            record.drshubId = assistantData.drshub_id;
            record.creatorInfo = LocalAssistant.safeStringify(
              assistantData.creator_info,
            );
            record.categories = LocalAssistant.safeStringifyArray(
              assistantData.categories || [],
            );
            record.tags = LocalAssistant.safeStringifyArray(
              assistantData.tags || [],
            );
            record.rating = assistantData.rating;
            record.reviewCount = assistantData.review_count;
            record.protectionLevel = assistantData.protection_level;
            record.priceCents = assistantData.price_cents;
            record.isOwned = assistantData.is_owned;
            // Save generation settings (prefer local over Drshub)
            const generationSettings =
              assistantData.completionSettings ||
              assistantData.rawDrshubGenerationSettings;
            record.generationSettings =
              LocalAssistant.safeStringify(generationSettings);
            record.pact = LocalAssistant.safeStringify(assistantData.pact);
            record.greeting = LocalAssistant.safeStringify(
              assistantData.greeting,
            );
          });
      });

      return newAssistant.toAssistant();
    } catch (error) {
      console.error('Error creating assistant:', error);
      throw error;
    }
  }

  async updateAssistant(
    id: string,
    updates: Partial<Assistant>,
  ): Promise<Assistant | null> {
    try {
      const updatedAssistant = await database.write(async () => {
        const localAssistant = await database.collections
          .get<LocalAssistant>('local_assistants')
          .find(id);

        return await localAssistant.update((record: LocalAssistant) => {
          if (updates.name !== undefined) {
            record.name = updates.name;
          }
          if (updates.description !== undefined) {
            record.description = updates.description;
          }
          if (updates.thumbnail_url !== undefined) {
            record.thumbnailUrl = updates.thumbnail_url;
          }
          if (updates.systemPrompt !== undefined) {
            record.systemPrompt = updates.systemPrompt;
          }
          if (updates.originalSystemPrompt !== undefined) {
            record.originalSystemPrompt = updates.originalSystemPrompt;
          }
          if (updates.isSystemPromptChanged !== undefined) {
            record.isSystemPromptChanged = updates.isSystemPromptChanged;
          }
          if (updates.useAIPrompt !== undefined) {
            record.useAIPrompt = updates.useAIPrompt;
          }
          if (updates.defaultModel !== undefined) {
            record.defaultModel = LocalAssistant.safeStringify(
              updates.defaultModel,
            );
          }
          if (updates.promptGenerationModel !== undefined) {
            record.promptGenerationModel = LocalAssistant.safeStringify(
              updates.promptGenerationModel,
            );
          }
          if (updates.generatingPrompt !== undefined) {
            record.generatingPrompt = updates.generatingPrompt;
          }
          if (updates.color !== undefined) {
            record.color = LocalAssistant.safeStringify(updates.color);
          }
          if (updates.capabilities !== undefined) {
            record.capabilities = LocalAssistant.safeStringify(
              updates.capabilities,
            );
          }
          if (updates.parameters !== undefined) {
            record.parameters = LocalAssistant.safeStringify(
              updates.parameters,
            );
          }
          if (updates.parameterSchema !== undefined) {
            record.parameterSchema = LocalAssistant.safeStringifyArray(
              updates.parameterSchema,
            );
          }
          if (updates.source !== undefined) {
            record.source = updates.source;
          }
          if (updates.drshub_id !== undefined) {
            record.drshubId = updates.drshub_id;
          }
          if (updates.creator_info !== undefined) {
            record.creatorInfo = LocalAssistant.safeStringify(
              updates.creator_info,
            );
          }
          if (updates.categories !== undefined) {
            record.categories = LocalAssistant.safeStringifyArray(
              updates.categories,
            );
          }
          if (updates.tags !== undefined) {
            record.tags = LocalAssistant.safeStringifyArray(updates.tags);
          }
          if (updates.rating !== undefined) {
            record.rating = updates.rating;
          }
          if (updates.review_count !== undefined) {
            record.reviewCount = updates.review_count;
          }
          if (updates.protection_level !== undefined) {
            record.protectionLevel = updates.protection_level;
          }
          if (updates.price_cents !== undefined) {
            record.priceCents = updates.price_cents;
          }
          if (updates.is_owned !== undefined) {
            record.isOwned = updates.is_owned;
          }
          if (
            updates.rawDrshubGenerationSettings !== undefined ||
            updates.completionSettings !== undefined
          ) {
            // Update generation settings (prefer local over Drshub)
            record.generationSettings = LocalAssistant.safeStringify(
              updates.completionSettings || updates.rawDrshubGenerationSettings,
            );
          }
          if (updates.pact !== undefined) {
            record.pact = LocalAssistant.safeStringify(updates.pact);
          }
          if (updates.greeting !== undefined) {
            record.greeting = LocalAssistant.safeStringify(updates.greeting);
          }
        });
      });

      return updatedAssistant.toAssistant();
    } catch (error) {
      console.error('AssistantRepository: Error updating assistant:', error);
      return null;
    }
  }

  async deleteAssistant(id: string): Promise<boolean> {
    try {
      await database.write(async () => {
        const localAssistant = await database.collections
          .get<LocalAssistant>('local_assistants')
          .find(id);

        await localAssistant.destroyPermanently();
      });

      return true;
    } catch (error) {
      console.error('Error deleting assistant:', error);
      return false;
    }
  }

  // Query methods for filtering
  async getLocalAssistants(): Promise<Assistant[]> {
    try {
      const localAssistants = await database.collections
        .get<LocalAssistant>('local_assistants')
        .query(Q.where('source', 'local'))
        .fetch();

      return localAssistants.map(assistant => assistant.toAssistant());
    } catch (error) {
      console.error('Error fetching local assistants:', error);
      return [];
    }
  }

  async getDrshubAssistants(): Promise<Assistant[]> {
    try {
      const drshubAssistants = await database.collections
        .get<LocalAssistant>('local_assistants')
        .query(Q.where('source', 'drshub'))
        .fetch();

      return drshubAssistants.map(assistant => assistant.toAssistant());
    } catch (error) {
      console.error('Error fetching drshub assistants:', error);
      return [];
    }
  }

  async getVideoAssistants(): Promise<Assistant[]> {
    try {
      const allAssistants = await this.getAllAssistants();
      return allAssistants.filter(
        assistant => assistant.capabilities?.video === true,
      );
    } catch (error) {
      console.error('Error fetching video assistants:', error);
      return [];
    }
  }

  /**
   * Reset migration flag to force re-migration (for dev/testing purposes)
   */
  async resetMigration(): Promise<void> {
    try {
      const migrationFlagPath = `${RNFS.DocumentDirectoryPath}/assistant-db-migration-complete.flag`;
      const exists = await RNFS.exists(migrationFlagPath);

      if (exists) {
        await RNFS.unlink(migrationFlagPath);
        logger.debug('Assistant migration flag reset successfully');
      }

      // Also clear all local assistants from database
      await database.write(async () => {
        const allAssistants = await database.collections
          .get<LocalAssistant>('local_assistants')
          .query()
          .fetch();

        for (const assistant of allAssistants) {
          await assistant.destroyPermanently();
        }
      });

      logger.debug('All local assistants cleared from database');
    } catch (error) {
      console.error('Error resetting assistant migration:', error);
      throw error;
    }
  }

  // Get completion settings for a specific assistant
  async getAssistantCompletionSettings(
    assistantId: string,
  ): Promise<CompletionParams | undefined> {
    try {
      const assistant = (await database.collections
        .get('local_assistants')
        .find(assistantId)) as LocalAssistant;

      const settings = assistant.completionSettingsObject;
      if (settings) {
        // Ensure settings are migrated to the latest version
        return migrateCompletionSettings(settings);
      }
      return undefined;
    } catch (error) {
      console.error('Error getting assistant completion settings:', error);
      return undefined;
    }
  }

  // Update completion settings for a specific assistant
  async updateAssistantCompletionSettings(
    assistantId: string,
    settings: CompletionParams,
  ): Promise<void> {
    try {
      await database.write(async () => {
        const assistant = (await database.collections
          .get('local_assistants')
          .find(assistantId)) as LocalAssistant;

        // Ensure settings have a version
        const migratedSettings = migrateCompletionSettings(settings);

        await assistant.update((record: any) => {
          record.generationSettings =
            LocalAssistant.safeStringify(migratedSettings);
        });
      });
    } catch (error) {
      console.error('Error updating assistant completion settings:', error);
      throw error;
    }
  }

  // Clear completion settings for a specific assistant (reset to defaults)
  async clearAssistantCompletionSettings(assistantId: string): Promise<void> {
    try {
      await database.write(async () => {
        const assistant = (await database.collections
          .get('local_assistants')
          .find(assistantId)) as LocalAssistant;

        await assistant.update((record: any) => {
          record.generationSettings = undefined;
        });
      });
    } catch (error) {
      console.error('Error clearing assistant completion settings:', error);
      throw error;
    }
  }
}

export const assistantRepository = new AssistantRepository();
export default AssistantRepository;
