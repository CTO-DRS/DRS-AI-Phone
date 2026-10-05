/**
 * StreamingChunker — incremental sentence-aware text splitter for
 * streaming TTS.
 *
 * Text is pushed in via `append()` as it arrives (e.g. LLM tokens).
 * The consumer loop calls `getNextChunk()` which resolves as soon as
 * a complete sentence is available, or returns `null` when the stream
 * is finalized and the buffer is drained.
 *
 * All returned chunks carry absolute character offsets into the total
 * appended text so progress events can map directly to the consumer's
 * accumulated buffer.
 */
import type { TextChunk } from '../utils/TextChunker';
export declare class StreamingChunker {
    private buffer;
    private absoluteOffset;
    private finalized;
    private cancelled;
    private maxChunkSize;
    private waiter;
    constructor(maxChunkSize?: number);
    append(text: string): void;
    finalize(): void;
    cancel(): void;
    /**
     * Returns the next chunk of complete sentence(s) up to
     * `maxChunkSize`. Blocks (via promise) until a sentence boundary
     * appears in the buffer, more text arrives, or finalize/cancel is
     * called.
     *
     * Returns `null` when the stream is fully consumed (finalized + buffer
     * drained) or cancelled.
     */
    getNextChunk(): Promise<TextChunk | null>;
    /**
     * Non-blocking peek: returns the next chunk if one is ready right
     * now, or `undefined` (not `null`) if the consumer should wait.
     * `null` means stream is done.
     */
    tryPeek(): TextChunk | null | undefined;
    /** Total chars appended so far. */
    get totalAppended(): number;
    /**
     * Try to produce a result synchronously. Returns `undefined` when
     * the consumer should block.
     */
    private tryTake;
    /**
     * Extract complete sentence(s) from the front of the buffer, up to
     * `maxChunkSize`. Returns null if no sentence boundary is found.
     */
    private extractReadyChunk;
    /**
     * Drain whatever remains. Returns null if buffer is empty.
     */
    private extractRemainder;
    /**
     * Wake the blocked consumer if one is waiting.
     */
    private wake;
}
