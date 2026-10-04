'use strict';

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

import {createComponentLogger} from '../utils/logger.js';
const log = createComponentLogger('SpeechStream', 'Api');
const DEFAULT_TARGET_CHARS = 300;

/**
 * Regex matching sentence-ending punctuation. Two alternations because
 * ASCII and CJK behave differently:
 *
 * - ASCII `[.!?]+` **requires** trailing whitespace. Without it we can't
 *   tell whether a terminal `.` is end-of-sentence or a mid-stream token
 *   that will grow into `3.14`, `Dr.`, `...`, etc. Waiting for the next
 *   whitespace is the reliable commit signal.
 *
 * - CJK `[。！？]+` **does not** require trailing whitespace. These
 *   characters are unambiguous sentence boundaries (not used inside
 *   words the way `.` is), and Chinese/Japanese prose typically runs
 *   sentences together with no space. Requiring whitespace would mean
 *   nothing ever flushes during a CJK stream — strictly worse than the
 *   per-sentence fallback the stream is meant to replace.
 *
 * `finalize()` flushes the tail regardless, so a stream that ends
 * without any matching punctuation still completes correctly.
 */
const SENTENCE_END_RE = /(?:[.!?]+\s+|[。！？]+\s*)/g;

/**
 * A batch queued for synthesis. `startOffset` is the absolute position
 * (in the consumer's accumulated `append()` input) where `text` begins
 * — used to translate chunk progress events into stream-relative
 * offsets for `onProgress` listeners.
 */

export class SpeechStreamImpl {
  // ── Tier 3 pass-through state (when engine supports streaming) ───
  engineStream = null;

  // ── Tier 1 adaptive-batcher state (fallback for OS engine) ───────
  buffer = '';
  queue = [];
  inflight = null;
  firstFlushDone = false;
  finalized = false;
  cancelled = false;
  firstError = null;
  drainResolvers = [];

  // Diagnostic state — used only for logging, not for control flow.
  streamStartTs = Date.now();
  batchCount = 0;
  lastBatchEndTs = null;
  totalAppendedChars = 0;
  progressListeners = [];
  progressUnsub = null;
  constructor(config) {
    this.synthesize = config.synthesize;
    this.stopFn = config.stop;
    this.subscribeProgress = config.subscribeProgress;
    this.targetChars = Math.max(
      1,
      config.options?.targetChars ?? DEFAULT_TARGET_CHARS,
    );
    this.onError = config.options?.onError;
    if (config.engineStreamFactory) {
      log.info('stream created: Tier 3 pass-through, t+0ms');
      this.engineStream = config.engineStreamFactory(config.options);
    } else {
      log.info(
        `stream created: Tier 1 batcher, targetChars=${this.targetChars}, t+0ms`,
      );
    }
  }
  onProgress(cb) {
    this.progressListeners.push(cb);

    // In Tier 3 mode, subscribe once to engine's chunk progress events
    // and translate to StreamProgressEvent. The engine stream emits
    // absolute offsets from StreamingChunker, so batchStartOffset = 0.
    if (this.engineStream && !this.progressUnsub && this.subscribeProgress) {
      this.progressUnsub = this.subscribeProgress(event => {
        const streamEvent = {
          chunkText: event.chunkText,
          streamRange: {
            start: event.textRange.start,
            end: event.textRange.end,
          },
          chunkIndex: event.chunkIndex,
          batchIndex: 0,
        };
        for (const listener of this.progressListeners) {
          try {
            listener(streamEvent);
          } catch (listenerErr) {
            log.warn('stream onProgress listener threw:', listenerErr);
          }
        }
      });
    }
    return () => {
      const idx = this.progressListeners.indexOf(cb);
      if (idx >= 0) {
        this.progressListeners.splice(idx, 1);
      }
      if (this.progressListeners.length === 0 && this.progressUnsub) {
        this.progressUnsub();
        this.progressUnsub = null;
      }
    };
  }
  append(text) {
    if (this.finalized || this.cancelled) {
      return;
    }
    if (!text) {
      return;
    }
    if (this.engineStream) {
      this.engineStream.append(text);
      return;
    }
    this.buffer += text;
    this.totalAppendedChars += text.length;
    log.debug(
      `append: +${text.length}, buffer=${this.buffer.length}, t+${this.rel()}ms`,
    );
    this.tryFlush();
  }

  /** Milliseconds since stream was created — compact origin for log lines. */
  rel() {
    return Date.now() - this.streamStartTs;
  }
  async finalize() {
    if (this.cancelled || this.finalized) {
      if (!this.engineStream) {
        return this.waitForDrain();
      }
      return;
    }
    this.finalized = true;
    if (this.engineStream) {
      try {
        await this.engineStream.finalize();
      } catch (err) {
        if (this.onError) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.onError(error);
        }
        throw err;
      } finally {
        this.cleanupProgressSub();
      }
      return;
    }
    log.info(
      `finalize: tailBuffer=${this.buffer.length}, totalAppended=${this.totalAppendedChars}, t+${this.rel()}ms`,
    );
    this.tryFlush();
    await this.waitForDrain();
    log.info(`drained: batches=${this.batchCount}, elapsed=${this.rel()}ms`);
    if (this.firstError) {
      throw this.firstError;
    }
  }
  async cancel() {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    if (this.engineStream) {
      this.cleanupProgressSub();
      try {
        await this.engineStream.cancel();
      } catch (err) {
        log.warn('Engine stream cancel failed:', err);
      }
      return;
    }
    this.buffer = '';
    this.queue = [];
    const resolvers = this.drainResolvers;
    this.drainResolvers = [];
    resolvers.forEach(r => r());
    try {
      await this.stopFn();
    } catch (err) {
      log.warn('Stop failed during cancel:', err);
    }
  }
  cleanupProgressSub() {
    if (this.progressUnsub) {
      this.progressUnsub();
      this.progressUnsub = null;
    }
  }

  /**
   * Decide whether to move text from the buffer to the batch queue.
   * Safe to call at any time; it's idempotent when nothing can flush.
   */
  tryFlush() {
    if (this.cancelled) {
      return;
    }
    // Never queue more than one batch ahead — keeps memory bounded and
    // preserves the underrun signal (inflight === null && queue empty).
    if (this.queue.length > 0) {
      return;
    }
    if (this.finalized) {
      if (this.buffer.length === 0) {
        return;
      }
      const startOffset = this.totalAppendedChars - this.buffer.length;
      const tail = this.buffer;
      this.buffer = '';
      this.enqueueBatch(tail, startOffset, 'finalize');
      return;
    }
    if (!this.firstFlushDone) {
      const split = extractFirstSentence(this.buffer);
      if (split) {
        const startOffset = this.totalAppendedChars - this.buffer.length;
        this.firstFlushDone = true;
        this.buffer = split.tail;
        this.enqueueBatch(split.head, startOffset, 'first-sentence');
      }
      return;
    }

    // Subsequent-flush policy: wait for size threshold OR underrun.
    const sizeThresholdHit = this.buffer.length >= this.targetChars;
    const underrun = this.inflight === null;
    if (!sizeThresholdHit && !underrun) {
      return;
    }
    const split = extractAllCompleteSentences(this.buffer);
    if (split) {
      const startOffset = this.totalAppendedChars - this.buffer.length;
      this.buffer = split.tail;
      this.enqueueBatch(
        split.head,
        startOffset,
        sizeThresholdHit ? 'target-chars' : 'underrun',
      );
    }
  }
  enqueueBatch(text, startOffset, reason) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    log.info(
      `flush[${reason}]: ${text.length} chars, buffer_after=${this.buffer.length}, t+${this.rel()}ms`,
    );
    this.queue.push({
      text,
      startOffset,
      batchIndex: this.batchCount,
    });
    this.pump();
  }

  /**
   * Advance the batch queue. At most one batch runs at a time. When a
   * batch finishes we re-check `tryFlush()` so the underrun guard (b)
   * can pick up buffered text that was waiting for the prior batch.
   */
  pump() {
    if (this.cancelled) {
      this.maybeResolveDrain();
      return;
    }
    if (this.inflight) {
      return;
    }
    if (this.queue.length === 0) {
      this.maybeResolveDrain();
      return;
    }
    const batch = this.queue.shift();
    this.batchCount += 1;
    const batchId = this.batchCount;
    const batchStartTs = Date.now();
    // Gap since the previous batch's audio finished playing. This is the
    // unhidden dead-air between batches — if it's large, it's the
    // first-chunk synth time of this batch (confirm with engine's
    // "Chunk done: inference=Xms" log below).
    const gapFromPrev =
      this.lastBatchEndTs !== null ? batchStartTs - this.lastBatchEndTs : null;
    log.info(
      `batch#${batchId} START: ${batch.text.length} chars` +
        (gapFromPrev !== null ? `, gap_since_prev_end=${gapFromPrev}ms` : '') +
        `, preview="${previewText(batch.text)}", t+${this.rel()}ms`,
    );
    const unsubscribeProgress = this.installProgressForwarder(batch);
    this.inflight = this.synthesize(batch.text)
      .catch(err => {
        const error = err instanceof Error ? err : new Error(String(err));
        if (!this.firstError) {
          this.firstError = error;
        }
        if (this.onError) {
          try {
            this.onError(error);
          } catch (cbErr) {
            log.warn('onError callback threw:', cbErr);
          }
        }
      })
      .then(() => {
        if (unsubscribeProgress) {
          try {
            unsubscribeProgress();
          } catch (e) {
            log.warn('unsubscribeProgress threw:', e);
          }
        }
        const endTs = Date.now();
        this.lastBatchEndTs = endTs;
        log.info(
          `batch#${batchId} DONE: synth+play=${endTs - batchStartTs}ms, t+${this.rel()}ms`,
        );
        this.inflight = null;
        this.pump();
        this.tryFlush();
      });
  }

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
  installProgressForwarder(batch) {
    if (!this.subscribeProgress || this.progressListeners.length === 0) {
      return null;
    }
    try {
      return this.subscribeProgress(event => {
        const streamEvent = {
          chunkText: event.chunkText,
          streamRange: {
            start: batch.startOffset + event.textRange.start,
            end: batch.startOffset + event.textRange.end,
          },
          chunkIndex: event.chunkIndex,
          batchIndex: batch.batchIndex,
        };
        for (const listener of this.progressListeners) {
          try {
            listener(streamEvent);
          } catch (listenerErr) {
            log.warn('stream onProgress listener threw:', listenerErr);
          }
        }
      });
    } catch (err) {
      log.warn('subscribeProgress threw, progress events disabled:', err);
      return null;
    }
  }
  async waitForDrain() {
    if (this.isIdle()) {
      return;
    }
    return new Promise(resolve => {
      this.drainResolvers.push(resolve);
    });
  }
  isIdle() {
    return (
      this.inflight === null &&
      this.queue.length === 0 &&
      this.buffer.length === 0
    );
  }
  maybeResolveDrain() {
    if (!this.isIdle() && !this.cancelled) {
      return;
    }
    if (this.drainResolvers.length === 0) {
      return;
    }
    const resolvers = this.drainResolvers;
    this.drainResolvers = [];
    resolvers.forEach(r => r());
  }
}

/**
 * Compact single-line preview of a batch for log lines. Strips newlines
 * and ellipsises past 40 chars so a batch log entry stays readable.
 */
function previewText(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat;
}

/**
 * Find the first sentence boundary (ASCII with trailing whitespace, or
 * CJK punct optionally followed by whitespace) and split the buffer
 * there. Returns null if no complete sentence boundary exists yet.
 */
function extractFirstSentence(text) {
  const re = /(?:[.!?]+\s+|[。！？]+\s*)/;
  const m = re.exec(text);
  if (!m) {
    return null;
  }
  const end = m.index + m[0].length;
  const head = text.slice(0, end);
  if (head.trim().length === 0) {
    return null;
  }
  return {
    head,
    tail: text.slice(end),
  };
}

/**
 * Split the buffer at the last `[.!?]+` followed by whitespace, so the
 * head contains as many complete sentences as possible and the tail
 * holds any still-streaming incomplete sentence.
 */
function extractAllCompleteSentences(text) {
  const re = new RegExp(SENTENCE_END_RE.source, 'g');
  let lastEnd = -1;
  let m;
  while ((m = re.exec(text)) !== null) {
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd === -1) {
    return null;
  }
  const head = text.slice(0, lastEnd);
  if (head.trim().length === 0) {
    return null;
  }
  return {
    head,
    tail: text.slice(lastEnd),
  };
}
//# sourceMappingURL=SpeechStream.js.map
