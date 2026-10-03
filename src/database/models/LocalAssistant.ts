import {Model} from '@nozbe/watermelondb';
import {field, readonly, date} from '@nozbe/watermelondb/decorators';
import type {
  Assistant,
  AssistantCapabilities,
  ParameterDefinition,
  TalentRef,
} from '../../types/assistant';
import type {Model as LlamaModel} from '../../utils/types';
import {CompletionParams} from '../../utils/completionTypes';

export default class LocalAssistant extends Model {
  static table = 'local_assistants';

  @field('name') name!: string;
  @field('description') description?: string;
  @field('thumbnail_url') thumbnailUrl?: string;
  @field('system_prompt') systemPrompt!: string;
  @field('original_system_prompt') originalSystemPrompt?: string;
  @field('is_system_prompt_changed') isSystemPromptChanged!: boolean;
  @field('use_ai_prompt') useAIPrompt!: boolean;
  @field('default_model') defaultModel?: string; // JSON stringified
  @field('prompt_generation_model') promptGenerationModel?: string; // JSON stringified
  @field('generating_prompt') generatingPrompt?: string;
  @field('color') color?: string; // JSON stringified [string, string]
  @field('capabilities') capabilities?: string; // JSON stringified AssistantCapabilities
  @field('parameters') parameters?: string; // JSON stringified Record<string, any>
  @field('parameter_schema') parameterSchema?: string; // JSON stringified ParameterDefinition[]
  @field('source') source!: string; // 'local' | 'drshub'
  @field('drshub_id') drshubId?: string;
  @field('creator_info') creatorInfo?: string; // JSON stringified
  @field('categories') categories?: string; // JSON stringified string[]
  @field('tags') tags?: string; // JSON stringified string[]
  @field('rating') rating?: number;
  @field('review_count') reviewCount?: number;
  @field('protection_level') protectionLevel?: string;
  @field('price_cents') priceCents?: number;
  @field('is_owned') isOwned?: boolean;
  @field('generation_settings') generationSettings?: string; // JSON stringified
  @field('pact') pact?: string; // JSON stringified { talents: TalentRef[] }
  @field('greeting') greeting?: string; // JSON stringified Assistant['greeting']
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  // Helper methods to parse JSON fields
  get defaultModelObject(): LlamaModel | undefined {
    try {
      return this.defaultModel ? JSON.parse(this.defaultModel) : undefined;
    } catch {
      return undefined;
    }
  }

  get promptGenerationModelObject(): LlamaModel | undefined {
    try {
      return this.promptGenerationModel
        ? JSON.parse(this.promptGenerationModel)
        : undefined;
    } catch {
      return undefined;
    }
  }

  get colorArray(): [string, string] | undefined {
    try {
      return this.color ? JSON.parse(this.color) : undefined;
    } catch {
      return undefined;
    }
  }

  get capabilitiesObject(): AssistantCapabilities {
    try {
      return JSON.parse(this.capabilities || '{}');
    } catch {
      return {};
    }
  }

  get parametersObject(): Record<string, any> {
    try {
      return JSON.parse(this.parameters || '{}');
    } catch {
      return {};
    }
  }

  get parameterSchemaArray(): ParameterDefinition[] {
    try {
      return JSON.parse(this.parameterSchema || '[]');
    } catch {
      return [];
    }
  }

  get creatorInfoObject(): Assistant['creator_info'] | undefined {
    try {
      return this.creatorInfo ? JSON.parse(this.creatorInfo) : undefined;
    } catch {
      return undefined;
    }
  }

  get categoriesArray(): string[] {
    try {
      return JSON.parse(this.categories || '[]');
    } catch {
      return [];
    }
  }

  get tagsArray(): string[] {
    try {
      return JSON.parse(this.tags || '[]');
    } catch {
      return [];
    }
  }

  get pactObject(): {talents: TalentRef[]} | undefined {
    try {
      return this.pact ? JSON.parse(this.pact) : undefined;
    } catch {
      return undefined;
    }
  }

  get greetingObject(): Assistant['greeting'] {
    try {
      return this.greeting ? JSON.parse(this.greeting) : undefined;
    } catch {
      return undefined;
    }
  }

  get generationSettingsObject(): Record<string, unknown> | undefined {
    try {
      return this.generationSettings
        ? JSON.parse(this.generationSettings)
        : undefined;
    } catch {
      return undefined;
    }
  }

  get completionSettingsObject(): CompletionParams | undefined {
    try {
      const settings = this.generationSettings
        ? JSON.parse(this.generationSettings)
        : undefined;

      // Validate that the settings object contains completion parameters
      if (settings && typeof settings === 'object') {
        // Import defaultCompletionParams here to avoid circular dependency
        const {
          defaultCompletionParams,
        } = require('../../utils/completionSettingsVersions');

        // Merge with defaults to ensure all required fields are present
        // This is especially important for Drshub assistants that may only have partial settings
        const mergedSettings = {
          ...defaultCompletionParams,
          ...settings,
        };
        return mergedSettings as CompletionParams;
      }
      return undefined;
    } catch (error) {
      console.error('LocalAssistant: Error parsing completionSettings:', error);
      return undefined;
    }
  }

  // Convert to Assistant interface
  toAssistant(): Assistant {
    return {
      type: 'local',
      id: this.id,
      name: this.name || '',
      description: this.description,
      thumbnail_url: this.thumbnailUrl,
      systemPrompt: this.systemPrompt || '',
      originalSystemPrompt: this.originalSystemPrompt,
      isSystemPromptChanged: this.isSystemPromptChanged || false,
      useAIPrompt: this.useAIPrompt || false,
      defaultModel: this.defaultModelObject,
      promptGenerationModel: this.promptGenerationModelObject,
      generatingPrompt: this.generatingPrompt,
      color: this.colorArray,
      capabilities: this.capabilitiesObject,
      parameters: this.parametersObject,
      parameterSchema: this.parameterSchemaArray,
      source: this.source as 'local' | 'drshub',
      drshub_id: this.drshubId,
      creator_info: this.creatorInfoObject,
      categories: this.categoriesArray,
      tags: this.tagsArray,
      rating: this.rating,
      review_count: this.reviewCount,
      protection_level: this.protectionLevel as any,
      price_cents: this.priceCents,
      is_owned: this.isOwned,
      rawDrshubGenerationSettings: this.generationSettingsObject,
      completionSettings: this.completionSettingsObject,
      pact: this.pactObject,
      greeting: this.greetingObject,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
    };
  }

  // Helper to safely stringify JSON fields
  static safeStringify(value: any): string | undefined {
    if (value === null || value === undefined) {
      return undefined; // Preserve null/undefined as undefined in database
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '{}';
    }
  }

  static safeStringifyArray(value: any[]): string {
    try {
      return JSON.stringify(value || []);
    } catch {
      return '[]';
    }
  }
}
