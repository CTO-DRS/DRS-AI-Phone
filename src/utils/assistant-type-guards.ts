/**
 * Type guards for proper discrimination between local and Drshub assistants
 *
 * These utilities provide type-safe ways to distinguish between different assistant types
 * without relying on fragile property existence checks.
 */

import type {Assistant} from '../types/assistant';
import type {DrshubAssistant} from '../types/drshub';

/**
 * Type guard to check if a assistant is a local assistant
 */
export function isLocalAssistant(
  assistant: Assistant | DrshubAssistant,
): assistant is Assistant {
  return assistant.type === 'local';
}

/**
 * Type guard to check if a assistant is a Drshub assistant
 */
export function isDrshubAssistant(
  assistant: Assistant | DrshubAssistant,
): assistant is DrshubAssistant {
  return assistant.type === 'drshub';
}

/**
 * Union type for all assistant types
 */
export type AnyAssistant = Assistant | DrshubAssistant;

/**
 * Type-safe assistant handler that ensures proper type discrimination
 */
export interface AssistantHandlers {
  onLocalAssistant: (assistant: Assistant) => void;
  onDrshubAssistant: (assistant: DrshubAssistant) => void;
}

/**
 * Handle a assistant with type-safe discrimination
 */
export function handleAssistantByType(
  assistant: AnyAssistant,
  handlers: AssistantHandlers,
): void {
  if (isLocalAssistant(assistant)) {
    handlers.onLocalAssistant(assistant);
  } else if (isDrshubAssistant(assistant)) {
    handlers.onDrshubAssistant(assistant);
  } else {
    console.warn('Unknown assistant type:', assistant);
  }
}
