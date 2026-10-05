/**
 * Character-level Tokenizer for Kokoro TTS
 *
 * Kokoro uses a simple character-level tokenization (no BPE merging).
 * Each valid IPA character maps directly to a token ID.
 * The sequence is wrapped with '$' (token 0) at start and end.
 */
import type { TokenizerConfig } from '../../types';
export declare class BPETokenizer {
    private vocab;
    private reverseVocab;
    private validChars;
    private boundaryTokenId;
    private isInitialized;
    /**
     * Load vocabulary from JSON objects
     * Note: Kokoro doesn't use BPE merges - it's character-level tokenization
     */
    loadFromData(vocabData: Record<string, number>, _mergesData: Array<string>): Promise<void>;
    /**
     * Encode phonemes into token IDs
     * Kokoro tokenization:
     * 1. Remove characters not in vocab (normalizer)
     * 2. Split into individual characters (pre-tokenizer with empty regex)
     * 3. Map each character to token ID
     * 4. Wrap with '$' token at start and end (post-processor)
     */
    encode(text: string, _options?: {
        addBos?: boolean;
        addEos?: boolean;
    }): number[];
    /**
     * Decode token IDs back to text
     */
    decode(tokenIds: number[]): string;
    /**
     * Get tokenizer configuration
     */
    getConfig(): TokenizerConfig;
    /**
     * Check if tokenizer is ready
     */
    isReady(): boolean;
    /**
     * Clear all tokenizer data and reset to uninitialized state.
     * After calling clear(), loadFromData() must be called again before use.
     */
    clear(): void;
    /**
     * Normalize text by removing characters not in vocab
     * This matches the tokenizer.json normalizer which uses a regex
     * to keep only valid IPA characters
     */
    private normalize;
}
