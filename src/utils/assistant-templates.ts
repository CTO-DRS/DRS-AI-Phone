import type {Assistant} from '../types/assistant';
import {
  ASSISTANT_SCHEMA,
  ROLEPLAY_SCHEMA,
  VIDEO_SCHEMA,
  ROLEPLAY_DEFAULT_TEMPLATE,
} from '../types/assistant';

/**
 * Factory functions for creating new assistant objects with appropriate defaults.
 * These functions provide pre-configured assistant objects that can be passed to LegacySheet
 * for both creation and editing scenarios.
 */

/**
 * Creates a new assistant assistant object with default values.
 * Assistant assistants have no custom parameters and use a simple system prompt.
 */
export const createNewAssistantAssistant = (): Partial<Assistant> => ({
  type: 'local',
  name: '',
  description: '',
  systemPrompt: '',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: ASSISTANT_SCHEMA,
  source: 'local',
  capabilities: {},
});

/**
 * Creates a new roleplay assistant object with default values.
 * Roleplay assistants use a parameterized template system with predefined parameters.
 */
export const createNewRoleplayAssistant = (): Partial<Assistant> => ({
  type: 'local',
  name: '',
  description: '',
  systemPrompt: ROLEPLAY_DEFAULT_TEMPLATE,
  originalSystemPrompt: ROLEPLAY_DEFAULT_TEMPLATE,
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    world: '',
    location: '',
    aiRole: '',
    userRole: '',
    situation: '',
    toneStyle: '',
  },
  parameterSchema: ROLEPLAY_SCHEMA,
  source: 'local',
  capabilities: {},
});

/**
 * Creates a new video assistant object with default values.
 * Video assistants have video capabilities and a configurable capture interval.
 */
export const createNewVideoAssistant = (): Partial<Assistant> => ({
  type: 'local',
  name: '',
  description: '',
  systemPrompt:
    'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
  originalSystemPrompt:
    'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    captureInterval: '3000', // Default 3 second interval
  },
  parameterSchema: VIDEO_SCHEMA,
  source: 'local',
  capabilities: {
    video: true,
  },
});

/**
 * Helper function to create a assistant object for editing.
 * This ensures the assistant object has all required fields for the form.
 */
export const prepareAssistantForEditing = (assistant: Assistant): Partial<Assistant> => {
  return {
    ...assistant,
    // Ensure all required form fields are present
    description: assistant.description || '',
    originalSystemPrompt: assistant.originalSystemPrompt || assistant.systemPrompt,
    parameters: assistant.parameters || {},
    parameterSchema: assistant.parameterSchema || [],
    capabilities: assistant.capabilities || {},
  };
};
