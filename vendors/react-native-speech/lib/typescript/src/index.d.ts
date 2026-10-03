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
export { default } from './Speech';
export type { VoiceProps, EventProps, VoiceOptions, ProgressEventProps, EngineProps, } from './NativeSpeech';
export { TTSEngine } from './types';
export { isPhonemeInput } from './types';
export type { TTSEngineInterface, EngineStreamHandle, AudioBuffer, SynthesisOptions, SpeechInput, PhonemeInput, EngineStatus, ChunkProgressEvent, ChunkProgressCallback, SpeechStream, SpeechStreamOptions, StreamProgressEvent, } from './types';
export type { KokoroVoice, KokoroConfig, KokoroSynthesisOptions, SupportedLanguage, ExecutionProvider, CoreMLExecutionProviderOption, XNNPackExecutionProviderOption, CPUExecutionProviderOption, } from './types';
export { CoreMlFlag, DEFAULT_COREML_FLAGS } from './types';
export type { SupertonicVoice, SupertonicConfig, SupertonicSynthesisOptions, SupertonicLanguage, SupertonicModelPaths, InferenceSteps, } from './types';
export type { KittenVoice, KittenConfig, KittenSynthesisOptions, KittenLanguage, KittenBuiltinVoice, } from './types';
export type { HighlightedTextProps, HighlightedSegmentArgs, HighlightedSegmentProps, } from './components/types';
export { default as HighlightedText } from './components/HighlightedText';
/** @internal Advanced: low-level engine registry. */
export { engineManager } from './engines/EngineManager';
/** @internal Advanced: OS native engine class. */
export { OSEngine } from './engines/OSEngine';
/** @internal Advanced: Kokoro neural engine class. */
export { KokoroEngine } from './engines/kokoro';
/** @internal Advanced: Supertonic neural engine class. */
export { SupertonicEngine } from './engines/supertonic';
/** @internal Advanced: Kitten neural engine class. */
export { KittenEngine } from './engines/kitten';
//# sourceMappingURL=index.d.ts.map