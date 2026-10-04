/**
 * Kokoro TTS Engine Constants
 *
 * Centralized constants for the Kokoro neural TTS engine.
 * These values are derived from the Kokoro model architecture.
 */
/**
 * Core Kokoro constants
 */
export declare const KOKORO_CONSTANTS: {
  /** Maximum tokens the Kokoro model supports (0-509 voice embeddings) */
  readonly MAX_TOKEN_LIMIT: 500;
  /** Default maximum chunk size in characters for text splitting */
  readonly DEFAULT_MAX_CHUNK_SIZE: 400;
  /** Boundary token ID used for sequence boundaries */
  readonly BOUNDARY_TOKEN_ID: 0;
  /** Style embedding dimension (floats per embedding) */
  readonly STYLE_DIM: 256;
  /** Maximum token positions for voice style selection */
  readonly MAX_TOKENS: 509;
  /** Total embeddings per voice file (509 positions + 1) */
  readonly TOTAL_EMBEDDINGS: 510;
  /** Expected size of a complete voice file: 510 × 256 = 130,560 floats */
  readonly EXPECTED_VOICE_SIZE: 130560;
  /** Sample rate in Hz for Kokoro audio output */
  readonly SAMPLE_RATE: 24000;
  /** Audio channels (mono) */
  readonly CHANNELS: 1;
  /** Characters preserved during phonemization */
  readonly PUNCTUATION_CHARS: ';:,.!?¡¿—…"«»""(){}[]';
  readonly AVAILABLE_LANGS: readonly ['en-us', 'en-gb', 'ja', 'zh', 'ko'];
};
/**
 * Type for supported Kokoro language codes
 */
export type KokoroLanguage = (typeof KOKORO_CONSTANTS.AVAILABLE_LANGS)[number];
/**
 * Voice embedding validation constants
 */
export declare const VOICE_EMBEDDING_CONSTANTS: {
  /** Size of each style embedding in floats */
  readonly STYLE_DIM: 256;
  /** Maximum token index for style selection (0-509) */
  readonly MAX_TOKEN_INDEX: 509;
  /** Total number of style embeddings per voice */
  readonly TOTAL_EMBEDDINGS: 510;
  /** Expected total floats per voice file */
  readonly EXPECTED_SIZE: 130560;
};
//# sourceMappingURL=constants.d.ts.map
