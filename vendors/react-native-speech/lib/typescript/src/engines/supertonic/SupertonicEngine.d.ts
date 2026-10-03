/**
 * Supertonic TTS Engine
 *
 * Ultra-fast neural TTS engine using ONNX Runtime for inference.
 * Uses a 4-model pipeline:
 * 1. Duration Predictor - predicts phoneme durations
 * 2. Text Encoder - encodes text into embeddings
 * 3. Vector Estimator - iterative diffusion for mel-spectrogram
 * 4. Vocoder - converts mel-spectrogram to audio
 *
 * Features:
 * - 167× faster than real-time on M4 Pro
 * - 66M parameters (lightweight)
 * - No G2P/phonemization needed (uses raw Unicode)
 * - Sentence-level chunking with progress events
 */
import type { TTSEngine, TTSEngineInterface, AudioBuffer, EngineStreamHandle, SupertonicConfig, SupertonicSynthesisOptions, SupertonicVoice, ChunkProgressCallback, ReleaseResult, SpeechInput } from '../../types';
export declare class SupertonicEngine implements TTSEngineInterface<SupertonicConfig> {
    readonly name: TTSEngine;
    private inference;
    private styleLoader;
    private unicodeProcessor;
    private config;
    private isInitialized;
    private isLoading;
    private initError;
    private defaultVoiceId;
    private defaultInferenceSteps;
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
    /**
     * Emit a chunk progress event
     */
    private emitChunkProgress;
    /**
     * Initialize the Supertonic engine with model files.
     * If initialization fails partway through, cleans up any partial state.
     */
    initialize(config?: SupertonicConfig): Promise<void>;
    /**
     * Check if engine is ready
     */
    isReady(): Promise<boolean>;
    /**
     * Synthesize text to audio and play it
     * Automatically chunks long text by sentences for better performance
     */
    synthesize(input: SpeechInput, options?: SupertonicSynthesisOptions): Promise<AudioBuffer | void>;
    synthesizeStream(options?: SupertonicSynthesisOptions): EngineStreamHandle;
    /**
     * Create a stop signal promise that resolves when stop() is called.
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
     * Synthesize a single chunk of text
     */
    private synthesizeChunk;
    /**
     * Get available voices
     */
    getAvailableVoices(language?: string): Promise<string[]>;
    /**
     * Get voices with metadata
     */
    getVoicesWithMetadata(language?: string): SupertonicVoice[];
    /**
     * Stop current playback and abort any ongoing synthesis.
     * Sets the stop flag and resolves the stop signal immediately,
     * so any in-flight ONNX inference is abandoned without waiting.
     */
    stop(): Promise<void>;
    /**
     * Clean up resources
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
     * - 4 ONNX InferenceSessions (duration predictor, text encoder, vector estimator, vocoder)
     * - Voice style embeddings cache
     * - Unicode processor data
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
     * Load voice styles from manifest or directory
     */
    private loadVoices;
}
//# sourceMappingURL=SupertonicEngine.d.ts.map