/**
 * EngineStreamSession — pipelined synth + play loop over a
 * StreamingChunker.
 *
 * This is the core of Tier 3 streaming: the loop never resets
 * between "batches" — it just keeps pulling chunks from the chunker
 * as they become ready, synthesizing the next chunk while the current
 * one plays. The only gap is genuine token-rate underrun (LLM slower
 * than playback).
 *
 * Used by all neural engines via dependency injection:
 *   - `synthesizeChunk(text) → AudioBuffer`
 *   - `playAudio(buffer) → void`  (resolves when audio finishes)
 *   - `onStop()` — abort native playback
 *
 * OS engine does not use this — SpeechStream falls back to the
 * adaptive batcher there.
 */
import type { AudioBuffer, ChunkProgressEvent } from '../types';
import type { PlaybackOptions } from './NeuralAudioPlayer';
export interface EngineStreamSessionConfig {
    synthesizeChunk: (text: string) => Promise<AudioBuffer>;
    playAudio: (buffer: AudioBuffer, options?: PlaybackOptions) => Promise<void>;
    stopPlayback: () => Promise<void>;
    maxChunkSize: number;
    playbackOptions?: PlaybackOptions;
    postProcess?: (buffer: AudioBuffer) => void;
    onChunkProgress?: (event: ChunkProgressEvent) => void;
}
export interface EngineStreamHandle {
    append(text: string): void;
    finalize(): Promise<void>;
    cancel(): Promise<void>;
}
export declare class EngineStreamSession implements EngineStreamHandle {
    private readonly chunker;
    private readonly config;
    private readonly loopPromise;
    private cancelled;
    private stopSignalResolver;
    private firstError;
    private readonly sessionStartTs;
    private chunkCount;
    private lastChunkEndTs;
    constructor(config: EngineStreamSessionConfig);
    append(text: string): void;
    finalize(): Promise<void>;
    cancel(): Promise<void>;
    private rel;
    private createStopSignal;
    private raceWithStop;
    private runLoop;
    /**
     * Fetch chunks from the chunker, synthesizing each, until we find one
     * that produced audio. Returns null when the chunker is drained or the
     * session was cancelled.
     *
     * Engines may legitimately produce an empty `AudioBuffer` for chunks
     * that have no synthesizable content — e.g. Kitten skips a chunk that
     * tokenizes to only framing tokens (which crashes its BERT expand op).
     * Treating that as "stream done" would cut playback off mid-document,
     * so we keep pulling until we have audio.
     */
    private fetchNextWithAudio;
    private emitProgress;
}
