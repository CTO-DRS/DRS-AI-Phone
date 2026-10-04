/**
 * Kitten TTS Engine Constants
 *
 * Centralized constants for the Kitten neural TTS engine.
 * These values are derived from the Kitten model architecture (StyleTTS 2).
 */
import type {KittenVoice} from '../../types/Kitten';
/**
 * Core Kitten constants
 */
export declare const KITTEN_CONSTANTS: {
  /** Sample rate in Hz for Kitten audio output */
  readonly SAMPLE_RATE: 24000;
  /** Audio channels (mono) */
  readonly CHANNELS: 1;
  /**
   * Default maximum chunk size in characters for text splitting.
   *
   * Sized to keep the typical IPA expansion (~2-2.5x for English) under
   * MAX_PHONEME_TOKENS. Worst-case content (numbers spelled out as
   * "forty-seven", heavy diphthong words) can run at 3.4x and still hit
   * the cap on a 200-char chunk, in which case the engine skips that
   * chunk rather than crash. Lower this if you regularly hit the
   * "skipping oversized chunk" warning.
   */
  readonly DEFAULT_MAX_CHUNK_SIZE: 200;
  /**
   * Maximum phoneme tokens per chunk (input_ids dimension).
   *
   * Kitten's BERT positional embeddings cap out at 512 tokens. Beyond
   * that, the `/bert/Expand` op fails with "invalid expand shape" and
   * the synthesis throws. In practice English IPA expansion runs at
   * ~2-2.5x the source character count for typical prose, but worst-
   * case content (numbers spelled out, heavy diphthongs) can hit 3.4x.
   *
   * 480 leaves ~6% headroom under 512 for framing tokens (pad+eos+pad).
   * Pair with DEFAULT_MAX_CHUNK_SIZE = 200 so typical chunks stay well
   * under the cap; the cap is a safety net for unusual inputs.
   */
  readonly MAX_PHONEME_TOKENS: 480;
  /** Boundary/pad token ID (the '$' character, index 0) */
  readonly BOUNDARY_TOKEN_ID: 0;
  /** End-of-sequence token ID (index 10, the '…' character in the symbol table) */
  readonly EOS_TOKEN_ID: 10;
  /** Number of trailing samples to trim from audio output to remove artifacts */
  readonly TRIM_SAMPLES: 5000;
  /** Language code for the dict+hans00 phonemizer */
  readonly PHONEMIZER_LANGUAGE: 'en-us';
  readonly AVAILABLE_LANGS: readonly ['en-us'];
};
/**
 * Build the default symbol-to-ID mapping matching the reference TextCleaner.
 * Constructs the full symbols array (with duplicates preserved) and builds
 * the vocab dict with last-occurrence-wins, matching Python's behavior.
 */
export declare function buildDefaultVocab(): Record<string, number>;
/**
 * Voice aliases: friendly name → internal NPZ key.
 * From config.json in the HuggingFace model repo.
 */
export declare const KITTEN_VOICE_ALIASES: Record<string, string>;
/**
 * Per-voice speed priors from config.json.
 * Multiplied with user-requested speed for better quality.
 * Keyed by internal voice name.
 */
export declare const KITTEN_SPEED_PRIORS: Record<string, number>;
/**
 * Built-in voice metadata for the 8 Kitten TTS voices.
 * IDs use the internal NPZ key names that match the voice embedding files.
 */
export declare const KITTEN_BUILTIN_VOICES: KittenVoice[];
//# sourceMappingURL=constants.d.ts.map
