/**
 * Error classes for better error handling throughout the application.
 *
 * ARCH-01/CODE-02: this module is a pure leaf — it must not import any
 * store, hook, or barrel. The store-dependent half of the former
 * utils/errors.ts lives in utils/errors-ui.ts; keeping the split is what
 * breaks the old `utils/errors.ts ⇄ store/UIStore.ts` import cycle, so
 * do not move store-dependent code back in here.
 */

/**
 * NetworkError - Used for connectivity-related errors
 * Examples: No internet connection, timeout, etc.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * AppCheckError - Used for Firebase App Check verification errors
 * Examples: App not installed from official store, verification failed, etc.
 */
export class AppCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppCheckError';
  }
}

/**
 * ServerError - Used for backend server errors
 * Examples: 500 errors, API unavailable, etc.
 */
export class ServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerError';
  }
}

/**
 * Standardized error state interface for consistent error handling across the app
 */
export interface ErrorState {
  code:
    | 'authentication'
    | 'authorization'
    | 'network'
    | 'storage'
    | 'server'
    | 'multimodal'
    | 'unknown';
  service?: 'huggingface' | 'firebase' | 'localapi';
  message: string;
  context: 'search' | 'download' | 'modelDetails' | 'chat' | 'modelInit';
  recoverable: boolean;
  severity?: 'error' | 'warning';
  metadata?: {
    modelId?: string;
    [key: string]: any;
  };
}

/**
 * Helper function to create a multimodal warning state
 */
export function createMultimodalWarning(
  message: string,
  context: ErrorState['context'] = 'chat',
): ErrorState {
  return {
    code: 'multimodal',
    message,
    context,
    recoverable: false,
    severity: 'warning',
  };
}
