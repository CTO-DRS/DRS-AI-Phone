/**
 * Unicode Processor for Supertonic TTS
 *
 * Supertonic uses a character vocabulary mapping from unicode_indexer.json.
 * The indexer is an array where index = unicode code point, value = vocab index.
 * Characters not in the vocabulary are mapped to -1 and should use fallback.
 */
/**
 * Create a text mask tensor (1 for valid tokens, 0 for padding)
 *
 * @param length - Sequence length
 * @returns Float32Array mask
 */
export declare function createTextMask(length: number): Float32Array;
/**
 * Create a latent mask tensor based on duration predictions
 *
 * @param totalDuration - Total predicted duration
 * @returns Float32Array mask
 */
export declare function createLatentMask(totalDuration: number): Float32Array;
/**
 * Expand durations to create positional encoding for text to latent mapping
 * Given durations [2, 3, 1], this creates positions for each latent frame
 *
 * @param durations - Array of duration values for each text position
 * @returns Expanded position indices
 */
export declare function expandDurations(durations: Float32Array): number[];
/**
 * Calculate total duration from duration predictions
 *
 * @param durations - Duration values
 * @returns Total duration (sum of all durations, rounded)
 */
export declare function calculateTotalDuration(durations: Float32Array): number;
/**
 * Pad a BigInt64Array to a target length
 *
 * @param arr - Input array
 * @param targetLength - Target length to pad to
 * @param padValue - Value to use for padding (default: PAD_TOKEN_ID)
 * @returns Padded BigInt64Array
 */
export declare function padBigIntArray(arr: BigInt64Array, targetLength: number, padValue?: bigint): BigInt64Array;
/**
 * Pad a Float32Array to a target length
 *
 * @param arr - Input array
 * @param targetLength - Target length to pad to
 * @param padValue - Value to use for padding (default: 0)
 * @returns Padded Float32Array
 */
export declare function padFloat32Array(arr: Float32Array, targetLength: number, padValue?: number): Float32Array;
export declare class UnicodeProcessor {
    private indexer;
    private isInitialized;
    private supportsLanguageTags;
    /**
     * Initialize the Unicode processor by loading the indexer from JSON
     *
     * @param unicodeIndexerPath - Path to unicode_indexer.json file
     */
    initialize(unicodeIndexerPath: string): Promise<void>;
    /**
     * Check if the processor is ready
     */
    isReady(): boolean;
    /**
     * Convert text to vocabulary indices for Supertonic
     * Each character is mapped to its vocabulary index using the unicode_indexer
     * NOTE: Text should already be normalized (with language tags) before calling this
     *
     * @param text - Input text to convert (should be already normalized)
     * @returns BigInt64Array of vocabulary indices
     */
    textToUnicodeIds(text: string): BigInt64Array;
    /**
     * Process text for Supertonic input
     * Returns all tensors needed for the duration predictor and text encoder
     *
     * @param text - Input text to process
     * @returns Object containing text_ids and text_mask tensors
     */
    process(text: string): {
        textIds: BigInt64Array;
        textMask: Float32Array;
        sequenceLength: number;
    };
    /**
     * Normalize text before processing
     *
     * @param text - Input text
     * @param lang - Language code (default: 'en')
     * @returns Normalized text (with language tags for v2 models)
     */
    normalize(text: string, lang?: string): string;
    /**
     * Check if this processor supports language tags (v2 models)
     */
    hasLanguageTagSupport(): boolean;
    /**
     * Clear all processor data and reset to uninitialized state.
     * After calling clear(), initialize() must be called again before use.
     */
    clear(): void;
}
