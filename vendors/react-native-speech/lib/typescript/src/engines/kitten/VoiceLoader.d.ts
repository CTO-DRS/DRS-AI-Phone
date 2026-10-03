/**
 * Voice Loader for Kitten TTS
 *
 * Loads and manages voice style embeddings for Kitten synthesis.
 * Kitten uses length-dependent voice styling: the embedding selected
 * depends on the raw text length, capped at the voice array's max index.
 *
 * Formula: ref_id = min(len(text), voices[voice].shape[0] - 1)
 *
 * Supports:
 * - Pre-converted JSON voice data (from NPZ via convert script)
 * - Manifest-based lazy loading
 */
import type { KittenVoice } from '../../types/Kitten';
export declare class VoiceLoader {
    private voices;
    private availableVoices;
    private isInitialized;
    private manifestBaseUrl?;
    private manifestVoicesDir?;
    private lazyLoadingEnabled;
    private pendingLoads;
    /**
     * Load voice data from pre-converted JSON.
     * Expected format (output of convert-kitten-voices.py):
     * {
     *   "Bella": { "embeddings": [[...], [...], ...], "shape": [N, D] },
     *   "Jasper": { "embeddings": [[...], [...], ...], "shape": [N, D] },
     *   ...
     * }
     */
    loadFromJSON(data: Record<string, {
        embeddings: number[][];
        shape: number[];
    }>): Promise<void>;
    /**
     * Load voices from a manifest file (lazy loading mode).
     * Voices are downloaded on-demand when first requested.
     */
    loadFromManifest(manifest: {
        baseUrl?: string;
        voices: string[];
    }, manifestPath: string): Promise<void>;
    /**
     * Get the style embedding for a voice, selected by raw text length.
     *
     * Kitten uses length-dependent voice styling:
     *   ref_id = min(len(text), N - 1)
     *   style = voices[voice][ref_id]
     *
     * @param voiceId - Voice name (e.g., 'Bella')
     * @param textLength - Length of the raw input text (before phonemization)
     * @returns Float32Array of shape [D] — the style embedding
     */
    getStyleEmbedding(voiceId: string, textLength: number): Promise<Float32Array>;
    /**
     * Get list of available voices
     */
    getAvailableVoices(): KittenVoice[];
    /**
     * Check if voice loader is ready
     */
    isReady(): boolean;
    /**
     * Clear all voice data and reset.
     */
    clear(): void;
    /**
     * Lazy load a voice from cache or download.
     * Race-condition safe via pendingLoads map.
     */
    private lazyLoadVoice;
    private doLazyLoadVoice;
}
//# sourceMappingURL=VoiceLoader.d.ts.map