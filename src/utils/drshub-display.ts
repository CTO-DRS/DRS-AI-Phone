/**
 * Drshub Display Utilities
 *
 * This module provides utilities for displaying Drshub content with appropriate
 * labels and actions based on pricing and ownership.
 */

import type {DrshubAssistant} from '../types/drshub';
import {l10n} from '../locales';
import {uiStore} from '../store';

/**
 * Get display label for a assistant based on its pricing and protection level
 */
export function getAssistantDisplayLabel(assistant: DrshubAssistant): {
  label: string;
  type: 'free' | 'premium' | 'locked';
  showLabel: boolean;
} {
  // Free assistants
  if (assistant.price_cents === 0) {
    return {
      label: l10n[uiStore.language].assistantsScreen.labels.free,
      type: 'free',
      showLabel: true,
    };
  }

  // Paid assistants - use protection level to determine label
  if (assistant.protection_level === 'reveal_on_purchase') {
    return {
      label: l10n[uiStore.language].assistantsScreen.labels.premium,
      type: 'premium',
      showLabel: true,
    };
  }

  // Private assistants (shouldn't normally be visible, but handle gracefully)
  if (assistant.protection_level === 'private') {
    return {
      label: l10n[uiStore.language].assistantsScreen.labels.private,
      type: 'locked',
      showLabel: true,
    };
  }

  // Public paid assistants (edge case - treat as premium)
  return {
    label: l10n[uiStore.language].assistantsScreen.labels.premium,
    type: 'premium',
    showLabel: true,
  };
}

/**
 * Check if a assistant is free
 */
export function isAssistantFree(assistant: DrshubAssistant): boolean {
  return assistant.price_cents === 0;
}

/**
 * Check if a assistant is premium (requires external purchase)
 */
export function isAssistantPremium(assistant: DrshubAssistant): boolean {
  return assistant.price_cents > 0;
}

/**
 * Filter labels for the UI
 */
export const ASSISTANT_FILTER_LABELS = {
  all: l10n[uiStore.language].assistantsScreen.filters.all,
  'my-assistants': l10n[uiStore.language].assistantsScreen.filters.myAssistants,
  local: l10n[uiStore.language].assistantsScreen.filters.local,
  video: l10n[uiStore.language].assistantsScreen.filters.video,
  free: l10n[uiStore.language].assistantsScreen.filters.free,
  premium: l10n[uiStore.language].assistantsScreen.filters.premium,
} as const;

/**
 * Get action text for assistant cards
 * Returns null for premium assistants to indicate no action should be shown
 */
export function getAssistantActionText(
  assistant: DrshubAssistant,
  isOwned: boolean,
): string | null {
  if (isOwned) {
    return l10n[uiStore.language].assistantsScreen.labels.download;
  }

  if (isAssistantFree(assistant)) {
    return l10n[uiStore.language].assistantsScreen.labels.getFree;
  }

  // For premium assistants, no action button should be shown
  return null;
}

/**
 * Get description for premium assistants
 */
export function getAssistantDescription(assistant: DrshubAssistant): string {
  if (isAssistantFree(assistant)) {
    return assistant.description || '';
  }

  // For premium assistants, we can show description but not pricing details
  return (
    assistant.description || l10n[uiStore.language].assistantsScreen.premiumAssistantDescription
  );
}

/**
 * Check if we should show full assistant content based on ownership and protection level
 */
export function shouldShowAssistantContent(assistant: DrshubAssistant): boolean {
  // Always show free content if protect level is public
  if (isAssistantFree(assistant)) {
    return assistant.protection_level === 'public';
  }

  // Show premium content only if owned
  return !!assistant.is_owned;
}

/**
 * Get informational text for premium assistants
 * This is purely informational, not a call-to-action
 */
export function getPremiumInfoText(): string {
  return l10n[uiStore.language].assistantsScreen.premiumInfoText;
}

/**
 * Separate assistants into categories for display
 */
export function categorizeAssistantsForDisplay(assistants: DrshubAssistant[]): {
  free: DrshubAssistant[];
  premium: DrshubAssistant[];
  all: DrshubAssistant[];
} {
  const free = assistants.filter(isAssistantFree);
  const premium = assistants.filter(isAssistantPremium);

  return {
    free,
    premium,
    all: assistants,
  };
}

/**
 * Get sort options for assistants
 */
export const ASSISTANT_SORT_OPTIONS = [
  {key: 'newest', label: l10n[uiStore.language].assistantsScreen.sortOptions.newest},
  {key: 'oldest', label: l10n[uiStore.language].assistantsScreen.sortOptions.oldest},
  {key: 'rating', label: l10n[uiStore.language].assistantsScreen.sortOptions.rating},
  {
    key: 'popular',
    label: l10n[uiStore.language].assistantsScreen.sortOptions.popular,
  },
] as const;
