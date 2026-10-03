/**
 * HansPhonemizer — GPL-free phonemizer using dict + hans00/phonemize.
 *
 * Layers (per word):
 *   1. REDUCED_FORMS — context-reduced overrides for function words
 *   2. Pre-generated IPA dictionary lookup (DictSource)
 *   3. Hyphen-split compound handling (per-part REDUCED_FORMS + dict)
 *   4. Possessive fallback ("X's" → dict[X] + "ɪz")
 *   5. hans00/phonemize G2P fallback for OOV, with stress relocation
 *   6. Per-word destress keyed by English spelling
 */
import { type IPhonemizer } from '../engines/kokoro/Phonemizer';
import type { DictSource } from './DictSource';
export interface HansPhonemizerOptions {
    dict: DictSource;
    /** Optional post-processing (e.g. Kokoro IPA normalization) */
    postProcess?: (phonemes: string, language: string) => string;
}
export declare class HansPhonemizer implements IPhonemizer {
    private readonly dict;
    private readonly postProcess?;
    constructor(options: HansPhonemizerOptions);
    phonemize(text: string, language: string): Promise<string>;
}
//# sourceMappingURL=HansPhonemizer.d.ts.map