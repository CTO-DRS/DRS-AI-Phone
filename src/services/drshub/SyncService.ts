import {Q} from '@nozbe/watermelondb';
import {makeAutoObservable} from 'mobx';

import {database} from '../../database';
import type {EntityType} from '../../database/models/SyncStatus';
import type {
  CachedAssistant,
  UserLibrary,
  SyncStatus,
} from '../../database/models';

import {authService} from './AuthService';
import {drshubService} from './DrshubService';
import {DrshubErrorHandler, RetryHandler} from './ErrorHandler';

import type {DrshubAssistant, SyncState} from '../../types/drshub';
import {logger} from '../../utils/logger';

export interface SyncProgress {
  current: number;
  total: number;
  operation: string;
}

class SyncService {
  isSyncing: boolean = false;
  lastSyncTime: number = 0;
  syncProgress: SyncProgress | null = null;
  syncError: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get syncState(): SyncState {
    if (this.isSyncing) {
      return {status: 'syncing'};
    }
    if (this.syncError) {
      return {status: 'error', error: this.syncError};
    }
    if (this.lastSyncTime > 0) {
      return {status: 'success', lastSync: this.lastSyncTime};
    }
    return {status: 'idle'};
  }

  // Main sync method
  async syncAll(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    try {
      this.isSyncing = true;
      this.syncError = null;
      this.syncProgress = {current: 0, total: 4, operation: 'Starting sync...'};

      // Only sync if user is authenticated
      if (!authService.isAuthenticated) {
        logger.debug('User not authenticated, skipping sync');
        return;
      }

      // Sync categories
      this.syncProgress = {
        current: 1,
        total: 4,
        operation: 'Syncing categories...',
      };
      await this.syncCategories();

      // Sync tags
      this.syncProgress = {current: 2, total: 4, operation: 'Syncing tags...'};
      await this.syncTags();

      // Sync user library
      this.syncProgress = {
        current: 3,
        total: 4,
        operation: 'Syncing library...',
      };
      await this.syncUserLibrary();

      // Sync cached Assistants metadata
      this.syncProgress = {
        current: 4,
        total: 4,
        operation: 'Updating Assistant metadata...',
      };
      await this.syncCachedAssistantsMetadata();

      this.lastSyncTime = Date.now();
      await this.updateSyncStatus('library', 'synced');
    } catch (error) {
      const errorInfo = DrshubErrorHandler.handle(error);
      this.syncError = errorInfo.userMessage;
      await this.updateSyncStatus('library', 'error', errorInfo.message);
      throw error;
    } finally {
      this.isSyncing = false;
      this.syncProgress = null;
    }
  }

  // Sync user's library
  async syncUserLibrary(): Promise<void> {
    if (!authService.user) {
      return;
    }

    try {
      const libraryResponse = await RetryHandler.withRetry(() =>
        drshubService.getLibrary({limit: 20}),
      );

      const userLibraryCollection = database.get<UserLibrary>('user_library');

      await database.write(async () => {
        // Clear existing library entries for this user
        const existingEntries = await userLibraryCollection
          .query(Q.where('user_id', authService.user!.id))
          .fetch();

        for (const entry of existingEntries) {
          await entry.destroyPermanently();
        }

        // Insert new library entries
        for (const assistant of libraryResponse.assistants) {
          await userLibraryCollection.create((entry: UserLibrary) => {
            entry.userId = authService.user!.id;
            entry.drshubId = assistant.id;
            entry.purchasedAt = Date.now(); // Use current time since purchase info not available
            entry.purchaseId = undefined; // Purchase ID not available in processed response
            entry.isDownloaded = false; // Will be updated when Assistant is downloaded
          });
        }
      });

      await this.updateSyncStatus('library', 'synced');
    } catch (error) {
      await this.updateSyncStatus(
        'library',
        'error',
        DrshubErrorHandler.handle(error).message,
      );
      throw error;
    }
  }

  // Sync categories (for filtering)
  async syncCategories(): Promise<void> {
    try {
      const categoriesResponse = await RetryHandler.withRetry(() =>
        drshubService.getCategories(),
      );

      // Store categories in global settings for now
      // In a more complex app, you might want a dedicated categories table
      const globalSettingsCollection = database.get('global_settings');

      await database.write(async () => {
        const categoriesData = JSON.stringify(categoriesResponse.categories);

        // Try to find existing categories setting
        const existingCategories = await globalSettingsCollection
          .query(Q.where('key', 'drshub_categories'))
          .fetch();

        if (existingCategories.length > 0) {
          await existingCategories[0].update((setting: any) => {
            setting.value = categoriesData;
            setting.updatedAt = Date.now();
          });
        } else {
          await globalSettingsCollection.create((setting: any) => {
            setting.key = 'drshub_categories';
            setting.value = categoriesData;
            setting.createdAt = Date.now();
            setting.updatedAt = Date.now();
          });
        }
      });

      await this.updateSyncStatus('categories', 'synced');
    } catch (error) {
      await this.updateSyncStatus(
        'categories',
        'error',
        DrshubErrorHandler.handle(error).message,
      );
      throw error;
    }
  }

  // Sync popular tags
  async syncTags(): Promise<void> {
    try {
      const tagsResponse = await RetryHandler.withRetry(() =>
        drshubService.getTags({limit: 20}),
      );

      const globalSettingsCollection = database.get('global_settings');

      await database.write(async () => {
        const tagsData = JSON.stringify(tagsResponse.tags);

        const existingTags = await globalSettingsCollection
          .query(Q.where('key', 'drshub_tags'))
          .fetch();

        if (existingTags.length > 0) {
          await existingTags[0].update((setting: any) => {
            setting.value = tagsData;
            setting.updatedAt = Date.now();
          });
        } else {
          await globalSettingsCollection.create((setting: any) => {
            setting.key = 'drshub_tags';
            setting.value = tagsData;
            setting.createdAt = Date.now();
            setting.updatedAt = Date.now();
          });
        }
      });

      await this.updateSyncStatus('tags', 'synced');
    } catch (error) {
      await this.updateSyncStatus(
        'tags',
        'error',
        DrshubErrorHandler.handle(error).message,
      );
      throw error;
    }
  }

  // Update metadata for cached Assistants
  async syncCachedAssistantsMetadata(): Promise<void> {
    try {
      const cachedAssistantsCollection =
        database.get<CachedAssistant>('cached_assistants');
      const cachedAssistants = await cachedAssistantsCollection.query().fetch();

      for (const cachedAssistant of cachedAssistants) {
        try {
          const updatedAssistant = await drshubService.getAssistant(
            cachedAssistant.drshubId,
          );

          await database.write(async () => {
            await cachedAssistant.update((assistant: CachedAssistant) => {
              assistant.title = updatedAssistant.title;
              assistant.description = updatedAssistant.description;
              assistant.thumbnailUrl = updatedAssistant.thumbnail_url;
              assistant.averageRating = updatedAssistant.average_rating;
              assistant.reviewCount = updatedAssistant.review_count || 0;
              assistant.cachedAt = Date.now();
            });
          });
        } catch (error) {
          // Log error but continue with other Assistants
          console.warn(
            `Failed to update cached Assistant ${cachedAssistant.drshubId}:`,
            error,
          );
        }
      }

      await this.updateSyncStatus('assistant', 'synced');
    } catch (error) {
      await this.updateSyncStatus(
        'assistant',
        'error',
        DrshubErrorHandler.handle(error).message,
      );
      throw error;
    }
  }

  // Cache a Assistant for offline browsing
  async cacheAssistant(assistant: DrshubAssistant): Promise<void> {
    const cachedAssistantsCollection =
      database.get<CachedAssistant>('cached_assistants');

    await database.write(async () => {
      // Check if already cached
      const existing = await cachedAssistantsCollection
        .query(Q.where('drshub_id', assistant.id))
        .fetch();

      if (existing.length > 0) {
        // Update existing
        await existing[0].update((cachedAssistant: CachedAssistant) => {
          this.updateCachedAssistantFromDrshubAssistant(
            cachedAssistant,
            assistant,
          );
        });
      } else {
        // Create new
        await cachedAssistantsCollection.create(
          (cachedAssistant: CachedAssistant) => {
            this.updateCachedAssistantFromDrshubAssistant(
              cachedAssistant,
              assistant,
            );
          },
        );
      }
    });
  }

  private updateCachedAssistantFromDrshubAssistant(
    cachedAssistant: CachedAssistant,
    assistant: DrshubAssistant,
  ): void {
    cachedAssistant.drshubId = assistant.id;
    cachedAssistant.title = assistant.title;
    cachedAssistant.description = assistant.description;
    cachedAssistant.thumbnailUrl = assistant.thumbnail_url;
    cachedAssistant.creatorId = assistant.creator_id;
    cachedAssistant.creatorName = assistant.creator?.display_name;
    cachedAssistant.creatorAvatarUrl = assistant.creator?.avatar_url;
    cachedAssistant.protectionLevel = assistant.protection_level;
    cachedAssistant.priceCents = assistant.price_cents;
    cachedAssistant.allowFork = assistant.allow_fork;
    cachedAssistant.averageRating = assistant.average_rating;
    cachedAssistant.reviewCount = assistant.review_count || 0;
    cachedAssistant.isOwned = assistant.is_owned || false;
    cachedAssistant.categories = JSON.stringify(
      assistant.categories?.map(c => c.name) || [],
    );
    cachedAssistant.tags = JSON.stringify(
      assistant.tags?.map(t => t.name) || [],
    );
    cachedAssistant.systemPrompt = assistant.system_prompt;
    cachedAssistant.modelSettings = JSON.stringify(
      assistant.model_settings || {},
    );
    cachedAssistant.cachedAt = Date.now();
  }

  // Update sync status in database
  private async updateSyncStatus(
    entityType: EntityType,
    status: 'synced' | 'pending' | 'error',
    errorMessage?: string,
  ): Promise<void> {
    const syncStatusCollection = database.get<SyncStatus>('sync_status');

    await database.write(async () => {
      const existing = await syncStatusCollection
        .query(Q.where('entity_type', entityType))
        .fetch();

      if (existing.length > 0) {
        await existing[0].update((syncStatus: SyncStatus) => {
          syncStatus.status = status;
          syncStatus.lastSync = Date.now();
          syncStatus.errorMessage = errorMessage;
        });
      } else {
        await syncStatusCollection.create((syncStatus: SyncStatus) => {
          syncStatus.entityType = entityType;
          syncStatus.status = status;
          syncStatus.lastSync = Date.now();
          syncStatus.errorMessage = errorMessage;
        });
      }
    });
  }

  // Check if sync is needed
  async needsSync(): Promise<boolean> {
    if (!authService.isAuthenticated) {
      return false;
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return this.lastSyncTime < fiveMinutesAgo;
  }

  // Clear all cached data
  async clearCache(): Promise<void> {
    await database.write(async () => {
      const cachedAssistantsCollection =
        database.get<CachedAssistant>('cached_assistants');
      const userLibraryCollection = database.get<UserLibrary>('user_library');
      const syncStatusCollection = database.get<SyncStatus>('sync_status');

      const allCachedAssistants = await cachedAssistantsCollection
        .query()
        .fetch();
      const allUserLibrary = await userLibraryCollection.query().fetch();
      const allSyncStatus = await syncStatusCollection.query().fetch();

      for (const item of [
        ...allCachedAssistants,
        ...allUserLibrary,
        ...allSyncStatus,
      ]) {
        await item.destroyPermanently();
      }
    });

    this.lastSyncTime = 0;
    this.syncError = null;
  }
}

export const syncService = new SyncService();
