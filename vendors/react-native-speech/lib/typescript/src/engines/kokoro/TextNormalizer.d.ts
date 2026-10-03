/**
 * Text Normalizer for TTS
 *
 * Normalizes text before phonemization to improve pronunciation:
 * - Expands abbreviations (Dr. -> Doctor)
 * - Converts numbers to words (2024 -> twenty twenty-four)
 * - Handles currency ($5.99 -> five dollars and ninety-nine cents)
 * - Normalizes punctuation and whitespace
 *
 * Based on: https://github.com/hexgrad/kokoro/blob/main/kokoro.js/src/phonemize.js
 */
export declare class TextNormalizer {
    /**
     * Split numbers into phonetic equivalents
     * Handles years, times, and decimal numbers
     */
    private splitNum;
    /**
     * Format monetary values into spoken form
     */
    private flipMoney;
    /**
     * Process decimal numbers into spoken form
     */
    private pointNum;
    /**
     * Convert a non-negative integer (<= 999_999) to English words.
     * Used as a final-pass fallback after kokoro.js-style number handling.
     */
    private intToWords;
    /**
     * Normalize text for TTS
     * Applies all preprocessing transformations from kokoro.js
     */
    normalize(text: string): string;
    /**
     * Split text into sentence-based chunks for streaming/processing
     * Preserves sentence boundaries for natural speech flow
     */
    chunkBySentences(text: string, maxChunkSize?: number): string[];
    /**
     * Split text into sentence-based chunks with metadata for progress tracking
     * Returns chunks with their original text positions
     *
     * @param text - The text to chunk
     * @param maxChunkSize - Maximum characters per chunk (default 500 to stay within token limits)
     * @returns Array of chunks with text and position metadata
     */
    chunkBySentencesWithMetadata(text: string, maxChunkSize?: number): TextChunk[];
}
/**
 * Represents a chunk of text with its position in the original text
 */
export interface TextChunk {
    /** The normalized/processed chunk text */
    text: string;
    /** The original text before normalization */
    originalText: string;
    /** Start index in the original text */
    startIndex: number;
    /** End index in the original text */
    endIndex: number;
}
//# sourceMappingURL=TextNormalizer.d.ts.map