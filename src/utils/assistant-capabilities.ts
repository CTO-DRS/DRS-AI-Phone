import type {Assistant, AssistantCapabilities} from '../types/assistant';

/**
 * Clean capability detection functions
 * No inference, only explicit capability checks
 */

export const hasVideoCapability = (assistant: Assistant): boolean => {
  return assistant.capabilities?.video === true;
};

export const hasMultimodalCapability = (assistant: Assistant): boolean => {
  return assistant.capabilities?.multimodal === true;
};

export const hasRealtimeCapability = (assistant: Assistant): boolean => {
  return assistant.capabilities?.realtime === true;
};

export const hasAudioCapability = (assistant: Assistant): boolean => {
  return assistant.capabilities?.audio === true;
};

export const hasWebCapability = (assistant: Assistant): boolean => {
  return assistant.capabilities?.web === true;
};

export const hasCodeCapability = (assistant: Assistant): boolean => {
  return assistant.capabilities?.code === true;
};

export const hasMemoryCapability = (assistant: Assistant): boolean => {
  return assistant.capabilities?.memory === true;
};

export const hasToolsCapability = (assistant: Assistant): boolean => {
  return assistant.capabilities?.tools === true;
};

/**
 * Get all active capabilities for a assistant
 */
export const getActiveCapabilities = (assistant: Assistant): string[] => {
  if (!assistant.capabilities) {
    return [];
  }

  return Object.entries(assistant.capabilities)
    .filter(([_, enabled]) => enabled === true)
    .map(([capability, _]) => capability);
};

/**
 * Check if assistant has any capabilities
 */
export const hasAnyCapabilities = (assistant: Assistant): boolean => {
  return getActiveCapabilities(assistant).length > 0;
};

/**
 * Create capabilities object from legacy assistant type
 * Clean, explicit mapping with no inference
 */
export const createCapabilitiesFromLegacyType = (
  legacyType: 'assistant' | 'roleplay' | 'video',
): AssistantCapabilities => {
  switch (legacyType) {
    case 'video':
      return {
        video: true,
        multimodal: true,
      };
    case 'assistant':
    case 'roleplay':
    default:
      return {}; // No special capabilities
  }
};
