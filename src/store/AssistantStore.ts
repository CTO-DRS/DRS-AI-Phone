/**
 * AssistantStore - Dynamic Parameter Assistant Store
 *
 * This is the new assistant store that replaces the legacy AssistantStore with a flexible,
 * schema-driven approach that supports dynamic parameters and custom assistant types.
 *
 * KEY FEATURES:
 * - Dynamic parameter schemas: Create assistants with any custom parameters
 * - Unified UI: Single AssistantSheet component works for all assistant types
 * - Drshub integration: Support for marketplace assistants with custom parameters
 * - Extensible: Easy to add new parameter types (text, select, datetime_tag)
 * - Migration: Automatically migrates data from legacy AssistantStore on startup
 *
 * @see src/types/assistant.ts for type definitions
 * @see src/utils/assistant-migration.ts for migration utilities
 * @see src/components/AssistantSheets/AssistantSheet.tsx for unified UI component
 */

import {v4 as uuidv4} from 'uuid';
import {makeAutoObservable, runInAction} from 'mobx';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {HF_DOMAIN} from '../config/urls';

import {assistantRepository} from '../repositories/AssistantRepository';

import {hfAsModel} from '../utils';
import {resolveHFModelForDownload} from '../utils/hfResolve';
import {isUSStorefront} from '../utils/region';
import NativeExternalContentLink from '../specs/NativeExternalContentLink';
import {drshubService} from '../services';
import {registerDefaultTalents} from '../services/talents';
import {LOOKIE_DEFAULT_MODEL} from './builtinAssistantModels';
import {chatTemplates} from '../utils/chat';
import {defaultCompletionParams} from '../utils/completionSettingsVersions';
import {parseDrshubTemplate} from '../utils/drshub-template-parser';
import {getDisplayNameFromFilename} from '../utils/formatters';

import type {Assistant, ParameterDefinition} from '../types/assistant';
import type {
  ModelReference,
  DrshubAssistant,
  SearchFilters,
  SyncState,
} from '../types/drshub';

import {ModelOrigin} from '../utils/types';
import type {Model} from '../utils/types';
import {
  downloadAssistantThumbnail,
  deleteAssistantThumbnail,
} from '../utils/imageUtils';

// Track each built-in separately so future defaults can still be introduced.
// TODO: when adding another built-in assistant, extract a shared seed-once helper
// (check key, find existing, create, set key) instead of a third copy.
const LOOKIE_SEEDED_KEY = 'AssistantStore.builtin.Lookie.seeded';
const PIP_SEEDED_KEY = 'AssistantStore.builtin.Pip.seeded';

class AssistantStore {
  // Core assistants storage
  assistants: Assistant[] = [];

  // Drshub integration state
  cachedDrshubAssistants: DrshubAssistant[] = [];
  userLibrary: DrshubAssistant[] = [];
  userCreatedAssistants: DrshubAssistant[] = [];
  isLoadingDrshub: boolean = false;
  searchFilters: SearchFilters = {};
  syncState: SyncState = {status: 'idle'};

  // Checkout eligibility state
  isCheckoutEligible: boolean = false;

  // Migration state
  isMigrating: boolean = false;
  migrationComplete: boolean = false;
  migrationVersion: string = '1.0';

  constructor() {
    makeAutoObservable(this);
    this.initialize();
    console.log('Assistant store initialized');
    console.log('Assistants number: ', this.assistants.length);
  }

  async initialize() {
    try {
      runInAction(() => {
        this.isMigrating = true;
      });

      // Migrate from JSON/AsyncStorage to database
      await assistantRepository.checkAndMigrateFromJSON();

      // Load assistants from database
      await this.loadAssistantsFromDatabase();

      // Initialize Lookie assistant after database is loaded
      await this.initializeLookieAssistant();

      // Initialize Pip assistant (idempotent — see initializePipAssistant).
      await this.initializePipAssistant();

      // Register talent engines (idempotent)
      registerDefaultTalents();

      // Check checkout eligibility for buy button gating
      this.checkCheckoutEligibility();

      console.log('Assistant store initialization completed');

      runInAction(() => {
        this.isMigrating = false;
        this.migrationComplete = true;
      });
    } catch (error) {
      console.error('Failed to initialize assistant store:', error);
      runInAction(() => {
        this.isMigrating = false;
        this.migrationComplete = false;
      });
    }
  }

  private async checkCheckoutEligibility() {
    // E2E builds have no App Store storefront, so force eligibility to
    // exercise the buy button. Compiled out of prod (`__E2E__` is false).
    if (__E2E__) {
      runInAction(() => {
        this.isCheckoutEligible = true;
      });
      return;
    }

    try {
      // Gate on real purchase eligibility per platform, not device locale:
      // Android queries Play EXTERNAL_CONTENT_LINK availability; iOS keeps the
      // StoreKit storefront signal. A null Android module or a thrown probe
      // leaves the flag false (fail-closed → info-text fallback).
      const eligible =
        Platform.OS === 'android'
          ? await NativeExternalContentLink?.isExternalContentLinkAvailable()
          : await isUSStorefront();
      runInAction(() => {
        this.isCheckoutEligible = eligible === true;
      });
    } catch (error) {
      console.warn('Failed to check checkout eligibility:', error);
      runInAction(() => {
        this.isCheckoutEligible = false;
      });
    }
  }

  /**
   * Load assistants from database into MobX store
   */
  private async loadAssistantsFromDatabase() {
    try {
      const assistants = await assistantRepository.getAllAssistants();
      runInAction(() => {
        this.assistants = assistants;
      });
    } catch (error) {
      console.error('Error loading assistants from database:', error);
    }
  }

  // Core unified assistant management methods

  /**
   * Adds a assistant to both repository and store (handles persistence + state)
   * This is the ONLY method that should handle repository + store updates
   */
  private addAssistant = async (
    assistantData: Omit<Assistant, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Assistant> => {
    const savedAssistant =
      await assistantRepository.createAssistant(assistantData);

    runInAction(() => {
      this.assistants.push(savedAssistant);
    });

    return savedAssistant;
  };

  /**
   * Creates a new assistant
   */
  createAssistant = async (
    assistantData: Omit<Assistant, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Assistant> => {
    return this.addAssistant(assistantData);
  };

  /**
   * Updates an existing assistant
   */
  updateAssistant = async (
    id: string,
    updates: Partial<Assistant>,
  ): Promise<void> => {
    try {
      const updatedAssistant = await assistantRepository.updateAssistant(
        id,
        updates,
      );
      if (updatedAssistant) {
        runInAction(() => {
          const assistantIndex = this.assistants.findIndex(p => p.id === id);
          if (assistantIndex !== -1) {
            this.assistants[assistantIndex] = updatedAssistant;
          }
        });
      } else {
        throw new Error(
          'Failed to update assistant - no updated assistant returned',
        );
      }
    } catch (error) {
      console.error('Error updating assistant:', error);
      throw error; // Re-throw so calling code can handle it
    }
  };

  /**
   * Deletes a assistant
   */
  deleteAssistant = async (id: string): Promise<void> => {
    try {
      // Find the assistant to get its thumbnail path before deletion
      const assistantIndex = this.assistants.findIndex(p => p.id === id);
      const assistant =
        assistantIndex !== -1 ? this.assistants[assistantIndex] : null;

      const success = await assistantRepository.deleteAssistant(id);
      if (success) {
        // Clean up local thumbnail image if it exists
        if (assistant?.thumbnail_url) {
          try {
            await deleteAssistantThumbnail(assistant.thumbnail_url);
          } catch (imageError) {
            console.warn('Failed to delete thumbnail image:', imageError);
            // Don't fail the entire deletion if image cleanup fails
          }
        }

        runInAction(() => {
          if (assistantIndex !== -1) {
            this.assistants.splice(assistantIndex, 1);
          }
        });
      }
    } catch (error) {
      console.error('Error deleting assistant:', error);
    }
  };

  /**
   * Gets all assistants
   */
  getAssistants = (): Assistant[] => {
    return this.assistants;
  };

  /**
   * Gets a assistant by ID
   */
  getAssistantById = (id: string): Assistant | undefined => {
    return this.assistants.find(p => p.id === id);
  };

  // Drshub integration methods

  /**
   * Downloads a Drshub assistant and converts it to unified format
   */
  downloadDrshubAssistant = async (
    drshubAssistant: DrshubAssistant,
  ): Promise<Assistant> => {
    try {
      // For free assistants, allow direct download without ownership check
      // For premium assistants, check ownership first
      if (drshubAssistant.price_cents > 0) {
        const ownership = await drshubService.checkAssistantOwnership(
          drshubAssistant.id,
        );
        if (!ownership.owned) {
          throw new Error('You must own this Assistant to download it');
        }
      }

      // Convert Drshub assistant to local format
      const assistant =
        await this.createLocalAssistantFromDrshub(drshubAssistant);
      let relativeThumbnailPath: string | null = null;

      // Download thumbnail image if available
      if (drshubAssistant.thumbnail_url) {
        try {
          console.log('Downloading thumbnail for assistant:', assistant.name);
          relativeThumbnailPath = await downloadAssistantThumbnail(
            assistant.id,
            drshubAssistant.thumbnail_url,
          );

          // Update the assistant with the relative path (no file:// protocol)
          assistant.thumbnail_url = relativeThumbnailPath;
          console.log(
            'Thumbnail downloaded successfully:',
            relativeThumbnailPath,
          );
        } catch (imageError) {
          console.warn(
            'Failed to download thumbnail, keeping remote URL:',
            imageError,
          );
          // Keep the original remote URL as fallback
          assistant.thumbnail_url = drshubAssistant.thumbnail_url;
        }
      }

      try {
        // Persist the assistant to the database and add to store
        return await this.addAssistant(assistant);
      } catch (dbError) {
        // If database save fails, clean up the downloaded image
        if (relativeThumbnailPath) {
          try {
            await deleteAssistantThumbnail(relativeThumbnailPath);
            console.log(
              'Cleaned up thumbnail after database error:',
              relativeThumbnailPath,
            );
          } catch (cleanupError) {
            console.warn(
              'Failed to cleanup thumbnail after database error:',
              cleanupError,
            );
          }
        }
        throw dbError;
      }
    } catch (error) {
      throw error;
    }
  };

  /**
   * Creates a Model object from Drshub ModelReference with complete HF metadata
   */
  private createLocalModelFromPHModel = async (
    modelRef: ModelReference,
  ): Promise<Model> => {
    try {
      // Resolve via the shared canonical chain so the matched file carries a
      // populated /resolve/ download URL. modelRef values relax strictness when
      // the HF API response is incomplete (the Drshub flow already has them).
      const {hfModel, modelFile} = await resolveHFModelForDownload(
        modelRef.repo_id,
        modelRef.filename,
        undefined,
        {
          author: modelRef.author,
          size: modelRef.size,
          downloadUrl: modelRef.downloadUrl,
        },
      );

      // Use the existing hfAsModel function to create a complete Model object
      return hfAsModel(hfModel, modelFile);
    } catch (error) {
      console.error('Failed to fetch complete model data from HF API:', error);

      // Fallback: create basic model with available data
      return this.createBasicModelFromReference(modelRef);
    }
  };

  /**
   * Creates a basic Model object from ModelReference (fallback when HF API fails)
   */
  private createBasicModelFromReference = (modelRef: any): Model => {
    // Extract model name from filename (remove .gguf extension)
    const modelName = getDisplayNameFromFilename(modelRef.filename);

    // Degraded fallback path: use the generic default chat template and
    // completion params (the GGUF-embedded template is applied at load time).
    const chatTemplate = {...chatTemplates.default};
    const completionSettings = {...defaultCompletionParams};
    const stopWords = completionSettings.stop ?? [];

    return {
      id: `${modelRef.repo_id}/${modelRef.filename}`,
      author: modelRef.author,
      name: modelName,
      size: modelRef.size,
      params: 0, // Will be fetched from HF API if needed
      isDownloaded: false,
      downloadUrl: modelRef.downloadUrl,
      hfUrl: `${HF_DOMAIN}/${modelRef.repo_id}`,
      progress: 0,
      filename: modelRef.filename,
      isLocal: false,
      origin: ModelOrigin.HF,
      defaultChatTemplate: {...chatTemplate},
      chatTemplate: {...chatTemplate},
      defaultCompletionSettings: {...completionSettings},
      completionSettings: {...completionSettings},
      defaultStopWords: [...stopWords],
      stopWords: [...stopWords],
    };
  };

  /**
   * Converts a Drshub assistant to local assistant format
   */
  private createLocalAssistantFromDrshub = async (
    drshubAssistant: DrshubAssistant,
  ): Promise<Assistant> => {
    let parameterSchema: ParameterDefinition[] = [];
    let parameters: Record<string, any> = {};
    let systemPrompt = drshubAssistant.system_prompt || '';

    // Parse system_prompt to extract parameter schema and default values
    // Parameters are embedded within the system_prompt field using Mustache templating
    // with JSON schema comments
    let originalSystemPrompt: string | undefined;
    if (systemPrompt && this.isTemplatedSystemPrompt(systemPrompt)) {
      // Parse the templated system prompt
      const parsed = parseDrshubTemplate(systemPrompt);
      // CRITICAL: Preserve the original template for future editing
      originalSystemPrompt = systemPrompt;
      // Use the clean template with placeholders for the systemPrompt field
      systemPrompt = parsed.cleanSystemPrompt;
      parameterSchema = parsed.parameterSchema;
      parameters = parsed.defaultParameters;
    }
    // If no template found, use empty schema/parameters (assistant-style assistant)

    // Convert Drshub model_reference to Model object if available
    const defaultModel = drshubAssistant.model_reference
      ? await this.createLocalModelFromPHModel(drshubAssistant.model_reference)
      : undefined;

    // Strict-`=== true` so stringly-typed `required` becomes optional.
    // Drop talents that aren't objects with a non-empty string name.
    const wireTalents = drshubAssistant.pact?.talents;
    const validTalents = Array.isArray(wireTalents)
      ? wireTalents.filter(
          t =>
            t != null &&
            typeof t === 'object' &&
            typeof t.name === 'string' &&
            t.name.length > 0,
        )
      : [];
    const pact =
      validTalents.length > 0
        ? {
            talents: validTalents.map(t => ({
              name: t.name,
              necessity: (t.required === true ? 'required' : 'optional') as
                | 'required'
                | 'optional',
            })),
          }
        : undefined;

    const wireGreeting = drshubAssistant.greeting;
    const wireText = wireGreeting?.text;
    const wirePrompts = wireGreeting?.suggested_prompts;
    const validPrompts = Array.isArray(wirePrompts)
      ? wirePrompts.filter(
          (p): p is string => typeof p === 'string' && p.length > 0,
        )
      : [];
    const hasText = typeof wireText === 'string' && wireText.length > 0;
    const hasPrompts = validPrompts.length > 0;
    const greeting =
      hasText || hasPrompts
        ? {
            text: typeof wireText === 'string' ? wireText : '',
            ...(hasPrompts ? {suggestedPrompts: validPrompts} : {}),
          }
        : undefined;

    return {
      type: 'local',
      id: uuidv4(),
      name: drshubAssistant.title,
      description: drshubAssistant.description,
      thumbnail_url: drshubAssistant.thumbnail_url,
      systemPrompt,
      originalSystemPrompt, // Preserve the original template for editing
      isSystemPromptChanged: false,
      useAIPrompt: false,
      defaultModel,
      parameters,
      parameterSchema,
      ...(pact ? {pact} : {}),
      ...(greeting ? {greeting} : {}),
      source: 'drshub',
      drshub_id: drshubAssistant.id,
      creator_info: {
        id: drshubAssistant.creator_id,
        name: drshubAssistant.creator?.display_name,
        avatar_url: drshubAssistant.creator?.avatar_url,
      },
      categories: drshubAssistant.categories?.map((c: any) => c.name) || [],
      tags: drshubAssistant.tags?.map((t: any) => t.name) || [],
      rating: drshubAssistant.average_rating,
      review_count: drshubAssistant.review_count,
      protection_level: drshubAssistant.protection_level,
      price_cents: drshubAssistant.price_cents,
      is_owned: true,
      rawDrshubGenerationSettings: drshubAssistant.model_settings,
      created_at: drshubAssistant.created_at,
      updated_at: drshubAssistant.updated_at,
    };
  };

  /**
   * Checks if a system prompt contains parameter template definitions
   * Parameters are embedded within the system_prompt field using Mustache templating
   * with JSON schema comments
   */
  private isTemplatedSystemPrompt = (systemPrompt: string): boolean => {
    // Check for Mustache JSON schema pattern
    const mustacheSchemaPattern =
      /\{\{!\s*json-schema-start\s*[\s\S]*?\s*json-schema-end\s*\}\}/;

    return mustacheSchemaPattern.test(systemPrompt);
  };

  // Drshub methods
  searchDrshubAssistants = async (filters: any = {}) => {
    try {
      runInAction(() => {
        this.isLoadingDrshub = true;
        this.syncState = {status: 'syncing'};
      });

      const response = await drshubService.getAssistants(filters);

      runInAction(() => {
        this.cachedDrshubAssistants = response.assistants;
        this.isLoadingDrshub = false;
        this.syncState = {status: 'success'};
      });

      return response;
    } catch (error) {
      console.warn(
        'Drshub search failed (this is expected if not configured):',
        error,
      );
      runInAction(() => {
        this.cachedDrshubAssistants = []; // Set empty array instead of failing
        this.isLoadingDrshub = false;
        this.syncState = {status: 'success'}; // Don't show error state for missing config
      });

      // Return empty response instead of throwing
      return {
        assistants: [],
        total_count: 0,
        page: 1,
        limit: filters.limit || 20,
        has_more: false,
      };
    }
  };

  loadUserLibrary = async () => {
    try {
      runInAction(() => {
        this.isLoadingDrshub = true;
        this.syncState = {status: 'syncing'};
      });

      const response = await drshubService.getLibrary();

      runInAction(() => {
        this.userLibrary = response.assistants;
        this.isLoadingDrshub = false;
        this.syncState = {status: 'success'};
      });

      return response;
    } catch (error) {
      console.warn(
        'User library load failed (this is expected if not configured):',
        error,
      );
      runInAction(() => {
        this.userLibrary = []; // Set empty array instead of failing
        this.isLoadingDrshub = false;
        this.syncState = {status: 'success'}; // Don't show error state for missing config
      });

      // Return empty response instead of throwing
      return {
        assistants: [],
        total_count: 0,
        page: 1,
        limit: 20,
        has_more: false,
      };
    }
  };

  loadUserCreatedAssistants = async () => {
    try {
      runInAction(() => {
        this.isLoadingDrshub = true;
        this.syncState = {status: 'syncing'};
      });

      const response = await drshubService.getMyAssistants();

      runInAction(() => {
        this.userCreatedAssistants = response.assistants;
        this.isLoadingDrshub = false;
        this.syncState = {status: 'success'};
      });

      return response;
    } catch (error) {
      console.warn(
        'User created assistants load failed (this is expected if not configured):',
        error,
      );
      runInAction(() => {
        this.userCreatedAssistants = []; // Set empty array instead of failing
        this.isLoadingDrshub = false;
        this.syncState = {status: 'success'}; // Don't show error state for missing config
      });

      // Return empty response instead of throwing
      return {
        assistants: [],
        total_count: 0,
        page: 1,
        limit: 20,
        has_more: false,
      };
    }
  };

  getLocalAssistants = () => {
    return this.assistants.filter(
      assistant => assistant.source === 'local' || !assistant.source,
    );
  };

  getDownloadedDrshubAssistants = () => {
    return this.assistants.filter(assistant => assistant.source === 'drshub');
  };

  // Capability-based filtering methods
  getVideoAssistants = () => {
    return this.assistants.filter(
      assistant => assistant.capabilities?.video === true,
    );
  };

  getAllAssistants = () => {
    return this.assistants;
  };

  isDrshubAssistantDownloaded = (drshubId: string) => {
    return this.assistants.some(assistant => assistant.drshub_id === drshubId);
  };

  // Additional helper methods for Drshub integration

  /**
   * Get categories from Drshub
   */
  getCategories = async () => {
    try {
      return await drshubService.getCategories();
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      throw error;
    }
  };

  /**
   * Get tags from Drshub
   */
  getTags = async (query?: any) => {
    try {
      return await drshubService.getTags(query);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
      throw error;
    }
  };

  /**
   * Get a specific assistant from Drshub
   */
  getDrshubAssistant = async (id: string) => {
    try {
      return await drshubService.getAssistant(id);
    } catch (error) {
      console.error('Failed to fetch assistant:', error);
      throw error;
    }
  };

  /**
   * Check if user owns a specific assistant
   */
  checkAssistantOwnership = async (assistantId: string) => {
    try {
      return await drshubService.checkAssistantOwnership(assistantId);
    } catch (error) {
      console.error('Failed to check assistant ownership:', error);
      throw error;
    }
  };

  /**
   * Seed the default "Lookie" VideoAssistant once. After the first launch that
   * records the seed, deletions and renames are preserved; on that launch a
   * missing Lookie is created (installs that predate the key included).
   */
  private async initializeLookieAssistant(): Promise<void> {
    try {
      if ((await AsyncStorage.getItem(LOOKIE_SEEDED_KEY)) === 'true') {
        return;
      }

      // Check if Lookie already exists
      const lookieAssistant = this.assistants.find(
        p => p.capabilities?.video === true && p.name === 'Lookie',
      );

      if (!lookieAssistant) {
        console.log('Creating default Lookie assistant...');

        // Offline constant — no network resolve at assistant init.
        const defaultModel = LOOKIE_DEFAULT_MODEL;

        // Create the Lookie assistant with all the original properties
        const assistantData: Omit<
          Assistant,
          'id' | 'created_at' | 'updated_at'
        > = {
          type: 'local',
          name: 'Lookie',
          description:
            'Real-time video analysis assistant that provides concise descriptions of your camera feed.',
          systemPrompt:
            'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
          isSystemPromptChanged: false,
          useAIPrompt: false,
          defaultModel: defaultModel, // Set the default model so users know what to download
          parameters: {
            captureInterval: '3000', // 3 seconds (original value) - stored as string for text input
          },
          parameterSchema: [
            {
              key: 'captureInterval',
              type: 'text',
              label: 'Capture Interval (ms)',
              required: false,
            },
          ],
          capabilities: {video: true},
          color: ['#9E204F', '#F6E1EA'], // Original Lookie colors
          source: 'local',
        };

        await this.addAssistant(assistantData);
      } else {
        console.log('Lookie assistant already exists, skipping creation');
      }
      await AsyncStorage.setItem(LOOKIE_SEEDED_KEY, 'true');
    } catch (error) {
      console.error('Error initializing Lookie assistant:', error);
    }
  }

  /**
   * Seed the default "Pip" recommended assistant once. After the first launch that
   * records the seed, deletions and renames are preserved; on that launch a
   * missing Pip is created (installs that predate the key included).
   *
   * Idempotent: a re-entry never overwrites an existing Pip record, so a
   * `defaultModel` bound from a prior session (e.g. by the onboarding
   * recommended-assistant picker) survives subsequent app starts.
   */
  private async initializePipAssistant(): Promise<void> {
    try {
      if ((await AsyncStorage.getItem(PIP_SEEDED_KEY)) === 'true') {
        return;
      }

      const existing = this.assistants.find(
        p => p.name === 'Pip' && p.source === 'local',
      );
      if (existing) {
        await AsyncStorage.setItem(PIP_SEEDED_KEY, 'true');
        return;
      }

      const assistantData: Omit<Assistant, 'id' | 'created_at' | 'updated_at'> =
        {
          type: 'local',
          name: 'Pip',
          description:
            'A friendly general-purpose assistant that runs entirely on your phone.',
          systemPrompt:
            'You are Pip, a friendly and helpful assistant who runs locally on the user’s phone. Keep replies concise and warm.',
          isSystemPromptChanged: false,
          useAIPrompt: false,
          defaultModel: undefined,
          parameters: {},
          parameterSchema: [],
          capabilities: {},
          color: ['#0E0D0C', '#FAFAFA'],
          source: 'local',
        };

      await this.addAssistant(assistantData);
      await AsyncStorage.setItem(PIP_SEEDED_KEY, 'true');
    } catch (error) {
      console.error('Error initializing Pip assistant:', error);
    }
  }
}

export const assistantStore = new AssistantStore();

// Export types for external use
export type {Assistant} from '../types/assistant';
export type {LegacyAssistantData} from '../utils/assistant-migration';
