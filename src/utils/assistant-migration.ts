import {v4 as uuidv4} from 'uuid';
import type {Assistant, LegacyAssistantType} from '../types/assistant';
import {createCapabilitiesFromLegacyType} from './assistant-capabilities';
import {ROLEPLAY_SCHEMA, ASSISTANT_SCHEMA, VIDEO_SCHEMA} from '../types/assistant';
import {Model} from './types';

// Migration-specific types (moved from AssistantsSheets/types.ts)
export enum AssistantType {
  ROLEPLAY = 'roleplay',
  ASSISTANT = 'assistant',
  VIDEO = 'video',
}

// Base type for common fields
interface BaseFormData {
  id?: string;
  name: string;
  defaultModel?: Model;
  useAIPrompt: boolean;
  systemPrompt: string;
  originalSystemPrompt?: string;
  isSystemPromptChanged: boolean;
  color?: [string, string];
  promptGenerationModel?: Model;
  generatingPrompt?: string;
}

// Assistant-specific type
export interface AssistantFormData extends BaseFormData {
  assistantType: AssistantType.ASSISTANT;
}

// Roleplay-specific type
export interface RoleplayFormData extends BaseFormData {
  assistantType: AssistantType.ROLEPLAY;
  world: string;
  location: string;
  aiRole: string;
  userRole: string;
  situation: string;
  toneStyle: string;
}

// Video-specific type
export interface VideoAssistantFormData extends BaseFormData {
  assistantType: AssistantType.VIDEO;
  captureInterval: number; // Interval in milliseconds between frame captures
}

// Type for legacy assistant data
export type LegacyAssistantData =
  | AssistantFormData
  | RoleplayFormData
  | VideoAssistantFormData;

/**
 * Migrates a legacy assistant to the new format
 */
export function migrateLegacyAssistantToNew(legacyAssistant: LegacyAssistantData): Assistant {
  const baseAssistant: Omit<Assistant, 'parameters' | 'parameterSchema'> = {
    type: 'local',
    id: legacyAssistant.id || uuidv4(),
    name: legacyAssistant.name,
    systemPrompt: legacyAssistant.systemPrompt,
    originalSystemPrompt: legacyAssistant.originalSystemPrompt,
    isSystemPromptChanged: legacyAssistant.isSystemPromptChanged,
    useAIPrompt: legacyAssistant.useAIPrompt,
    defaultModel: legacyAssistant.defaultModel,
    promptGenerationModel: legacyAssistant.promptGenerationModel,
    generatingPrompt: legacyAssistant.generatingPrompt,
    color: legacyAssistant.color,
    capabilities: createCapabilitiesFromLegacyType(legacyAssistant.assistantType),
    source: 'local',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  switch (legacyAssistant.assistantType) {
    case 'roleplay':
      return {
        ...baseAssistant,
        parameters: {
          world: legacyAssistant.world,
          location: legacyAssistant.location,
          aiRole: legacyAssistant.aiRole,
          userRole: legacyAssistant.userRole,
          situation: legacyAssistant.situation,
          toneStyle: legacyAssistant.toneStyle,
        },
        parameterSchema: ROLEPLAY_SCHEMA,
      };

    case 'assistant':
      return {
        ...baseAssistant,
        parameters: {},
        parameterSchema: ASSISTANT_SCHEMA,
      };

    case 'video':
      return {
        ...baseAssistant,
        parameters: {
          captureInterval: legacyAssistant.captureInterval?.toString() || '3000',
        },
        parameterSchema: VIDEO_SCHEMA,
      };

    default:
      // Fallback for unknown types
      return {
        ...baseAssistant,
        parameters: {},
        parameterSchema: [],
      };
  }
}

/**
 * Detects the legacy assistant type from a assistant using capabilities and schema
 * Clean detection without parameter inference
 */
export function detectLegacyAssistantType(assistant: Assistant): LegacyAssistantType {
  // First check capabilities (most reliable)
  if (assistant.capabilities?.video === true) {
    return 'video';
  }

  // Then check if schema matches known legacy schemas
  if (schemasEqual(assistant.parameterSchema, ROLEPLAY_SCHEMA)) {
    return 'roleplay';
  }
  if (schemasEqual(assistant.parameterSchema, VIDEO_SCHEMA)) {
    return 'video';
  }
  if (schemasEqual(assistant.parameterSchema, ASSISTANT_SCHEMA)) {
    return 'assistant';
  }

  // Check categories if available
  if (assistant.categories?.some(cat => cat.toLowerCase().includes('roleplay'))) {
    return 'roleplay';
  }
  if (assistant.categories?.some(cat => cat.toLowerCase().includes('video'))) {
    return 'video';
  }

  // Default to assistant
  return 'assistant';
}

/**
 * Get legacy assistant type for UI components (backward compatibility)
 * This is only used for determining which UI template to show
 */
export function getLegacyAssistantTypeForUI(assistant: Assistant): LegacyAssistantType {
  return detectLegacyAssistantType(assistant);
}

/**
 * Helper function to compare parameter schemas
 */
function schemasEqual(schema1: any[], schema2: any[]): boolean {
  if (schema1.length !== schema2.length) {
    return false;
  }

  return schema1.every((param1, index) => {
    const param2 = schema2[index];
    return param1.key === param2.key && param1.type === param2.type;
  });
}
