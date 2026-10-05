"use strict";

/**
 * React Native Speech - Multi-Engine TTS Library
 *
 * Supports:
 * - OS Native TTS (iOS AVSpeechSynthesizer, Android TextToSpeech)
 * - Kokoro Neural TTS (high quality, multi-language)
 * - Supertonic Neural TTS (ultra-fast, lightweight)
 * - Kitten Neural TTS (lightweight StyleTTS 2, English)
 *
 * ## Default usage (recommended for ~95% of apps)
 *
 * ```ts
 * import Speech from '@drsai/react-native-speech';
 *
 * await Speech.initialize({ engine: TTSEngine.OS_NATIVE });
 * await Speech.speak('Hello world');
 * ```
 *
 * The default `Speech` class wraps engine selection, lazy loading,
 * and lifecycle management. Most apps only ever need this entry.
 *
 * ## Advanced usage
 *
 * ```ts
 * import {engineManager, KokoroEngine} from '@drsai/react-native-speech';
 * ```
 *
 * Per-engine classes (`KokoroEngine`, `SupertonicEngine`, `KittenEngine`,
 * `OSEngine`) and the `engineManager` singleton are exported for advanced
 * scenarios such as multi-engine orchestration, custom pipelines, or
 * integrating an engine without going through the unified `Speech` API.
 *
 * These exports are tagged `@internal` — they are part of the public
 * surface but their shape may change between minor releases. Pin the
 * library version if you depend on them.
 */

// Export Speech API as default
export { default } from "./Speech.js";

// Export types from native API

// Export TTSEngine enum (as value, not type)
export { TTSEngine } from "./types/index.js";

// Runtime guard for SpeechInput — exported so consumers (especially
// untyped JS callers) can branch on input kind without deep imports.
export { isPhonemeInput } from "./types/index.js";

// Export engine types

// Export Kokoro types

export { CoreMlFlag, DEFAULT_COREML_FLAGS } from "./types/index.js";

// Export Supertonic types

// Export Kitten types

// Export component types

// Export components
export { default as HighlightedText } from "./components/HighlightedText/index.js";

// Export engines for advanced usage.
// These are part of the public API but their shape is not covered by
// the same semver guarantees as the default `Speech` API — see the
// header comment above.

/** @internal Advanced: low-level engine registry. */
export { engineManager } from "./engines/EngineManager.js";
/** @internal Advanced: OS native engine class. */
export { OSEngine } from "./engines/OSEngine.js";
/** @internal Advanced: Kokoro neural engine class. */
export { KokoroEngine } from "./engines/kokoro/index.js";
/** @internal Advanced: Supertonic neural engine class. */
export { SupertonicEngine } from "./engines/supertonic/index.js";
/** @internal Advanced: Kitten neural engine class. */
export { KittenEngine } from "./engines/kitten/index.js";
//# sourceMappingURL=index.js.map