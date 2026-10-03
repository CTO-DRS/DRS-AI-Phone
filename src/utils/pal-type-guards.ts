/**
 * Type guards for proper discrimination between local and Drshub pals
 *
 * These utilities provide type-safe ways to distinguish between different pal types
 * without relying on fragile property existence checks.
 */

import type {Pal} from '../types/pal';
import type {DrshubPal} from '../types/drshub';

/**
 * Type guard to check if a pal is a local pal
 */
export function isLocalPal(pal: Pal | DrshubPal): pal is Pal {
  return pal.type === 'local';
}

/**
 * Type guard to check if a pal is a Drshub pal
 */
export function isDrshubPal(pal: Pal | DrshubPal): pal is DrshubPal {
  return pal.type === 'drshub';
}

/**
 * Union type for all pal types
 */
export type AnyPal = Pal | DrshubPal;

/**
 * Type-safe pal handler that ensures proper type discrimination
 */
export interface PalHandlers {
  onLocalPal: (pal: Pal) => void;
  onDrshubPal: (pal: DrshubPal) => void;
}

/**
 * Handle a pal with type-safe discrimination
 */
export function handlePalByType(pal: AnyPal, handlers: PalHandlers): void {
  if (isLocalPal(pal)) {
    handlers.onLocalPal(pal);
  } else if (isDrshubPal(pal)) {
    handlers.onDrshubPal(pal);
  } else {
    console.warn('Unknown pal type:', pal);
  }
}
