/**
 * Phonemizer - Converts text to phonemes (G2P - Grapheme to Phoneme)
 *
 * This is a CRITICAL component for Kokoro TTS. The model is trained on phonemes,
 * not raw text. Without phonemization, the model receives the wrong input format
 * and quality will be significantly degraded.
 */
import type { DictSource } from '../../phonemization/DictSource';
export declare const PUNCTUATION_PATTERN: RegExp;
/**
 * Split text on punctuation pattern, preserving the delimiters
 * Based on: https://github.com/hexgrad/kokoro/blob/main/kokoro.js/src/phonemize.js#L10
 */
export declare function splitOnPunctuation(text: string): {
    isPunctuation: boolean;
    text: string;
}[];
/**
 * Rejoin phonemized chunks into a single string
 * Punctuation chunks are kept as-is, phoneme chunks are joined
 */
export declare function rejoinChunks(chunks: {
    isPunctuation: boolean;
    text: string;
    phoneme?: string;
}[]): string;
/**
 * Post-process phonemes for Kokoro TTS compatibility
 * Exported separately for testing and reuse
 * Based on: https://github.com/hexgrad/kokoro/blob/main/kokoro.js/src/phonemize.js#L174
 */
export declare function postProcessPhonemes(phonemes: string, language: string): string;
/**
 * Interface for phonemization implementations
 */
export interface IPhonemizer {
    /**
     * Convert text to phonemes
     * @param text The input text
     * @param language Language code (e.g., 'en-us', 'en-gb')
     * @returns Phoneme string in IPA format
     */
    phonemize(text: string, language: string): Promise<string>;
}
/**
 * Pass-through phonemizer (no phonemization)
 * Used when raw text input is desired (not recommended for Kokoro)
 */
export declare class NoOpPhonemizer implements IPhonemizer {
    phonemize(text: string, _language: string): Promise<string>;
}
/**
 * Phonemizer type options
 */
export type PhonemizerType = 'js' | 'js-ipa' | 'none';
export interface CreatePhonemizerOptions {
    /** Pre-loaded dictionary source; required for 'js' and 'js-ipa' */
    dict?: DictSource;
    /** Optional language hint for future multi-language support */
    language?: string;
}
/**
 * Factory function to create the appropriate phonemizer.
 *
 * - 'js': HansPhonemizer with Kokoro post-processing (requires `opts.dict`)
 * - 'js-ipa': HansPhonemizer without post-processing, raw IPA (requires `opts.dict`)
 * - 'none': pass-through
 */
export declare function createPhonemizer(type: PhonemizerType, opts?: CreatePhonemizerOptions): IPhonemizer;
