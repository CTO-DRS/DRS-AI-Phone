/**
 * React Native Speech - Multi-Engine TTS Library
 *
 * Unified API that supports multiple TTS engines:
 * - OS Native (iOS AVSpeechSynthesizer, Android TextToSpeech)
 * - Kokoro (Neural TTS - high quality, multi-language)
 * - Supertonic (Neural TTS - ultra-fast, lightweight)
 * - Kitten (Neural TTS - lightweight StyleTTS 2, English)
 *
 * @example
 * // Initialize with Kokoro
 * await Speech.initialize({
 *   engine: TTSEngine.KOKORO,
 *   modelPath: 'file://...',
 *   voicesPath: 'file://...',
 * });
 *
 * // Speak with any engine
 * await Speech.speak('Hello world', 'af_bella', { speed: 1.0 });
 */
import type { VoiceProps, VoiceOptions, EngineProps } from './NativeSpeech';
import { TTSEngine } from './types';
import type { KokoroConfig, KokoroVoice, SupertonicConfig, SupertonicVoice, KittenConfig, KittenVoice, SynthesisOptions, ChunkProgressEvent, ChunkProgressCallback, ReleaseResult, SpeechInput, PhonemeInput, SpeechStream as ISpeechStream, SpeechStreamOptions, StreamProgressEvent } from './types';
/**
 * Default synthesis-option fields that can also be provided at init time
 * (applied on the native side for audio-session configuration).
 * These mirror the subset of `SynthesisOptions` relevant at initialization.
 */
export interface SpeechInitAudioDefaults {
    /** iOS silent-switch behavior — see `SynthesisOptions.silentMode` */
    silentMode?: 'obey' | 'respect' | 'ignore';
    /** Duck other audio while speaking — see `SynthesisOptions.ducking` */
    ducking?: boolean;
}
/**
 * Discriminated union of engine init configs.
 * `engine` is the discriminant; the remaining fields are engine-specific.
 */
export type SpeechInitConfig = ({
    engine: TTSEngine.OS_NATIVE;
} & SpeechInitAudioDefaults) | ({
    engine: TTSEngine.KOKORO;
} & KokoroConfig & SpeechInitAudioDefaults) | ({
    engine: TTSEngine.SUPERTONIC;
} & SupertonicConfig & SpeechInitAudioDefaults) | ({
    engine: TTSEngine.KITTEN;
} & KittenConfig & SpeechInitAudioDefaults);
export default class Speech {
    /**
     * The maximum number of characters allowed in a single call to the speak methods.
     */
    static readonly maxInputLength: number;
    private static currentEngine;
    /**
     * Initialize Speech with a specific engine
     * @param config - Configuration object with engine and engine-specific settings
     * @example
     * // Initialize with Kokoro
     * await Speech.initialize({
     *   engine: 'kokoro',
     *   modelPath: '...',
     *   voicesPath: '...',
     *   // ... other Kokoro config
     * });
     *
     * // Initialize with OS native (default)
     * await Speech.initialize({
     *   engine: 'os-native'
     * });
     */
    static initialize(config: SpeechInitConfig): Promise<void>;
    /**
     * Speak text — or pre-phonemized IPA — using the current engine.
     *
     * @param input - Either a text string (runs the full pipeline,
     *   including g2p) or `{ phonemes }` to feed IPA directly and
     *   short-circuit g2p. Phoneme input is supported only by the IPA
     *   neural engines (Kokoro, Kitten); the OS and Supertonic engines
     *   reject it with a clear error.
     * @param voiceId - Voice identifier (engine-specific)
     * @param options - Synthesis options
     * @example
     * // Text (unchanged behaviour — g2p runs)
     * await Speech.speak('Hello world', 'af_bella', { speed: 1.0 });
     *
     * // Pre-phonemized IPA — skips the engine's g2p
     * await Speech.speak({ phonemes: 'həˈloʊ wˈɜːld' }, 'af_bella');
     */
    static speak(input: SpeechInput, voiceId?: string, options?: SynthesisOptions): Promise<void>;
    /**
     * Create a streaming input handle for incremental TTS.
     *
     * Feed text to the returned stream as it becomes available (e.g. from
     * an LLM token stream). The stream internally buffers and batches
     * text so that playback sounds like one continuous utterance — the
     * first sentence flushes as soon as it's complete (low latency) and
     * subsequent batches are packed up to `targetChars` characters.
     *
     * **Engine support**: designed for the neural engines (Kokoro,
     * Supertonic, Kitten), where each `speak()` resolves only after the
     * batch finishes playing so the stream can pack large batches while
     * earlier ones play. The OS engine's native `speak()` resolves on
     * dispatch, which makes the adaptive batching effectively a no-op —
     * the stream still works (the OS queues utterances natively) but
     * sounds roughly the same as per-sentence `speak()`.
     *
     * @param voiceId - Voice identifier for the active engine
     * @param options - Synthesis options + stream-specific tuning
     * @returns A handle with `append()`, `finalize()`, and `cancel()`
     *
     * @example
     * const stream = Speech.createSpeechStream('af_bella');
     * for await (const token of llmStream) {
     *   stream.append(token);
     * }
     * await stream.finalize();
     */
    static createSpeechStream(voiceId?: string, options?: SpeechStreamOptions): ISpeechStream;
    /**
     * Get available voices for the current engine
     * @param language - Optional language filter
     * @returns Array of voice identifiers
     */
    static getVoices(language?: string): Promise<string[]>;
    /**
     * Get detailed voice information (Neural engines only)
     * @param language - Optional language filter
     * @returns Array of voice objects with metadata
     */
    static getVoicesWithMetadata(language?: string): Promise<KokoroVoice[] | SupertonicVoice[] | KittenVoice[]>;
    /**
     * Check if the current engine is ready
     */
    static isReady(): Promise<boolean>;
    /**
     * Get the current engine name
     */
    static getCurrentEngine(): TTSEngine;
    /**
     * Get list of available engines
     */
    static getAvailableEngines(): TTSEngine[];
    /**
     * Set callback for chunk progress events (Neural TTS only)
     * This is called when each sentence/chunk starts being spoken
     *
     * @param callback - Function to call on chunk progress, or null to remove
     * @example
     * Speech.setChunkProgressCallback((event) => {
     *   console.log(`Speaking chunk ${event.chunkIndex + 1}/${event.totalChunks}`);
     *   console.log(`Current sentence: "${event.chunkText}"`);
     *   console.log(`Progress: ${event.progress}%`);
     *   // Highlight current text in UI
     *   highlightText(event.textRange.start, event.textRange.end);
     * });
     */
    static setChunkProgressCallback(callback: ChunkProgressCallback | null): void;
    /**
     * Convenience method to add a chunk progress listener
     * Returns an unsubscribe function
     *
     * @param callback - Function to call on chunk progress
     * @returns Function to unsubscribe the listener
     * @example
     * const unsubscribe = Speech.onChunkProgress((event) => {
     *   console.log(`Chunk ${event.chunkIndex + 1}/${event.totalChunks}: ${event.chunkText}`);
     * });
     *
     * // Later, to stop listening:
     * unsubscribe();
     */
    static onChunkProgress(callback: ChunkProgressCallback): () => void;
    /**
     * Gets a list of all available OS voices on the device
     * Only works when using OS native engine
     */
    static getAvailableVoices(language?: string): Promise<VoiceProps[]>;
    /**
     * Gets a list of all available text-to-speech engines on the device
     * @platform Android
     */
    static getEngines(): Promise<EngineProps[]>;
    /**
     * Sets the Android text-to-speech engine
     * @platform Android
     */
    static setEngine(engineName: string): Promise<void>;
    /**
     * Opens the system UI to install or update TTS voice data
     * @platform Android
     */
    static openVoiceDataInstaller(): Promise<void>;
    /**
     * Resets all speech options to their default values (OS TTS only)
     */
    static reset(): void;
    /**
     * Immediately stops any ongoing synthesis.
     * Sets the stop flag synchronously, then fires native stops concurrently.
     * Works for both OS native and neural TTS engines.
     */
    static stop(): Promise<void>;
    /**
     * Release the current neural engine's resources from memory.
     * The engine can be re-initialized later with initialize().
     * OS native engine does not need releasing.
     *
     * Use this when:
     * - App goes to background and won't use TTS
     * - Switching between engines and want to free previous engine's memory
     * - Memory pressure situations
     *
     * After release(), call initialize() before using speak().
     *
     * @returns ReleaseResult with success status and any errors
     *
     * @example
     * // Free memory when app goes to background
     * AppState.addEventListener('change', async (state) => {
     *   if (state === 'background') {
     *     await Speech.release();
     *   }
     * });
     *
     * // Later, when needed again
     * await Speech.initialize({ engine: 'kokoro', ... });
     */
    static release(): Promise<ReleaseResult>;
    /**
     * Pauses the current speech.
     * For neural engines, pauses audio playback (synthesis loop waits naturally).
     * For OS native engine, pauses the system synthesizer.
     */
    static pause(): Promise<boolean>;
    /**
     * Resumes previously paused speech.
     * For neural engines, resumes audio playback.
     * For OS native engine, resumes the system synthesizer.
     */
    static resume(): Promise<boolean>;
    /**
     * Checks if speech is currently being synthesized
     */
    static isSpeaking(): Promise<boolean>;
    /**
     * Speaks text with custom options (OS TTS)
     */
    static speakWithOptions(text: string, options: VoiceOptions): Promise<void>;
    static onError: import("react-native/Libraries/Types/CodegenTypesNamespace").EventEmitter<import("./NativeSpeech").EventProps>;
    static onStart: import("react-native/Libraries/Types/CodegenTypesNamespace").EventEmitter<import("./NativeSpeech").EventProps>;
    static onFinish: import("react-native/Libraries/Types/CodegenTypesNamespace").EventEmitter<import("./NativeSpeech").EventProps>;
    static onPause: import("react-native/Libraries/Types/CodegenTypesNamespace").EventEmitter<import("./NativeSpeech").EventProps>;
    static onResume: import("react-native/Libraries/Types/CodegenTypesNamespace").EventEmitter<import("./NativeSpeech").EventProps>;
    static onStopped: import("react-native/Libraries/Types/CodegenTypesNamespace").EventEmitter<import("./NativeSpeech").EventProps>;
    static onProgress: import("react-native/Libraries/Types/CodegenTypesNamespace").EventEmitter<import("./NativeSpeech").ProgressEventProps>;
}
export type { TTSEngine, KokoroVoice, KokoroConfig, SupertonicVoice, SupertonicConfig, KittenVoice, KittenConfig, SynthesisOptions, ChunkProgressEvent, ChunkProgressCallback, ReleaseResult, SpeechInput, PhonemeInput, ISpeechStream as SpeechStream, SpeechStreamOptions, StreamProgressEvent, };
//# sourceMappingURL=Speech.d.ts.map