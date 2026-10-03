/**
 * Voice Loader for Kokoro TTS
 *
 * Loads and manages voice embeddings for Kokoro synthesis.
 * Supports:
 * - Binary voice files (voices.bin)
 * - JSON voice data
 * - Lazy loading from manifest (on-demand download)
 */
import type { KokoroVoice } from '../../types';
export declare class VoiceLoader {
    private voiceEmbeddings;
    private availableVoices;
    private isInitialized;
    private manifestBaseUrl?;
    private manifestVoicesDir?;
    private lazyLoadingEnabled;
    private pendingLoads;
    /**
     * Load voice embeddings from binary data
     * Format: [voice_id_length(4bytes)][voice_id][embedding_dim(4bytes)][embedding_data(float32[])]...
     */
    loadFromBinary(data: ArrayBuffer): Promise<void>;
    /**
     * Load voice embeddings from simplified JSON format (for testing/development)
     */
    loadFromJSON(data: Record<string, number[]>): Promise<void>;
    /**
     * Load voice embeddings from manifest (lazy loading mode)
     * Voices will be downloaded on-demand when requested
     */
    loadFromManifest(manifest: {
        baseUrl: string;
        voices: string[];
    }, manifestPath: string): Promise<void>;
    /**
     * Get voice embedding by ID and token count
     * In lazy loading mode, downloads the voice file if not cached
     *
     * The voice files contain 510 style embeddings (one for each possible input length from 0 to 509 tokens).
     * Each embedding is 256 floats (STYLE_DIM).
     * Total: 510 × 256 = 130,560 floats (522,240 bytes)
     *
     * @param voiceId - The voice ID
     * @param numTokens - The number of tokens in the input (used to select the appropriate style embedding)
     */
    getVoiceEmbedding(voiceId: string, numTokens?: number): Promise<Float32Array>;
    /**
     * Lazy load a voice file from cache or download it
     * Uses a pending loads map to prevent race conditions when multiple
     * requests for the same voice arrive simultaneously.
     */
    private lazyLoadVoice;
    /**
     * Internal method to actually load a voice file
     */
    private doLazyLoadVoice;
    /**
     * Get list of available voices
     */
    getAvailableVoices(language?: string): KokoroVoice[];
    /**
     * Blend multiple voices together
     */
    blendVoices(voiceIds: string[], weights: number[], numTokens?: number): Promise<Float32Array>;
    /**
     * Check if voice loader is ready
     */
    isReady(): boolean;
    /**
     * Clear all voice data and reset to uninitialized state.
     * After calling clear(), one of the load methods must be called again before use.
     */
    clear(): void;
    /**
     * Parse voice ID to extract metadata
     * Format examples:
     * - af_bella -> female, English, name: Bella
     * - am_michael -> male, English, name: Michael
     * - zh_f1 -> female, Chinese, ID: 1
     */
    private parseVoiceId;
    /**
     * Get human-readable language name
     */
    private getLanguageName;
}
//# sourceMappingURL=VoiceLoader.d.ts.map