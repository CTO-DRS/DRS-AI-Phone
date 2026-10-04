/**
 * Supertonic TTS Engine Constants
 *
 * Centralized constants from the official Supertonic tts.json config
 * and other shared values used across the engine.
 */
/**
 * Core Supertonic constants
 */
export declare const SUPERTONIC_CONSTANTS: {
  /** Default maximum characters per chunk for sentence-level chunking */
  readonly DEFAULT_MAX_CHUNK_SIZE: 400;
  /** Default number of diffusion steps (quality vs speed tradeoff) */
  readonly DEFAULT_INFERENCE_STEPS: 5;
  /** Offset used in speed-to-duration formula: factor = 1 / (speed + offset) */
  readonly SPEED_OFFSET: 0.05;
  /** Pad token ID used for sequence padding */
  readonly PAD_TOKEN_ID: 0;
  /** Unknown/OOV token ID for characters not in vocabulary */
  readonly UNK_TOKEN_ID: 0;
  /** Vocoder output sample rate in Hz */
  readonly SAMPLE_RATE: 44100;
  /** Base chunk size from ae.base_chunk_size in tts.json */
  readonly AE_BASE_CHUNK_SIZE: 512;
  /** Chunk compression factor from ttl.chunk_compress_factor in tts.json */
  readonly TTL_CHUNK_COMPRESS_FACTOR: 6;
  /** Base latent dimension from ttl.latent_dim in tts.json */
  readonly LATENT_DIM: 24;
  /** Effective latent dimension (LATENT_DIM * TTL_CHUNK_COMPRESS_FACTOR) */
  readonly EFFECTIVE_LATENT_DIM: 144;
  /** Audio samples per latent frame (AE_BASE_CHUNK_SIZE * TTL_CHUNK_COMPRESS_FACTOR) */
  readonly CHUNK_SIZE: 3072;
  /** Expected size of style_dp tensor [8, 16] = 128 elements */
  readonly STYLE_DP_SIZE: 128;
  /** Expected size of style_ttl tensor [50, 256] = 12800 elements */
  readonly STYLE_TTL_SIZE: 12800;
  readonly AVAILABLE_LANGS: readonly [
    'na',
    'en',
    'ko',
    'ja',
    'ar',
    'bg',
    'cs',
    'da',
    'de',
    'el',
    'es',
    'et',
    'fi',
    'fr',
    'hi',
    'hr',
    'hu',
    'id',
    'it',
    'lt',
    'lv',
    'nl',
    'pl',
    'pt',
    'ro',
    'ru',
    'sk',
    'sl',
    'sv',
    'tr',
    'uk',
    'vi',
  ];
};
/**
 * Type for supported language codes (superset across all Supertonic versions)
 */
export type SupportedLanguage =
  (typeof SUPERTONIC_CONSTANTS.AVAILABLE_LANGS)[number];
//# sourceMappingURL=constants.d.ts.map
