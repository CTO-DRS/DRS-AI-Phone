/**
 * Kokoro TTS Engine
 *
 * Neural TTS engine using ONNX Runtime for inference.
 * Supports sentence-level chunking for long text with progress events.
 *
 * Features:
 * - High-quality neural voice synthesis
 * - Hardware acceleration (CoreML on iOS, NNAPI on Android)
 * - Pipelined synthesis for seamless playback
 * - Voice blending support
 */
import type { TTSEngine, TTSEngineInterface, AudioBuffer, EngineStreamHandle, KokoroConfig, KokoroSynthesisOptions, KokoroVoice, ChunkProgressCallback, ReleaseResult, SpeechInput } from '../../types';
export declare class KokoroEngine implements TTSEngineInterface<KokoroConfig> {
    readonly name: TTSEngine;
    private session;
    private tokenizer;
    private voiceLoader;
    private phonemizer;
    private normalizer;
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
     * @param callback - Function to call when chunk progress changes
     */
    setChunkProgressCallback(callback: ChunkProgressCallback | null): void;
    /**
     * Emit a chunk progress event
     */
    private emitChunkProgress;
    /**
     * Initialize the Kokoro engine with model files
     */
    initialize(config?: KokoroConfig): Promise<void>;
    /**
     * Check if engine is ready
     */
    isReady(): Promise<boolean>;
    /**
     * Synthesize text to audio and play it
     * Automatically chunks long text by sentences for better performance and progress tracking
     * This maintains the unified API - synthesize() now plays audio for neural engines
     */
    synthesize(input: SpeechInput, options?: KokoroSynthesisOptions): Promise<AudioBuffer | void>;
    synthesizeStream(options?: KokoroSynthesisOptions): EngineStreamHandle;
    /**
     * Create a stop signal promise that resolves when stop() is called.
     * Used to race against long-running operations (ONNX inference, playback).
     */
    private createStopSignal;
    /**
     * Race a promise against the stop signal.
     * Returns null if stop was triggered before the promise resolved.
     */
    private raceWithStop;
    /**
     * Internal synthesis implementation
     */
    private doSynthesize;
    /**
     * Synthesize a text chunk to audio (normalize -> phonemize -> tokenize -> infer)
     * This is the full pipeline for a single chunk
     */
    private synthesizeTextChunk;
    /**
     * Synthesize a single chunk of tokens to audio
     * This is the core inference method without playback
     */
    private synthesizeChunk;
    /**
     * Get available voices
     */
    getAvailableVoices(language?: string): Promise<string[]>;
    /**
     * Get available voices with metadata
     */
    getVoicesWithMetadata(language?: string): KokoroVoice[];
    /**
     * Stop current playback and abort any ongoing synthesis.
     * Sets the stop flag and resolves the stop signal immediately,
     * so any in-flight ONNX inference is abandoned without waiting.
     */
    stop(): Promise<void>;
    /**
     * Destroy engine and free resources
     * After calling destroy(), the engine can be re-initialized with new config
     */
    destroy(): Promise<void>;
    /**
     * Wait for any ongoing synthesis to complete or abort
     */
    private waitForSynthesisComplete;
    /**
     * Reset engine state to uninitialized
     */
    private resetState;
    /**
     * Release model resources from memory while keeping engine instance reusable.
     * After calling release(), initialize() must be called before synthesize().
     *
     * This method properly releases:
     * - ONNX InferenceSession (main memory consumer ~450MB)
     * - Voice embeddings cache
     * - Tokenizer vocabulary data
     *
     * @returns ReleaseResult with success status and any errors encountered
     */
    release(): Promise<ReleaseResult>;
    /**
     * Get engine status
     */
    getStatus(): {
        isReady: boolean;
        isLoading: boolean;
        error: string | null;
    };
    /**
     * Load ONNX model with hardware acceleration
     */
    private loadModel;
    /**
     * Load BPE tokenizer from vocab and merges files
     */
    private loadTokenizer;
    /**
     * Load BPE tokenizer from HuggingFace tokenizer.json format
     */
    private loadTokenizerFromHF;
    /**
     * Load voice embeddings from manifest, JSON, or binary file
     */
    private loadVoices;
    /**
     * Get language code from voice ID
     * Voice IDs follow the pattern: {lang}{gender}_{name}
     * e.g., 'af_bella' -> 'en-us' (American English)
     *       'bf_emma' -> 'en-gb' (British English)
     *
     * Returns BCP-47-ish language codes used by the phonemizer (kept
     * compatible with the original Kokoro pipeline's labels).
     */
    private getLanguageFromVoice;
}
//# sourceMappingURL=KokoroEngine.d.ts.map