/**
 * Sample text used for the voice preview button in Setup UI (v1.1).
 * Lives here so the service and future UI share a single string.
 */
export const TTS_PREVIEW_SAMPLE =
  "Oh, hello there! I've been waiting for you to test me. I sound pretty good!";

/** Minimum total RAM required to enable the TTS feature (4 GiB). */
export const TTS_MIN_RAM_BYTES = 4 * 1024 * 1024 * 1024;

/** Subdirectory (relative to app documents dir) used for Supertonic model files. */
export const SUPERTONIC_MODEL_SUBDIR = 'tts/supertonic';

/** Subdirectory for Kokoro model files. */
export const KOKORO_MODEL_SUBDIR = 'tts/kokoro';

/** Subdirectory for Kitten model files. */
export const KITTEN_MODEL_SUBDIR = 'tts/kitten';

/** Parent `tts/` directory (iOS backup exclusion applied here during mkdir). */
export const TTS_PARENT_SUBDIR = 'tts';

/**
 * HuggingFace base URL for the Supertonic v3 (31-language) model.
 *
 * v3 preserves the 5-file manifest, filenames, and 10-voice catalog of v2
 * while covering 31 languages plus a trained language-agnostic `<na>` tag.
 * Because the filenames are identical to v2, a local version sentinel
 * (`SUPERTONIC_VERSION_SENTINEL_FILENAME`) distinguishes a stale v2 install
 * from v3; see the supertonic engine and architecture/tts.md.
 */
export const SUPERTONIC_MODEL_BASE_URL =
  'https://huggingface.co/Supertone/supertonic-3/resolve/main';

/**
 * On-disk model generation this app expects. Bumped from the unversioned v2
 * to 3 when Supertonic gained all 31 languages + the trained `na` tag. The
 * version sentinel written after a successful download records this value;
 * `isInstalled()` requires it to match, forcing a one-time v2 re-download.
 */
export const SUPERTONIC_MODEL_VERSION = 3;

/**
 * Local sentinel file recording the installed Supertonic model version.
 * Lives in the model dir so the whole-dir reclaim removes it on re-download.
 * Written as the final step of `downloadModel()` so an interrupted download
 * never reports as installed.
 */
export const SUPERTONIC_VERSION_SENTINEL_FILENAME = 'model-version.json';

/**
 * Voice-style embeddings base URL — recorded in the local
 * `voices-manifest.json` so the fork's `StyleLoader` can fetch per-voice
 * style embeddings on first play.
 */
export const SUPERTONIC_VOICES_BASE_URL = `${SUPERTONIC_MODEL_BASE_URL}/voice_styles`;

/**
 * The five network-downloaded files that make up the Supertonic pipeline.
 * v3 preserves the v2 filenames; a sixth file (`voices-manifest.json`) and a
 * version sentinel are synthesized locally after download.
 *
 * AI-01 (audit v1.41.0): `sha256` is the file's HuggingFace LFS oid
 * (ground-truth SHA-256) and `bytes` its exact size; both are verified
 * after download by `verifyTtsFile` before the install counts. The LFS
 * oids were resolved from the HF repo-tree API (Supertone/supertonic-3).
 */
export const SUPERTONIC_MODEL_FILES = [
  {
    name: 'duration_predictor.onnx',
    urlPath: 'onnx/duration_predictor.onnx',
    sha256: 'c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db',
    bytes: 3700147,
  },
  {
    name: 'text_encoder.onnx',
    urlPath: 'onnx/text_encoder.onnx',
    sha256: 'c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff',
    bytes: 36416150,
  },
  {
    name: 'vector_estimator.onnx',
    urlPath: 'onnx/vector_estimator.onnx',
    sha256: '883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c',
    bytes: 256534781,
  },
  {
    name: 'vocoder.onnx',
    urlPath: 'onnx/vocoder.onnx',
    sha256: '085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba',
    bytes: 101424195,
  },
  {
    name: 'unicode_indexer.json',
    urlPath: 'onnx/unicode_indexer.json',
    // Not LFS-tracked: sha256 computed from the exact served bytes.
    sha256: '9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f',
    bytes: 277676,
  },
] as const;

/** Name of the voices manifest generated locally after model download. */
export const SUPERTONIC_VOICES_MANIFEST_FILENAME = 'voices-manifest.json';

/**
 * Total size of the Supertonic v3 model bundle: the exact summed byte size
 * of the 5 downloaded files (4 onnx + unicode_indexer.json) on HuggingFace
 * (Supertone/supertonic-3). Feeds the disk-space preflight (`estimated * 1.2`),
 * so it must be >= the real total, not just a UI label. ~380 MB.
 */
export const SUPERTONIC_MODEL_ESTIMATED_BYTES = 398_352_949;

// ---------------------------------------------------------------------------
// Kokoro (FP32 variant)
// ---------------------------------------------------------------------------

/**
 * HuggingFace base URL for Kokoro 82M v1.0 ONNX community port.
 * Full-precision (FP32) variant. The FP16 weights produce silent audio on
 * some devices (numeric overflow during inference); FP32 trades disk + RAM
 * for correctness everywhere: ~330 MB on disk, ~1 GB peak RAM. Q8 also
 * produces garbage on some Android ONNX Runtime builds, so neither
 * quantized variant is viable today.
 */
export const KOKORO_MODEL_BASE_URL =
  'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main';

/** Base URL for the Kokoro per-voice `.bin` embedding files. */
export const KOKORO_VOICES_BASE_URL = `${KOKORO_MODEL_BASE_URL}/voices`;

/**
 * Core Kokoro files — downloaded all-or-nothing (Phase 1). Without these
 * the engine cannot initialize. Local name is `model_fp32.onnx` so users
 * who previously downloaded the FP16 weights (saved as `model.onnx`) get
 * a clean re-download instead of inheriting the silent-audio bug.
 *
 * AI-01 (audit v1.41.0): `sha256`/`bytes` are verified after download by
 * `verifyTtsFile`. The model sha256 is the HF LFS oid
 * (onnx-community/Kokoro-82M-v1.0-ONNX); the tokenizer is a regular
 * (non-LFS) file whose sha256 was computed from the exact served bytes.
 */
export const KOKORO_MODEL_FILES = [
  {
    name: 'model_fp32.onnx',
    urlPath: 'onnx/model.onnx',
    sha256: '8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb',
    bytes: 325532232,
  },
  {
    name: 'tokenizer.json',
    urlPath: 'tokenizer.json',
    sha256: '77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34',
    bytes: 3497,
  },
] as const;

/**
 * IPA dictionary for the MIT `phonemize` JS phonemizer (required by the
 * default `phonemizerType: 'js'` path in Kokoro/Kitten). Built from
 * en-us.tsv via `npm run build:dict` in the fork; hosted as a HF dataset
 * so both engines share one download origin.
 */
export const TTS_DICT_URL =
  'https://huggingface.co/datasets/drshub/phonemizer-dicts/resolve/main/en-us.bin';

/** Local filename for the IPA dict (saved inside each engine's model dir). */
export const TTS_DICT_FILENAME = 'en-us.bin';

/**
 * IPA dict integrity data (AI-01). The hosting dataset (drshub/phonemizer-dicts)
 * is gated to anonymous API/resolve requests as of 2026-10, so the sha256/size
 * could not be resolved from here. In-app downloads still work for users who
 * already accepted the repo gate; until the owner fills these in, the dict
 * falls back to status-only verification in `verifyTtsFile`.
 */
export const TTS_DICT_SHA256: string | undefined = undefined;
export const TTS_DICT_BYTES: number | undefined = undefined;

/** Name of the Kokoro voices manifest generated locally after download. */
export const KOKORO_VOICES_MANIFEST_FILENAME = 'voices-manifest.json';

/** Estimated total size of the Kokoro FP32 model bundle (~330 MB including voices). */
export const KOKORO_MODEL_ESTIMATED_BYTES = 330 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Kitten (nano-fp32 variant)
// ---------------------------------------------------------------------------

/** HuggingFace base URL for the Kitten nano-fp32 model. */
export const KITTEN_MODEL_BASE_URL =
  'https://huggingface.co/drshub/kitten-tts-nano-0.8-fp32/resolve/main';

/**
 * Kitten files: the ONNX model (saved locally as `kitten.onnx`) and the
 * voices manifest JSON. The IPA dict is downloaded separately via
 * `TTS_DICT_URL` into the same directory.
 *
 * AI-01 (audit v1.41.0): `sha256`/`bytes` intentionally undefined — the
 * hosting repo (drshub/kitten-tts-nano-0.8-fp32) is gated to anonymous
 * requests as of 2026-10, so integrity data could not be resolved. Files
 * fall back to status-only verification until the owner fills them in.
 */
export const KITTEN_MODEL_FILES = [
  {name: 'kitten.onnx', urlPath: 'kitten_tts_nano_v0_8.onnx'},
  {name: 'voices-manifest.json', urlPath: 'voices-manifest.json'},
] as const;

/** Estimated total size of the Kitten model bundle (~57 MB + dict). */
export const KITTEN_MODEL_ESTIMATED_BYTES = 57 * 1024 * 1024;
