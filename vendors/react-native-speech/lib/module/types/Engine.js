"use strict";

/**
 * TTS Engine types and interfaces
 */

export let TTSEngine = /*#__PURE__*/function (TTSEngine) {
  /**
   * Use the native OS TTS engine
   * - iOS: AVSpeechSynthesizer
   * - Android: Android TextToSpeech API
   */
  TTSEngine["OS_NATIVE"] = "os-native";
  /**
   * Use Kokoro neural TTS engine (offline, ONNX-based)
   * - High-quality neural voice synthesis
   * - Runs entirely on-device
   * - Requires model files
   */
  TTSEngine["KOKORO"] = "kokoro";
  /**
   * Use Supertonic neural TTS engine (offline, ONNX-based)
   * - Ultra-fast neural voice synthesis (167× faster than real-time)
   * - Lightweight (66M parameters)
   * - Runs entirely on-device
   * - Requires model files
   */
  TTSEngine["SUPERTONIC"] = "supertonic";
  /**
   * Use Kitten neural TTS engine (offline, ONNX-based)
   * - 15M parameter StyleTTS 2-based TTS
   * - Single ONNX model, 24kHz mono output
   * - 8 built-in voices, English only
   * - GPL-free dictionary-based phonemization + character-level IPA tokenization
   * - Requires 1 ONNX model file + voice embeddings JSON
   */
  TTSEngine["KITTEN"] = "kitten";
  return TTSEngine;
}({});

/**
 * Phoneme input: the caller supplies IPA directly, so the engine skips
 * its grapheme-domain stages (markdown stripping, text normalization /
 * preprocessing, and g2p phonemization) and tokenizes the string as-is.
 *
 * Only the IPA-pipeline neural engines (Kokoro, Kitten) accept this.
 * The OS and Supertonic engines have no IPA-in path and reject it with
 * a clear error.
 *
 * Unlike text input, a phoneme string is NOT sentence-chunked — pass
 * one already-segmented utterance per call. The engine still applies
 * its model token-limit safety net (Kitten splits oversized input;
 * Kokoro warns).
 */

/**
 * Input accepted by `Speech.speak` / `TTSEngineInterface.synthesize`.
 *
 * - `string` — text; runs the engine's full pipeline (g2p included).
 *   Behaviour is identical to before phoneme input existed.
 * - `PhonemeInput` — pre-phonemized IPA; short-circuits g2p.
 */

/**
 * Narrows a `SpeechInput` to `PhonemeInput`. A plain string is text;
 * an object carrying an own string `phonemes` field is pre-phonemized
 * IPA. Inherited or non-string `phonemes` (possible from untyped JS
 * callers) is not treated as phoneme input.
 */
export function isPhonemeInput(input) {
  return typeof input === 'object' && input !== null && Object.prototype.hasOwnProperty.call(input, 'phonemes') && typeof input.phonemes === 'string';
}

/**
 * Error details for a failed release operation on a specific component
 */

/**
 * Result of a release operation
 */

/**
 * Handle returned by `TTSEngineInterface.synthesizeStream()`. The
 * caller pushes text in via `append()` and the engine pulls chunks
 * from an internal streaming chunker, pipelining synth + play so
 * there is no gap between chunks.
 */

/**
 * Event emitted when a new chunk (sentence) starts being spoken.
 * Used by neural TTS engines that process text in chunks.
 */

/**
 * Callback type for chunk progress events
 */

/**
 * Options for `Speech.createSpeechStream`.
 * Extends `SynthesisOptions` — all regular speak options apply to each batch.
 */

/**
 * Progress event emitted by a `SpeechStream` as each chunk starts
 * playing.
 *
 * Offsets are relative to the **total text appended to the stream so
 * far** (sum of all `append()` arguments, in order). Whether they map
 * one-to-one to the consumer's input depends on `stripMarkdown`:
 *
 * - With `stripMarkdown: true` (default for neural engines), markdown
 *   is stripped from the appended text before chunking, so the range
 *   refers to the post-strip stream — not the consumer's original
 *   appends. Highlighting the original input directly will drift
 *   wherever stripping removed or rewrote characters.
 * - With `stripMarkdown: false`, the range maps directly to the
 *   accumulated original text. Use this if you need stable original-
 *   text offsets for highlighting and have already cleaned the
 *   markdown yourself.
 */

/**
 * Streaming input handle returned by `Speech.createSpeechStream`.
 *
 * Feed text incrementally (e.g. LLM tokens) via `append()`; the stream
 * decides when to flush batches to the underlying engine so that the
 * audio sounds continuous instead of like a sequence of per-sentence
 * utterances.
 */
//# sourceMappingURL=Engine.js.map