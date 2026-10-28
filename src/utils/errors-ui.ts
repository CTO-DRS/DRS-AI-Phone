/**
 * Store-dependent error helpers.
 *
 * ARCH-01/CODE-02: the former src/utils/errors.ts imported uiStore for
 * localized messages while store/UIStore.ts imported the ErrorState type
 * from it — a utils ⇄ store import cycle. The cycle is broken by keeping
 * every store-free declaration in utils/errors-core.ts (which stores may
 * safely import) and confining the uiStore coupling to THIS module.
 * Import it directly when you need createErrorState; do not re-export it
 * from a module that stores import.
 */

import axios from 'axios';

import {uiStore} from '../store/UIStore';
import {type ErrorState, NetworkError, ServerError} from './errors-core';

// Type-only re-export so consumers of createErrorState can pull the state
// type and the helper from one import site. Erased at compile time — it
// adds no runtime dependency edge.
export type {ErrorState} from './errors-core';

/**
 * Helper function to create a standardized error state from any error
 */
export function createErrorState(
  error: unknown,
  context: ErrorState['context'],
  service?: ErrorState['service'],
  metadata?: ErrorState['metadata'],
  severity: ErrorState['severity'] = 'error',
): ErrorState {
  const l10nObject = uiStore.l10n;
  let code: ErrorState['code'] = 'unknown';
  let message = l10nObject.errors.unexpectedError;
  let recoverable = true;
  let errorService = service;

  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;

    // Check URL to determine service if not explicitly provided
    if (!errorService) {
      const url = error.config?.url || '';
      if (url.includes('huggingface.co') || url.includes('hf.co')) {
        errorService = 'huggingface';
      }
    }

    if (statusCode === 401) {
      code = 'authentication';
      message =
        errorService === 'huggingface'
          ? context === 'search'
            ? l10nObject.errors.hfAuthenticationErrorSearch
            : l10nObject.errors.hfAuthenticationError
          : l10nObject.errors.authenticationError;
    } else if (statusCode === 403) {
      code = 'authorization';
      message =
        errorService === 'huggingface'
          ? l10nObject.errors.hfAuthorizationError
          : l10nObject.errors.authorizationError;
    } else if (statusCode && statusCode >= 500) {
      code = 'server';
      message =
        errorService === 'huggingface'
          ? l10nObject.errors.hfServerError
          : l10nObject.errors.serverError;
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      code = 'network';
      message =
        errorService === 'huggingface'
          ? l10nObject.errors.hfNetworkTimeout
          : l10nObject.errors.networkTimeout;
    } else if (error.code === 'ERR_NETWORK') {
      code = 'network';
      message =
        errorService === 'huggingface'
          ? l10nObject.errors.hfNetworkError
          : l10nObject.errors.networkError;
    }
  } else if (error instanceof NetworkError) {
    code = 'network';
    message = error.message;
  } else if (error instanceof ServerError) {
    code = 'server';
    message = error.message;
  } else if (error instanceof Error) {
    // Handle error messages containing HTTP status codes (e.g., 'Client error: 403')
    if (typeof error.message === 'string') {
      const statusCodeMatch = error.message.match(
        /(?:Client error:|status:?)\s*(\d{3})/i,
      );
      if (statusCodeMatch) {
        const statusCode = parseInt(statusCodeMatch[1], 10);

        if (statusCode === 401) {
          code = 'authentication';
          message =
            errorService === 'huggingface'
              ? l10nObject.errors.hfAuthenticationError
              : l10nObject.errors.authenticationError;
        } else if (statusCode === 403) {
          code = 'authorization';
          message =
            errorService === 'huggingface'
              ? l10nObject.errors.hfAuthorizationError
              : l10nObject.errors.authorizationError;
        } else if (statusCode >= 500) {
          code = 'server';
          message =
            errorService === 'huggingface'
              ? l10nObject.errors.hfServerError
              : l10nObject.errors.serverError;
        } else {
          // Other status codes (400, 404, etc.) - preserve the original message
          message = error.message;
        }
      } else if (
        error.message.includes('storage') ||
        error.message.includes('space')
      ) {
        code = 'storage';
        message = error.message;
      } else {
        message = error.message;
      }
    } else {
      message = error.message;
    }
  } else {
    // Fallback for non-Error objects (e.g., from native JSI calls)
    // This handles cases where errors cross the JS-native boundary
    // and may not be proper Error instances
    if (error && typeof error === 'object' && 'message' in error) {
      message = String((error as {message: unknown}).message);
    } else if (typeof error === 'string') {
      message = error;
    } else if (error !== null && error !== undefined) {
      // Last resort: stringify the error
      try {
        message = JSON.stringify(error);
      } catch {
        message = String(error);
      }
    }
  }

  return {
    code,
    service: errorService,
    message,
    context,
    recoverable,
    severity,
    metadata,
  };
}
