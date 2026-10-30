import {runInAction} from 'mobx';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {getSHA256Hash} from '../../utils';
import {sha256FileChunked} from '../../utils/fileSha256';
import {downloadManager} from '../../services/downloads';
import {createErrorState} from '../../utils/errors-ui';
import {logger} from '../../utils/logger';
import type {Model} from '../../utils/types';

// Type-only import: keeps the runtime dependency graph acyclic while the
// verifier reads/writes the observable fields of the store it belongs to.
import type {ModelStore} from '../ModelStore';

/**
 * Background SHA-256 verification of downloaded model files
 * (AI-02 / AI-03), extracted from ModelStore (ARCH-02 / CODE-01
 * tranche 1).
 *
 * Models larger than MAX_HASH_VERIFY_BYTES (and legacy installs predating
 * the hash cache) cannot / did not hash-verify synchronously. They are
 * queued here and verified one at a time with the JS chunked hasher
 * (utils/fileSha256.ts). A verified model gets `model.hash` cached, so
 * later load-time checks never re-hash it.
 *
 * All observable state (the queue ids, benchmark flag, download error,
 * model rows) lives on the host store; MobX tracking/action semantics are
 * unchanged. The store keeps delegating members with the same names and
 * signatures as before the extraction.
 */
export class BackgroundHashVerifier {
  /** Sequential drain: one model hashed at a time, ever. */
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly host: ModelStore) {}

  /**
   * Enqueue a model for background SHA-256 verification. No-op when the
   * model is not downloaded, has no LFS oid to verify against, already has
   * a cached hash, or is already queued. Verification is skipped while a
   * benchmark owns the device (it re-runs on the next enqueue/drain).
   */
  enqueue = (
    modelId: string,
    reason: 'oversize' | 'legacy' | 'load' = 'legacy',
  ): void => {
    const model = this.host.models.find(m => m.id === modelId);
    if (!model?.isDownloaded || downloadManager.isDownloading(modelId)) {
      return;
    }
    if (!model.hfModelFile?.lfs?.oid || model.hash) {
      return; // nothing to verify against, or already verified
    }
    if (this.host.backgroundHashVerifyingIds.includes(modelId)) {
      return;
    }
    if (this.host.benchmarkActive) {
      logger.debug(
        `[ModelStore] hash verification deferred during benchmark: ${modelId} (${reason})`,
      );
      return;
    }
    runInAction(() => {
      this.host.backgroundHashVerifyingIds = [
        ...this.host.backgroundHashVerifyingIds,
        modelId,
      ];
    });
    logger.debug(
      `[ModelStore] queued background hash verification: ${modelId} (${reason})`,
    );
    this.chain = this.chain
      .then(() => this.processQueue())
      .catch(err =>
        console.error('[ModelStore] background hash chain error:', err),
      );
  };

  /**
   * Drain queued verifications sequentially until the queue is empty.
   * Runs exactly one model at a time to bound disk/CPU pressure.
   */
  private processQueue = async (): Promise<void> => {
    while (this.host.backgroundHashVerifyingIds.length > 0) {
      const modelId = this.host.backgroundHashVerifyingIds[0];
      const model = this.host.models.find(m => m.id === modelId);
      try {
        if (
          !model?.isDownloaded ||
          !model.hfModelFile?.lfs?.oid ||
          model.hash
        ) {
          // State changed while queued (deleted, verified elsewhere, …).
          continue;
        }
        if (this.host.benchmarkActive) {
          // Yield the device to the benchmark; the drain below re-queues.
          return;
        }
        await this.verifyModel(model);
      } finally {
        runInAction(() => {
          this.host.backgroundHashVerifyingIds =
            this.host.backgroundHashVerifyingIds.filter(id => id !== modelId);
        });
      }
    }
  };

  /**
   * Verify one model's file against its LFS oid in the background.
   * Re-runs the size gate first (cheap), then hashes: native hasher for
   * files ≤ MAX_HASH_VERIFY_BYTES, JS chunked hasher above it. A mismatch
   * deletes the file and surfaces the standard verification error state —
   * identical to the synchronous gate's failure path.
   */
  private verifyModel = async (model: Model): Promise<void> => {
    const MAX_HASH_VERIFY_BYTES = 4 * 1024 * 1024 * 1024;
    try {
      const filePath = await this.host.getModelFullPath(model);
      if (!(await RNFS.exists(filePath))) {
        logger.debug(
          `[ModelStore] background verify skipped (file gone): ${model.id}`,
        );
        return;
      }
      const stat = await RNFS.stat(filePath);
      const expectedSize = model.hfModelFile?.lfs?.size;
      if (expectedSize && expectedSize > 0) {
        const diffRatio = Math.abs(stat.size - expectedSize) / expectedSize;
        if (diffRatio > 0.001) {
          throw new Error(
            `Model file size mismatch (${stat.size} vs ${expectedSize} bytes)`,
          );
        }
      }
      const expectedHash = model.hfModelFile?.lfs?.oid!;
      const actualHash =
        stat.size <= MAX_HASH_VERIFY_BYTES
          ? await getSHA256Hash(filePath)
          : await sha256FileChunked(filePath);
      if (
        !actualHash ||
        actualHash.toLowerCase() !== expectedHash.toLowerCase()
      ) {
        throw new Error('Model file checksum mismatch');
      }
      runInAction(() => {
        model.hash = actualHash;
      });
      logger.debug(`[ModelStore] background hash verified OK: ${model.id}`);
    } catch (err) {
      console.error(
        `[ModelStore] background hash verify failed: ${model.id}`,
        err,
      );
      // Mirror the synchronous gate's failure path: drop the unusable file
      // and surface the verification error so the user can re-download.
      try {
        const filePath = await this.host.getModelFullPath(model);
        if (await RNFS.exists(filePath)) {
          await RNFS.unlink(filePath);
        }
      } catch (cleanupErr) {
        console.error('Failed to clean up unverified model file:', cleanupErr);
      }
      const errorState = createErrorState(
        err instanceof Error ? err : new Error(String(err)),
        'download',
        'huggingface',
        {modelId: model.id, reason: 'verification'},
      );
      runInAction(() => {
        model.progress = 0;
        model.isDownloaded = false;
        this.host.downloadError = errorState;
      });
    }
  };

  /**
   * Scan downloaded models for missing hash caches (legacy installs and
   * oversize verifications that were interrupted by a restart) and enqueue
   * them. Called once per store init.
   */
  drain = (): void => {
    for (const model of this.host.models) {
      if (
        model.isDownloaded &&
        model.hfModelFile?.lfs?.oid &&
        !model.hash &&
        !this.host.backgroundHashVerifyingIds.includes(model.id)
      ) {
        this.enqueue(model.id, 'legacy');
      }
    }
  };
}
