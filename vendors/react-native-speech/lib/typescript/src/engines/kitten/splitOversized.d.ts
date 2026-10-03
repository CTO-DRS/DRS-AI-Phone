/**
 * Helpers for recovering from oversized chunks in the Kitten pipeline.
 *
 * Kitten's BERT positional embeddings cap at 512 tokens. When a chunk's
 * IPA tokenization exceeds the safe limit, the engine splits the source
 * text into smaller pieces, synthesizes each, and concatenates the
 * resulting audio. The user hears the entire content with a slightly
 * stilted seam at the split point — far better than the alternative of
 * dropping the chunk and producing 10+ seconds of silence.
 */
import type { AudioBuffer } from '../../types';
/**
 * Split a source-text chunk that's too long for Kitten's BERT (after
 * IPA expansion) into smaller pieces.
 *
 * Strategy is a cascade — try each tier in order, return the first one
 * that produces ≥2 pieces. Earlier tiers preserve more prosody:
 *
 *   1. Sentence boundaries: `[.!?]` + whitespace. Chunker may bundle
 *      multiple sentences when char-budget allows even though their IPA
 *      total exceeds the BERT cap; splitting back on these gives the
 *      cleanest re-split (the model already handles `.!?` as natural
 *      breaks, no prosody seam at all).
 *   2. Clause-level: `[,;:]` + whitespace. Real prosody breaks the
 *      model can render naturally. Lookbehind keeps punctuation
 *      attached to the preceding piece.
 *   3. Bare newlines: any run of `\n` not already covered by tiers 1
 *      or 2. Catches paragraph/line breaks between list items where
 *      the stripper removed bullet markers and there's no punctuation
 *      at end of line.
 *   4. Word boundary near the midpoint. Last resort, less natural but
 *      always works on text with any whitespace.
 *   5. Give up: a single huge token (e.g. a 600-char URL or DNA-like
 *      run) returns as a 1-element array so the caller can drop it
 *      rather than loop forever.
 *
 * Returns an empty array for empty input. Each piece returned is
 * trimmed of edge whitespace and guaranteed non-empty.
 */
export declare function splitOversizedSource(text: string): string[];
/**
 * Concatenate AudioBuffers into one. All inputs must share sampleRate
 * and channels (true for any single engine session). Throws if mixed
 * sample rates are provided so a misuse surfaces loudly rather than
 * producing garbled audio.
 *
 * Caller is responsible for handling the empty-input case (typically
 * by returning their own empty buffer with the correct sample rate);
 * passing zero buffers here throws.
 */
export declare function concatAudioBuffers(buffers: AudioBuffer[]): AudioBuffer;
//# sourceMappingURL=splitOversized.d.ts.map