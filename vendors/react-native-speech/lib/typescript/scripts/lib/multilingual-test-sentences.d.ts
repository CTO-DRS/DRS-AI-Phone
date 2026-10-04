/**
 * Canonical test sentence per Supertonic-supported language.
 *
 * Each sentence is short (~15-40 chars), uses natural orthography, and
 * roughly translates to "The weather is nice today" — pragmatic choice
 * for ASR round-trip because:
 *   - common vocabulary in every Whisper-large training set
 *   - no proper nouns or acronyms that could trip pronunciation
 *   - similar length keeps timing comparable across languages
 *
 * Used by `scripts/verify-supertonic-multilingual.ts`.
 */
export declare const TEST_SENTENCES: Record<string, string>;
export declare const ALL_LANGS: string[];
//# sourceMappingURL=multilingual-test-sentences.d.ts.map
