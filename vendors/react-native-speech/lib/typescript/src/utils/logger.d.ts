/**
 * Logger Utility for Neural TTS Engines
 *
 * Provides consistent logging format across all TTS components.
 * All logs are prefixed with [EngineName][Component] for easy filtering.
 *
 * In production builds (__DEV__ = false), debug logs are suppressed.
 */
/**
 * Available log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Create a logger for a specific engine/module
 *
 * @param prefix - Module prefix (e.g., 'Kokoro', 'Supertonic')
 * @returns Logger object with debug, info, warn, error methods
 *
 * @example
 * const log = createLogger('Kokoro');
 * log.debug('Engine', 'Initializing...');
 * // Output: [Kokoro][Engine] Initializing...
 */
export declare function createLogger(prefix: string): {
    /**
     * Log debug message (only in development)
     */
    debug: (component: string, message: string, ...args: unknown[]) => void;
    /**
     * Log info message
     */
    info: (component: string, message: string, ...args: unknown[]) => void;
    /**
     * Log warning message
     */
    warn: (component: string, message: string, ...args: unknown[]) => void;
    /**
     * Log error message
     */
    error: (component: string, message: string, ...args: unknown[]) => void;
};
/**
 * Create a component-scoped logger
 *
 * @param prefix - Module prefix (e.g., 'Kokoro')
 * @param component - Component name (e.g., 'Engine', 'VoiceLoader')
 * @returns Logger object with debug, info, warn, error methods (no component param needed)
 *
 * @example
 * const log = createComponentLogger('Kokoro', 'Engine');
 * log.debug('Initializing...');
 * // Output: [Kokoro][Engine] Initializing...
 */
export declare function createComponentLogger(prefix: string, component: string): {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
};
export declare const kokoroLogger: {
    /**
     * Log debug message (only in development)
     */
    debug: (component: string, message: string, ...args: unknown[]) => void;
    /**
     * Log info message
     */
    info: (component: string, message: string, ...args: unknown[]) => void;
    /**
     * Log warning message
     */
    warn: (component: string, message: string, ...args: unknown[]) => void;
    /**
     * Log error message
     */
    error: (component: string, message: string, ...args: unknown[]) => void;
};
export declare const supertonicLogger: {
    /**
     * Log debug message (only in development)
     */
    debug: (component: string, message: string, ...args: unknown[]) => void;
    /**
     * Log info message
     */
    info: (component: string, message: string, ...args: unknown[]) => void;
    /**
     * Log warning message
     */
    warn: (component: string, message: string, ...args: unknown[]) => void;
    /**
     * Log error message
     */
    error: (component: string, message: string, ...args: unknown[]) => void;
};
