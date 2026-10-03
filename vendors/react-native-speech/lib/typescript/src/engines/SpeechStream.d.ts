/**
 * SpeechStream — incremental text input for TTS.
 *
 * Consumers (e.g. apps playing LLM token streams through TTS) call
 * `append()` as tokens arrive and `finalize()` when the source closes.
 * The stream decides when to flush batches to the underlying synth so
 * that the audio sounds like one continuous utterance instead of a
 * series of per-sentence speaks.
 *
 * ## Batching policy
 *
 * The state machine is engine-agnostic — it sits above `Speech.speak()`
 * and simply controls how much text each `speak()` sees. Each flushed
 * batch still goes through the per-engine chunker + pipelined synth
 * internally, so sentences share prosody within a batch natively.
 *
 * - **First batch**: flushed as soon as the buffer contains a single
 *   complete sentence. Minimises time-to-first-audio.
 * - **Subsequent batches**: held back until one of:
 *     (a) buffer size crosses `targetChars`, OR
 *     (b) the prior batch finishes with text still buffered (underrun),
 *     (c) `finalize()` is called.
 *
 * Batches are serialised — at most one batch is in flight and at most
 * one is pre-queued. The `synthesize` and `stop` hooks are injected so
 * the class has no compile-time dependency on Speech / engines (which
 * keeps it trivially unit-testable).
 */
import type { ChunkProgressCallback, EngineStreamHandle, SpeechStream as ISpeechStream, SpeechStreamOptions, StreamProgressEvent } from '../types';
export interface SpeechStreamConfig {
    /** Maps a text batch to a promise that resolves when its audio has finished playing. */
    synthesize: (text: string) => Promise<void>;
    /** Aborts any in-flight synth/playback. Called from `cancel()`. */
    stop: () => Promise<void>;
    /**
     * Optional hook for the stream to subscribe to the underlying
     * engine's per-chunk progress events for the duration of a single
     * `synthesize()` call. The returned function unsubscribes.
     *
     * When present, the stream wires each batch's chunk events to its
     * own `onProgress` listeners with translated (stream-absolute)
     * offsets. Omit for engines/environments without chunk progress.
     */
    subscribeProgress?: (cb: ChunkProgressCallback) => () => void;
    /**
     * When provided, the stream uses Tier 3 pass-through mode: text is
     * forwarded directly to the engine's streaming session instead of
     * going through the adaptive batcher. This eliminates cross-batch
     * gaps because the engine's synth+play loop never resets.
     *
     * Falls back to the adaptive batcher (Tier 1) when absent — used
     * by the OS engine and any engine that doesn't support streaming.
     */
    engineStreamFactory?: (options?: SpeechStreamOptions) => EngineStreamHandle;
    /** User-supplied options — only `targetChars` and `onError` are read here. */
    options?: SpeechStreamOptions;
}
export declare class SpeechStreamImpl implements ISpeechStream {
    private readonly engineStream;
    private buffer;
    private queue;
    private inflight;
    private firstFlushDone;
    private finalized;
    private cancelled;
    private firstError;
    private drainResolvers;
    private readonly streamStartTs;
    private batchCount;
    private lastBatchEndTs;
    private totalAppendedChars;
    private progressListeners;
    private progressUnsub;
    private readonly targetChars;
    private readonly synthesize;
    private readonly stopFn;
    private readonly subscribeProgress?;
    private readonly onError?;
    constructor(config: SpeechStreamConfig);
    onProgress(cb: (event: StreamProgressEvent) => void): () => void;
    append(text: string): void;
    /** Milliseconds since stream was created — compact origin for log lines. */
    private rel;
    finalize(): Promise<void>;
    cancel(): Promise<void>;
    private cleanupProgressSub;
    /**
     * Decide whether to move text from the buffer to the batch queue.
     * Safe to call at any time; it's idempotent when nothing can flush.
     */
    private tryFlush;
    private enqueueBatch;
    /**
     * Advance the batch queue. At most one batch runs at a time. When a
     * batch finishes we re-check `tryFlush()` so the underrun guard (b)
     * can pick up buffered text that was waiting for the prior batch.
     */
    private pump;
    /**
     * Subscribe to the underlying engine's per-chunk progress events for
     * the duration of a single batch, translating each event's batch-local
     * textRange into a stream-absolute range before fanning it out to
     * `onProgress` listeners.
     *
     * Returns null (no-op) if the stream has no listeners, no injected
     * subscribe hook, or subscription fails — so the hot path pays nothing
     * when progress isn't being observed.
     */
    private installProgressForwarder;
    private waitForDrain;
    private isIdle;
    private maybeResolveDrain;
}
//# sourceMappingURL=SpeechStream.d.ts.map