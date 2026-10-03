/**
 * Style Loader for Supertonic TTS
 *
 * Loads and manages voice style embeddings for Supertonic.
 * Supertonic voice styles are JSON files containing:
 * - style_dp: Style embedding for duration predictor
 * - style_ttl: Style embedding for text-to-latent
 */
import type { SupertonicVoice, SupertonicVoiceStyle } from '../../types';
/**
 * Voice manifest structure for lazy loading
 */
export interface VoiceManifest {
    /** Base URL for voice files */
    baseUrl: string;
    /** List of available voice IDs */
    voices: string[];
}
/**
 * Raw voice style data from JSON file
 * Supports:
 * - HuggingFace tensor format: {data: [[[...]]], dims: [...], type: "float32"}
 * - Flat array format: [...]
 * - Nested array format: [[...], [...]]
 */
export interface RawVoiceStyleData {
    style_dp?: unknown;
    style_ttl?: unknown;
    metadata?: unknown;
}
export declare class StyleLoader {
    private styles;
    private voiceMetadata;
    private manifest;
    private voicesBasePath;
    private isInitialized;
    /** Track in-progress loading to prevent race conditions */
    private loadingPromises;
    /**
     * Load voices from a manifest file (lazy loading mode)
     * Voices will be loaded on-demand when requested
     *
     * @param manifest - Voice manifest data
     * @param manifestPath - Path to the manifest file (used to derive base path)
     */
    loadFromManifest(manifest: VoiceManifest, manifestPath: string): Promise<void>;
    /**
     * Load voices from a directory path
     * Scans the directory for voice JSON files
     *
     * @param voicesPath - Path to voices directory
     */
    loadFromDirectory(voicesPath: string): Promise<void>;
    /**
     * Load a voice style from JSON data.
     * Validates that required fields exist and converted arrays are not empty.
     *
     * @param voiceId - Voice identifier
     * @param data - Raw voice style JSON data
     * @throws Error if required fields are missing or conversion fails
     */
    loadVoiceFromData(voiceId: string, data: RawVoiceStyleData): void;
    /**
     * Get voice style for a given voice ID
     * Loads the voice on-demand if using lazy loading.
     * Uses promise caching to prevent race conditions when multiple
     * concurrent calls request the same voice.
     *
     * @param voiceId - Voice identifier
     * @returns Voice style data
     */
    getVoiceStyle(voiceId: string): Promise<SupertonicVoiceStyle>;
    /**
     * Load a voice file from disk or network
     *
     * @param voiceId - Voice identifier
     */
    private loadVoiceFile;
    /**
     * Get all available voice IDs.
     *
     * Supertonic voices are language-agnostic — the same speaker embedding
     * works across every language the loaded model supports. The `language`
     * parameter is accepted for `TTSEngineInterface` compatibility and
     * ignored.
     */
    getVoiceIds(_language?: string): string[];
    /**
     * Get all voices with metadata. See `getVoiceIds` re: language.
     */
    getVoices(_language?: string): SupertonicVoice[];
    /**
     * Check if the style loader is ready
     */
    isReady(): boolean;
    /**
     * Check if a voice is already loaded (cached)
     *
     * @param voiceId - Voice identifier
     * @returns True if voice is loaded
     */
    isVoiceLoaded(voiceId: string): boolean;
    /**
     * Preload a specific voice
     *
     * @param voiceId - Voice identifier to preload
     */
    preloadVoice(voiceId: string): Promise<void>;
    /**
     * Preload all voices (for offline use)
     */
    preloadAllVoices(): Promise<void>;
    /**
     * Create voice metadata from voice ID
     *
     * Uses official voice names and descriptions from Supertonic demo.
     * Supertonic voice IDs follow format: {gender}{number}
     * - F1, F2, F3... = Female voices
     * - M1, M2, M3... = Male voices
     */
    private createVoiceMetadata;
    /**
     * Clear all cached voices and pending loads
     */
    clear(): void;
}
//# sourceMappingURL=StyleLoader.d.ts.map