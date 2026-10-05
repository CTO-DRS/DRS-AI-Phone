"use strict";

/**
 * GPL-free phonemization pipeline.
 *
 * Shared by neural TTS engines (Kokoro, Kitten) that need a dict-based
 * phonemizer plus hans00/phonemize OOV fallback.
 */

export { loadDict, loadNativeDict, clearDictCache } from "./dict.js";
export { JsDictSource } from "./JsDictSource.js";
export { NativeDictSource, openNativeDict } from "./NativeDictSource.js";
export { HansPhonemizer } from "./HansPhonemizer.js";
export { TextPreprocessor, chunkText, ensurePunctuation, numberToWords, floatToWords } from "./KittenPreprocessor.js";
//# sourceMappingURL=index.js.map