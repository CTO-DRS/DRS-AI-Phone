/**
 * TTS Engine Manager
 *
 * Manages multiple TTS engines and provides a unified interface
 */
import type { TTSEngine, TTSEngineInterface, EngineStatus } from '../types';
type AnyEngine = TTSEngineInterface<unknown>;
declare class TTSEngineManager {
    private engines;
    private defaultEngine;
    private initialized;
    /**
     * Register a TTS engine
     */
    registerEngine<TConfig>(engine: TTSEngineInterface<TConfig>): void;
    /**
     * Get an engine by name
     */
    getEngine(name: TTSEngine): AnyEngine;
    /**
     * Check if engine is registered
     */
    hasEngine(name: TTSEngine): boolean;
    /**
     * Get all registered engines
     */
    getAvailableEngines(): TTSEngine[];
    /**
     * Set default engine
     */
    setDefaultEngine(name: TTSEngine): void;
    /**
     * Get default engine
     */
    getDefaultEngine(): TTSEngine;
    /**
     * Initialize an engine (lazy initialization)
     */
    initializeEngine<TConfig>(name: TTSEngine, config?: TConfig): Promise<void>;
    /**
     * Force re-initialization of an engine with new config
     * Destroys existing engine state and re-initializes
     */
    reinitializeEngine<TConfig>(name: TTSEngine, config?: TConfig): Promise<void>;
    /**
     * Check if engine is initialized
     */
    isEngineInitialized(name: TTSEngine): boolean;
    /**
     * Get engine status
     */
    getEngineStatus(name: TTSEngine): Promise<EngineStatus>;
    /**
     * Destroy all engines
     */
    destroyAll(): Promise<void>;
}
export declare const engineManager: TTSEngineManager;
export {};
