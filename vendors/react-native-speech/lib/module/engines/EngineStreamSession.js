"use strict";

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

import { StreamingChunker } from "./StreamingChunker.js";
import { createComponentLogger } from "../utils/logger.js";
const log = createComponentLogger('EngineStream', 'Engine');
export class EngineStreamSession {
  cancelled = false;
  stopSignalResolver = null;
  firstError = null;
  sessionStartTs = Date.now();
  chunkCount = 0;
  lastChunkEndTs = null;
  constructor(config) {
    this.config = config;
    this.chunker = new StreamingChunker(config.maxChunkSize);
    this.loopPromise = this.runLoop();
  }
  append(text) {
    if (this.cancelled) {
      return;
    }
    this.chunker.append(text);
  }
  async finalize() {
    this.chunker.finalize();
    await this.loopPromise;
    if (this.firstError) {
      throw this.firstError;
    }
  }
  async cancel() {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    this.chunker.cancel();
    if (this.stopSignalResolver) {
      this.stopSignalResolver();
      this.stopSignalResolver = null;
    }
    try {
      await this.config.stopPlayback();
    } catch (err) {
      log.warn('stopPlayback failed during cancel:', err);
    }
    await this.loopPromise.catch(() => {});
  }
  rel() {
    return Date.now() - this.sessionStartTs;
  }
  createStopSignal() {
    return new Promise(resolve => {
      this.stopSignalResolver = () => resolve(null);
    });
  }
  raceWithStop(promise, stopSignal) {
    return Promise.race([promise, stopSignal]);
  }
  async runLoop() {
    const {
      synthesizeChunk,
      playAudio,
      playbackOptions,
      postProcess
    } = this.config;
    const stopSignal = this.createStopSignal();
    log.info(`stream session started, t+0ms`);
    try {
      // Bootstrap: pull chunks until we find one that produces audio.
      // Engines may legitimately return an empty buffer for no-content
      // chunks (e.g. an isolated horizontal rule converted to `.`); we
      // skip those rather than ending the whole session.
      const bootstrap = await this.fetchNextWithAudio(synthesizeChunk, stopSignal);
      if (!bootstrap || this.cancelled) {
        return;
      }
      let currentChunk = bootstrap.chunk;
      let currentAudio = bootstrap.audio;
      let chunkIdx = 0;

      // Main loop: play current chunk while synthesizing next.
      while (true) {
        if (this.cancelled) {
          return;
        }
        const chunkStartTs = Date.now();
        this.chunkCount++;
        const gapFromPrev = this.lastChunkEndTs !== null ? chunkStartTs - this.lastChunkEndTs : null;
        log.info(`chunk#${this.chunkCount} START: ${currentChunk.text.length} chars` + (gapFromPrev !== null ? `, gap_since_prev=${gapFromPrev}ms` : '') + `, offset=${currentChunk.startIndex}, t+${this.rel()}ms`);
        if (postProcess) {
          postProcess(currentAudio);
        }
        this.emitProgress(currentChunk, chunkIdx);

        // Start fetching + synthesizing next chunk in background. Skips
        // any no-audio chunks until it finds one with audio (or chunker
        // drains).
        const prefetchPromise = this.fetchNextWithAudio(synthesizeChunk, stopSignal);

        // Play current chunk (concurrent with prefetch).
        await this.raceWithStop(playAudio(currentAudio, playbackOptions), stopSignal);
        if (this.cancelled) {
          return;
        }
        this.lastChunkEndTs = Date.now();
        log.info(`chunk#${this.chunkCount} DONE: play=${this.lastChunkEndTs - chunkStartTs}ms, t+${this.rel()}ms`);

        // Get prefetched result.
        const next = await prefetchPromise;
        if (!next || this.cancelled) {
          return;
        }
        currentChunk = next.chunk;
        currentAudio = next.audio;
        chunkIdx++;
      }
    } catch (err) {
      if (this.cancelled) {
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      if (!this.firstError) {
        this.firstError = error;
      }
      log.error(`stream session error: ${error.message}`);
    } finally {
      log.info(`stream session ended: chunks=${this.chunkCount}, elapsed=${this.rel()}ms`);
    }
  }

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
  async fetchNextWithAudio(synthesizeChunk, stopSignal) {
    while (true) {
      const chunk = await this.chunker.getNextChunk();
      if (!chunk || this.cancelled) {
        return null;
      }
      const audio = await this.raceWithStop(synthesizeChunk(chunk.text), stopSignal);
      if (!audio || this.cancelled) {
        return null;
      }
      if (audio.samples.length === 0) {
        log.debug(`skipping no-audio chunk (${chunk.text.length} chars), pulling next`);
        continue;
      }
      return {
        chunk,
        audio
      };
    }
  }
  emitProgress(chunk, chunkIndex) {
    if (!this.config.onChunkProgress) {
      return;
    }
    this.config.onChunkProgress({
      id: 0,
      chunkIndex,
      totalChunks: 0,
      chunkText: chunk.text,
      textRange: {
        start: chunk.startIndex,
        end: chunk.endIndex
      },
      progress: 0
    });
  }
}
//# sourceMappingURL=EngineStreamSession.js.map