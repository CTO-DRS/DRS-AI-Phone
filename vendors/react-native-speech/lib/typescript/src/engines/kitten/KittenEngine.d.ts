/**
 * Kitten TTS Engine
 *
 * Neural TTS engine using a single ONNX model (StyleTTS 2 distilled).
 * Pipeline: Text → Phonemizer (JS or native) → IPA Tokenizer → ONNX → Audio (24kHz)
 *
 * Features:
 * - Single ONNX model (simpler than multi-model engines)
 * - Hardware acceleration (CoreML on iOS, NNAPI on Android)
 * - Pipelined synthesis for seamless playback
 * - Length-dependent voice style embeddings
 * - 8 built-in voices, English only
 */
import type { TTSEngine, TTSEngineInterface, AudioBuffer, EngineStreamHandle, ChunkProgressCallback, ReleaseResult, SpeechInput } from '../../types';
import type { KittenConfig, KittenSynthesisOptions } from '../../types/Kitten';
export declare class KittenEngine implements TTSEngineInterface<KittenConfig> {
    readonly name: TTSEngine;
    private session;
    private tokenizer;
    private voiceLoader;
    private phonemizer;
    private preprocessor;
    private config;
    private isInitialized;
    private isLoading;
    private initError;
    private defaultVoiceId;
    private stopRequested;
    private stopSignalResolver;
    private currentUtteranceId;
    private chunkProgressCallback;
    private isSynthesizing;
    private synthesisCompleteResolver;
    private activeStreamSession;
    constructor();
    /**
     * Set callback for chunk progress events
     */
    setChunkProgressCallback(callback: ChunkProgressCallback | null): void;
    private emitChunkProgress;
    /**
     * Initialize the Kitten engine with model files
     */
    initialize(config?: KittenConfig): Promise<void>;
    isReady(): Promise<boolean>;
    /**
     * Synthesize text to audio and play it.
     * Automatically chunks long text by sentences.
     */
    synthesize(input: SpeechInput, options?: KittenSynthesisOptions): Promise<AudioBuffer | void>;
    synthesizeStream(options?: KittenSynthesisOptions): EngineStreamHandle;
    private createStopSignal;
    private raceWithStop;
    /**
     * Internal synthesis implementation with pipelined chunking
     */
    private doSynthesize;
    /**
     * Synthesize a text chunk: normalize → phonemize → tokenize → infer → trim
     */
    private synthesizeTextChunk;
    /**
     * Phonemize text using the configured phonemizer (defaults to GPL-free JS).
     */
    private phonemizeText;
    /**
     * Resolve voice alias (e.g., 'Bella' → 'expr-voice-2-f')
     * and return the internal voice ID used by the model.
     */
    private resolveVoiceId;
    /**
     * Core ONNX inference for a single tokenized chunk
     */
    private synthesizeChunk;
    getAvailableVoices(_language?: string): Promise<string[]>;
    getVoicesWithMetadata(): import("../..").KittenVoice[];
    /**
     * Stop current playback and abort ongoing synthesis.
     */
    stop(): Promise<void>;
    destroy(): Promise<void>;
    private waitForSynthesisComplete;
    private resetState;
    /**
     * Release model resources from memory while keeping engine instance reusable.
     */
    release(): Promise<ReleaseResult>;
    getStatus(): {
        isReady: boolean;
        isLoading: boolean;
        error: string | null;
    };
    private loadModel;
    private loadTokenizer;
    private loadVoices;
}
//# sourceMappingURL=KittenEngine.d.ts.map