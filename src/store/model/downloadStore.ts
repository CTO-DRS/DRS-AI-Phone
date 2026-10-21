import type {ModelStore} from '../ModelStore';
// Barrel-routed ON PURPOSE: test suites mock the store barrel; a direct
// '../ModelStore' import would bypass their mocks and construct the real
// singleton (network fetch + DeviceInfo) inside every suite that renders
// a migrated component. Type-only import keeps the Pick<ModelStore,...>
// compile-time drift guard. Revisit at Phase 4 dissolution.
import {modelStore, uiStore, hfStore, modelHubStore} from '../';
import {observable, runInAction} from 'mobx';
import {Alert} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import type {Model} from '../../utils/types';
import {
  ModelOrigin,
  ModelType,
} from '../../utils/types';
import type {HuggingFaceModel, ModelFile} from '../../utils/types';
import type {ErrorState} from '../../utils/errors';
import {createErrorState} from '../../utils/errors';
import {
  getMmprojFiles,
  getSHA256Hash,
  inferRepoFromModelId,
} from '../../utils';
import {logger} from '../../utils/logger';
import {t} from '../../locales';
import {
  downloadManager,
  DownloadCancelledError,
} from '../../services/downloads';

/**
 * downloadStore — Phase-1 scaffold (fix 4, stage 1 of 4).
 * See docs/audit-worklog.md for the full decomposition plan.
 *
 * ═══════════════════════════ MIGRATION CONTRACT ═══════════════════════════
 * ZERO-LOGIC pass-through: every member below delegates verbatim to the
 * modelStore singleton. No state, no behavior, no MobX observables of its
 * own — the god object remains the single source of truth until Phase 4.
 *
 * Domain: downloads + file/storage + provisional projection-file members
 * (owner-approved map, session 3):
 *   • download lifecycle/queue/progress/errors: checkSpaceAndDownload,
 *     cancelDownload, pauseDownload, resumeDownload, retryDownload,
 *     refreshDownloadStatuses, initializeDownloadStatus,
 *     verifyDownloadedModel, verifyingModelIds, getDownloadProgress,
 *     activeDownloads, isDownloading, downloadError, clearDownloadError
 *   • files/storage: getModelFullPath, resolveLocalModelPath,
 *     checkFileExists, deleteModel, removeInvalidLocalModels
 *   • HF entry point: downloadHFModel (composite — it calls addHFModel
 *     internally; the composition is the store's business, callers of
 *     downloadHFModel are download-domain callers)
 *   • projection file-status family (PROVISIONAL until Phase 3 review):
 *     getProjectionModelStatus, canDeleteProjectionModel,
 *     getDownloadedLLMsUsingProjectionModel
 *
 * Call-site migration (Phase 2+):
 *   import {modelStore} from '<barrel>';        // before
 *   import {downloadStore} from '<...>/store/model/downloadStore'; // after
 * Eligibility: a file migrates ONLY if after the swap zero `modelStore`
 * references remain (owner rule: no partial migrations).
 *
 * SEMANTIC TRAPS preserved verbatim (do not "fix" while migrating):
 *   • isDownloading is a GETTER RETURNING A FUNCTION — call shape is
 *     `downloadStore.isDownloading(modelId)`, NOT `downloadStore.isDownloading`.
 *   • deleteModel mutates the catalog list as a side effect (file deletion +
 *     list removal) — catalog callers of deleteModel stay catalog-domain
 *     callers until Phase 3 re-homing is reviewed.
 *
 * REHYDRATION CLAUSE (Phase 4 gate): when state physically moves here, the
 * persisted snapshot must be rehydrated through a VERSIONED key
 * (mobx-persist-store version bump) so a v1.41.0 upgrade never silently
 * drops or downgrades user preferences/downloads state. Losing a user's
 * session, downloads, or preferences = migration failure by definition.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const DOWNLOAD_MEMBERS = [
  'activeDownloads',
  'isDownloading',
  'downloadError',
  'verifyingModelIds',
  'checkSpaceAndDownload',
  'cancelDownload',
  'pauseDownload',
  'resumeDownload',
  'retryDownload',
  'clearDownloadError',
  'refreshDownloadStatuses',
  'initializeDownloadStatus',
  'verifyDownloadedModel',
  'getDownloadProgress',
  'getModelFullPath',
  'resolveLocalModelPath',
  'checkFileExists',
  'deleteModel',
  'removeInvalidLocalModels',
  'downloadHFModel',
  'getProjectionModelStatus',
  'canDeleteProjectionModel',
  'getDownloadedLLMsUsingProjectionModel',
] as const;

export type DownloadMember = (typeof DOWNLOAD_MEMBERS)[number];

/** Compile-time drift guard: ModelStore signature changes break this file. */
export type DownloadStore = Pick<ModelStore, DownloadMember>;

// ───────────── B16 (phase-4 4a): real state + download-status family ─────────────
// verifyingModelIds / downloadError are TRANSIENT states (§2 #5/#7 — never
// persisted), so their real state moves here as boxes (the B4/B8 pattern).
// The god object keeps writable accessor pairs (B10 shape) so every external
// consumer, suite and host sees identical state and reactivity.
const verifyingModelIdsBox = observable.box<string[]>([]);
const downloadErrorBox = observable.box<ErrorState | null>(null);

// ── B18 (phase-4 4a): real state + files/storage family ─────────────────────
// pendingLocalPathRecoveries moved verbatim off the god object (was a private
// Map there): recovered local-model paths awaiting persistence.
// resolveLocalModelPath collects (model -> re-anchored path) here instead of
// writing each one in its own runInAction; a container change invalidates
// every local path at once, so the batch flush turns N full store
// serializations into one. Not in the persist list, so it is never serialized
// itself.
const pendingLocalPathRecoveries: Map<Model, string> = new Map();

/**
 * Applies every path recovered since the last flush in one runInAction, so a
 * container change that invalidates N local paths persists once rather than N
 * times. Called after refreshDownloadStatuses settles; entries for models no
 * longer in the store are dropped.
 *
 * B18: internal to downloadStore — the ج34 cast through the god object's
 * private surface died with the file-family migration. The catalog read goes
 * through the facade (ج32: no static downloadStore→catalogStore import); it
 * dies with the facade family at 4e.
 */
function flushPendingLocalPathRecoveries() {
  if (pendingLocalPathRecoveries.size === 0) {
    return;
  }
  const recoveries = Array.from(pendingLocalPathRecoveries.entries());
  pendingLocalPathRecoveries.clear();
  runInAction(() => {
    for (const [model, recoveredPath] of recoveries) {
      if (modelStore.models.includes(model)) {
        model.fullPath = recoveredPath;
      }
    }
  });
}

// ج35 (B17): the projection-download pair (_downloadProjectionModelIfNeeded /
// _downloadDraftModelIfNeeded) is still god-resident until B20 — reached
// through the facade (narrow structural view, ج18 precedent).
type GodDownloadB20 = {
  _downloadProjectionModelIfNeeded: (model: Model) => Promise<void>;
  _downloadDraftModelIfNeeded: (model: Model) => Promise<void>;
};

/**
 * mutationSync (B17) — the downloadManager.setCallbacks composition moved
 * verbatim out of the god constructor. The god constructor calls this export
 * (ج25-family wiring — dies at 4e when bootstrap becomes the sole composition
 * root). Callback bodies read the catalog through the facade barrel and
 * dispatch the B19/B13 members through it too (ج35b/ج26-tail family — no
 * static downloadStore→catalogStore import: it would close the B14 load-order
 * cycle). downloadError writes hit THIS store's own box.
 */
export function mutationSync() {
  downloadManager.setCallbacks({
    onProgress: (modelId, progress) => {
      const model = modelStore.models.find(m => m.id === modelId);
      if (model) {
        runInAction(() => {
          model.progress = progress.progress;
          model.downloadSpeed = `${progress.speed} ${uiStore.l10n.common.downloadETA}: ${progress.eta}`;
        });
      }
    },
    onComplete: async modelId => {
      const model = modelStore.models.find(m => m.id === modelId);
      if (model) {
        runInAction(() => {
          model.progress = 100;
        });

        // Verification gate: the model only counts as installed after its
        // file passes the integrity checks (size + checksum when available).
        // B19: verifyDownloadedModel is real on THIS store — internal
        // dispatch (ج35b died with the verification-family migration).
        const verified = await downloadStore.verifyDownloadedModel(model);
        if (!verified) {
          return; // error state already surfaced by the gate
        }

        runInAction(() => {
          model.isDownloaded = true;
          model.downloadedAt = Date.now();
        });

        // Fetch and persist GGUF metadata after download completes
        // Skip for projection models (CLIP) - they have different metadata
        // structure. ج26-tail: GGUF family lives on catalogStore — facade
        // dispatch (no static import, see the B14 load-order lesson).
        if (model.modelType !== ModelType.PROJECTION) {
          await modelStore.fetchAndPersistGGUFMetadata(model);
        }
      }
    },
    onError: (modelId, error) => {
      console.error('Download error for model', modelId, error);
      const model = modelStore.models.find(m => m.id === modelId);
      if (model) {
        runInAction(() => {
          model.progress = 0;
          model.isDownloaded = false;
        });
      }

      const errorState = createErrorState(error, 'download', 'huggingface', {
        modelId,
      });

      runInAction(() => {
        downloadErrorBox.set(errorState);
      });
    },
  });
}

export const downloadStore: DownloadStore = {
  // ── B16 (phase-4 4a): real state (boxes above) ──
  get verifyingModelIds(): string[] {
    return verifyingModelIdsBox.get();
  },
  set verifyingModelIds(value: string[]) {
    verifyingModelIdsBox.set(value);
  },
  get downloadError(): ErrorState | null {
    return downloadErrorBox.get();
  },
  set downloadError(value: ErrorState | null) {
    downloadErrorBox.set(value);
  },
  // ── B16 (phase-4 4a): real implementations (download status + progress) ──
  /**
   * Reactive list of in-flight downloads. Each entry carries the Model object
   * plus the latest formatted progress strings so observers can render a
   * banner / sheet / list row without re-deriving anything per frame.
   */
  get activeDownloads(): Array<{
    modelId: string;
    model: Model;
    progress: number;
    bytesDownloaded: number;
    bytesTotal: number;
    speedLabel: string;
    etaLabel: string;
  }> {
    return downloadManager.activeJobs.map(job => ({
      modelId: job.model.id,
      model: job.model,
      progress: job.state.progress?.progress ?? 0,
      bytesDownloaded: job.state.progress?.bytesDownloaded ?? 0,
      bytesTotal: job.state.progress?.bytesTotal ?? 0,
      speedLabel: job.state.progress?.speed ?? '',
      etaLabel: job.state.progress?.eta ?? '',
    }));
  },
  /**
   * SEMANTIC TRAP preserved verbatim: a GETTER RETURNING A FUNCTION —
   * call shape is `downloadStore.isDownloading(modelId)`, NOT
   * `downloadStore.isDownloading`.
   */
  get isDownloading(): (modelId: string) => boolean {
    return (modelId: string) => downloadManager.isDownloading(modelId);
  },
  getDownloadProgress(modelId: string) {
    return downloadManager.getDownloadProgress(modelId);
  },
  clearDownloadError() {
    downloadErrorBox.set(null);
  },
  refreshDownloadStatuses: async () => {
    // Await every check: callers (notably initializeStore, which then runs
    // removeInvalidLocalModels) depend on isDownloaded being settled before
    // they prune.
    //
    // Each check is isolated: a single failure (e.g. an RNFS error, or a
    // local model with no fullPath) must not abort the others, and must
    // leave isDownloaded untouched rather than defaulting it to false — an
    // indeterminate result is not evidence the file is gone.
    // B18: checkFileExists is real on THIS store — internal dispatch
    // (ج34 died with the file-family migration).
    await Promise.all(
      modelStore.models.map(model =>
        downloadStore.checkFileExists(model).catch(error => {
          console.warn(
            '[ModelStore] Could not determine file status for model:',
            model.id,
            error,
          );
        }),
      ),
    );
    // Persist every path re-anchored during the pass in a single write —
    // module-local since B18 (the ج34 god-object cast is dead).
    flushPendingLocalPathRecoveries();
  },
  initializeDownloadStatus: async () => {
    await downloadStore.refreshDownloadStatuses();
  },
  // ── B17 (phase-4 4a): real implementations (download lifecycle). ج35:
  // the B20 projection-download pair + ج34's getModelFullPath still dispatch
  // through the facade until their batches.
  checkSpaceAndDownload: async (modelId: string) => {
    const model = modelStore.models.find(m => m.id === modelId);
    // Skip if model is undefined, already downloaded, local or doesn't have a
    // download URL
    // TODO: we need a better way to handle this. Why this could ever happen?
    if (
      !model ||
      model.isDownloaded ||
      model.isLocal ||
      model.origin === ModelOrigin.LOCAL ||
      !model.downloadUrl
    ) {
      return;
    }

    try {
      // B18: file-path owner is THIS store — internal dispatch
      // (ج34-tail died with the file-family migration).
      const destinationPath = await downloadStore.getModelFullPath(model);
      const authToken = hfStore.shouldUseToken ? hfStore.hfToken : null;
      await downloadManager.startDownload(model, destinationPath, authToken, {
        networkType: modelHubStore.wifiOnlyDownloads ? 'WIFI' : 'ANY',
      });

      // For vision models, automatically download the projection model
      // ج35: B20 pair — facade dispatch until then.
      const god = modelStore as unknown as GodDownloadB20;
      await god._downloadProjectionModelIfNeeded(model);
      await god._downloadDraftModelIfNeeded(model);
    } catch (err) {
      if (err instanceof DownloadCancelledError) {
        // User cancelled — not a failure. Don't surface an error and don't
        // chain the projection-model download for multimodal models.
        return;
      }

      console.error('Failed to start download:', err);

      // Create proper error state for the snackbar system
      const errorState = createErrorState(err, 'download', 'huggingface', {
        modelId,
      });

      runInAction(() => {
        downloadErrorBox.set(errorState);
      });

      // Re-throw so the caller knows the download failed
      throw err;
    }
  },
  cancelDownload: async (modelId: string) => {
    await downloadManager.cancelDownload(modelId);
    const model = modelStore.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.isDownloaded = false;
        model.progress = 0;
      });
    }
    downloadStore.refreshDownloadStatuses();
  },
  pauseDownload: async (modelId: string): Promise<boolean> =>
    downloadManager.pauseDownload(modelId),
  resumeDownload: async (modelId: string): Promise<boolean> =>
    downloadManager.resumeDownload(modelId),
  retryDownload: () => {
    const modelId = downloadErrorBox.get()?.metadata?.modelId;
    downloadStore.clearDownloadError();

    if (modelId) {
      // Find the model and retry download.
      // ج28 shape: dispatched through the god facade, not this.* —
      // ModelStore.test overrides god members (retryDownload spies
      // checkSpaceAndDownload) and the facade is the dispatch surface those
      // overrides live on. Dies at 4d with the facade family.
      const model = modelStore.models.find(m => m.id === modelId);
      if (model) {
        modelStore.checkSpaceAndDownload(model.id);
      }
    }
  },
  // ── B18 (phase-4 4a): real implementations (files/storage family) ──
  /**
   * Full path where the model file is or should be stored.
   *
   * IMPORTANT: This logic is duplicated in native Swift code for iOS Shortcuts
   * See: ios/DRS AI/AppIntents/AssistantDataProvider.swift - parseModelPath()
   * method. If we modify this function, we need to update the Swift version as
   * well.
   *
   * @param model - The model object containing necessary metadata (origin,
   *   filename, author, etc.)
   * @returns Promise<string> - The full path where the model file is or should
   *   be stored
   * @throws Error if filename is undefined or if fullPath is undefined for
   *   local models
   */
  getModelFullPath: async (model: Model): Promise<string> => {
    // For local models, use the fullPath
    if (model.isLocal || model.origin === ModelOrigin.LOCAL) {
      if (!model.fullPath) {
        throw new Error('Full path is undefined for local model');
      }
      return downloadStore.resolveLocalModelPath(model);
    }

    if (!model.filename) {
      throw new Error('Model filename is undefined');
    }

    // For preset models, check both old and new paths
    if (model.origin === ModelOrigin.PRESET) {
      const author = model.author || 'unknown';
      const repo = model.repo || 'unknown';

      // Very old path (deprecated, for backwards compatibility)
      const veryOldPath = `${RNFS.DocumentDirectoryPath}/${model.filename}`;

      // Old path (deprecated, for backwards compatibility)
      const oldPath = `${RNFS.DocumentDirectoryPath}/models/preset/${author}/${model.filename}`;

      // New path structure includes repository name
      const newPath = `${RNFS.DocumentDirectoryPath}/models/preset/${author}/${repo}/${model.filename}`;

      // Check if file exists at very old path first (for backwards
      // compatibility)
      try {
        if (await RNFS.exists(veryOldPath)) {
          return veryOldPath;
        }
      } catch (err) {
        logger.debug('Error checking very old preset path:', err);
      }

      // Check if file exists at old path (for backwards compatibility)
      try {
        if (await RNFS.exists(oldPath)) {
          return oldPath;
        }
      } catch (err) {
        logger.debug('Error checking old preset path:', err);
      }

      // Otherwise use new path
      return newPath;
    }

    // For HF models, use author/repo/model structure with backwards
    // compatibility
    if (model.origin === ModelOrigin.HF) {
      const author = model.author || 'unknown';

      // Try to get repo from model, or infer from model.id, or fallback to
      // 'unknown'
      let repo = model.repo;
      if (!repo) {
        repo = inferRepoFromModelId(model.id) || 'unknown';
      }

      // Old path structure (for backwards compatibility)
      const oldPath = `${RNFS.DocumentDirectoryPath}/models/hf/${author}/${model.filename}`;

      // New path structure includes repository name
      const newPath = `${RNFS.DocumentDirectoryPath}/models/hf/${author}/${repo}/${model.filename}`;

      // Check if file exists at old path (backwards compatibility)
      // This handles: existing downloads, models after reset, models after
      // app update
      try {
        if (await RNFS.exists(oldPath)) {
          return oldPath;
        }
      } catch (err) {
        logger.debug('Error checking old HF model path:', err);
      }

      // Otherwise use new path
      return newPath;
    }

    // Fallback (shouldn't reach here)
    console.error('should not reach here. model: ', model);
    return `${RNFS.DocumentDirectoryPath}/${model.filename}`;
  },

  /**
   * Re-anchors a LOCAL model's stored absolute path onto the current app
   * container. (Doc comment moved verbatim from the god object at B18.)
   *
   * `fullPath` is persisted verbatim when the file is imported. On iOS the app
   * container UUID can change (OS upgrade, backup/restore, reinstall), which
   * invalidates every stored absolute path even though the file is still on
   * disk under the new container. Imported models are copied into
   * `<DocumentDirectoryPath>/models/local`, so the segment from `models/local`
   * onward is stable and can be re-joined to the *current* documents path.
   *
   * Returns the recovered path (persistence is batched via
   * flushPendingLocalPathRecoveries) when the original is missing but the
   * re-anchored one exists; otherwise returns the stored path unchanged so
   * existing not-found handling still applies.
   *
   * IMPORTANT: this re-anchoring is duplicated in native Swift for iOS
   * Shortcuts — see the LOCAL branch of parseModelPath() in
   * ios/DRS AI/AppIntents/AssistantDataProvider.swift. Keep the two in sync;
   * the shared '/models/local/' marker must match on both sides.
   */
  resolveLocalModelPath: async (model: Model): Promise<string> => {
    const storedPath = model.fullPath!;

    // A rejected exists() must not escape: getModelFullPath is treated as
    // non-throwing by every consumer, and deleteModel awaits it *outside* its
    // try (a throw would abort the delete before the unlink). An
    // indeterminate check is degraded to "not present" — recovery is
    // attempted, and if it is also indeterminate we fall through to the
    // stored path so the existing not-found handling still applies.
    const pathExists = async (path: string): Promise<boolean> => {
      try {
        return await RNFS.exists(path);
      } catch (err) {
        console.warn(
          '[ModelStore] exists() check failed while resolving local path:',
          {modelId: model.id, path, err},
        );
        return false;
      }
    };

    if (await pathExists(storedPath)) {
      return storedPath;
    }

    const marker = '/models/local/';
    const markerIndex = storedPath.indexOf(marker);
    if (markerIndex === -1) {
      return storedPath;
    }

    const recoveredPath = `${RNFS.DocumentDirectoryPath}${storedPath.slice(
      markerIndex,
    )}`;
    if (recoveredPath === storedPath || !(await pathExists(recoveredPath))) {
      return storedPath;
    }

    logger.debug(
      '[ModelStore] Recovered local model path after container change:',
      {modelId: model.id, from: storedPath, to: recoveredPath},
    );
    // Defer the write: flushPendingLocalPathRecoveries applies every recovery
    // from a refresh pass in a single runInAction. Callers use the returned
    // path immediately, so deferring persistence changes nothing they observe.
    pendingLocalPathRecoveries.set(model, recoveredPath);
    return recoveredPath;
  },

  checkFileExists: async (model: Model) => {
    const filePath = await downloadStore.getModelFullPath(model);
    const exists = await RNFS.exists(filePath);

    // Don't mark as downloaded if currently downloading
    if (exists && !downloadManager.isDownloading(model.id)) {
      if (!model.isDownloaded) {
        logger.debug(
          'checkFileExists: marking as downloaded - this should not happen:',
          model.id,
        );
        runInAction(() => {
          model.isDownloaded = true;
        });
      }
    } else {
      runInAction(() => {
        model.isDownloaded = false;
      });
    }
  },

  /**
   * Catalog WRITE via the facade (ج32: no static downloadStore→catalogStore
   * import — the god's B10 accessor pair remains the dispatch surface until
   * 4e). Everything else is real downloadStore logic since B18.
   */
  removeInvalidLocalModels: () => {
    runInAction(() => {
      modelStore.models = modelStore.models.filter(model => {
        // Keep all non-local models (preset and HF)
        if (!(model.isLocal || model.origin === ModelOrigin.LOCAL)) {
          return true;
        }
        // For local models, isDownloaded==true means the file exists,
        // otherwise it's invalid. Callers must let refreshDownloadStatuses
        // settle first — it re-anchors stale container paths
        // (resolveLocalModelPath) so a recoverable model is not treated as
        // missing here.
        if (model.isDownloaded) {
          return true;
        }
        // Dropping a local model is unrecoverable (there is no download URL
        // to re-fetch from), so make it visible rather than silent.
        console.warn(
          '[ModelStore] Removing local model whose file is no longer present:',
          {modelId: model.id, name: model.name, fullPath: model.fullPath},
        );
        return false;
      });
    });
  },

  // ── B19 (phase-4 4a): real implementations (verification + delete + HF
  // entry). Cross-domain dispatches stay on the facade (ج32: catalog; ج28:
  // override surface) — they die with their families at 4d/4e/B20.
  /**
   * Post-download verification gate.
   *
   * 1. File must exist at the expected path.
   * 2. Size must match the HF LFS record within 0.1% (cheap, always run).
   * 3. SHA-256 must match the LFS oid when the record exposes one and the
   *    file is ≤ MAX_HASH_VERIFY_BYTES (hashing multi-GB files on-device is
   *    slow and the native hasher is known to be unreliable on huge files —
   *    above the threshold the size check is the honest verification).
   *
   * On failure the partial/corrupt file is deleted and a download error state
   * with `reason: 'verification'` is surfaced so the user can re-download.
   */
  verifyDownloadedModel: async (model: Model): Promise<boolean> => {
    const MAX_HASH_VERIFY_BYTES = 4 * 1024 * 1024 * 1024;
    runInAction(() => {
      verifyingModelIdsBox.set([
        ...verifyingModelIdsBox.get(),
        model.id,
      ]);
    });
    try {
      const filePath = await downloadStore.getModelFullPath(model);
      if (!(await RNFS.exists(filePath))) {
        throw new Error('Downloaded model file is missing');
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
      const expectedHash = model.hfModelFile?.lfs?.oid;
      if (expectedHash && stat.size <= MAX_HASH_VERIFY_BYTES) {
        const actualHash = await getSHA256Hash(filePath);
        if (
          actualHash &&
          actualHash.toLowerCase() !== expectedHash.toLowerCase()
        ) {
          throw new Error('Model file checksum mismatch');
        }
      }
      return true;
    } catch (err) {
      console.error('Model verification failed:', err);
      // Remove the unusable file so the user can cleanly re-download.
      try {
        const filePath = await downloadStore.getModelFullPath(model);
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
        downloadErrorBox.set(errorState);
      });
      return false;
    } finally {
      runInAction(() => {
        verifyingModelIdsBox.set(
          verifyingModelIdsBox.get().filter(id => id !== model.id),
        );
      });
    }
  },

  /**
   * Deletes a model: removes the file, and for local models also removes the
   * list entry; releases the context when the deleted model is the active
   * one; orphans-check for projection models; clears a stale draft selection.
   *
   * Cross-domain dispatches stay on the facade at B19 (ج32: no static
   * downloadStore→catalogStore import; runtime reads/writes ride the god's
   * B8 accessors) — catalog re-homes at 4e, runtime at B22, B20 pair at B20.
   */
  deleteModel: async (model: Model) => {
    // id should work as well, as long as we are differentiating between
    // models by origin.
    const modelIndex = modelStore.models.findIndex(
      m => m.id === model.id && m.origin === model.origin,
    );
    if (modelIndex === -1) {
      return;
    }
    const _model = modelStore.models[modelIndex];

    // Special handling for projection models
    if (_model.modelType === ModelType.PROJECTION) {
      const canDeleteResult = modelStore.canDeleteProjectionModel(_model.id);
      if (!canDeleteResult.canDelete) {
        throw new Error(
          canDeleteResult.reason || 'Cannot delete projection model',
        );
      }

      // Disable vision for dependent models when their projection model is
      // deleted
      if (
        canDeleteResult.dependentModels &&
        canDeleteResult.dependentModels.length > 0
      ) {
        // Use Promise.allSettled to handle potential errors gracefully
        await Promise.allSettled(
          canDeleteResult.dependentModels.map(dependentModel =>
            modelStore.setModelVisionEnabled(dependentModel.id, false),
          ),
        );
      }
    }

    // Store all projection model IDs that this LLM could use
    const projectionModelIds: string[] = [];
    if (_model.supportsMultimodal) {
      // Add the default projection model
      if (_model.defaultProjectionModel) {
        projectionModelIds.push(_model.defaultProjectionModel);
      }
      // Add all compatible projection models (in case user downloaded
      // additional ones)
      if (_model.compatibleProjectionModels) {
        _model.compatibleProjectionModels.forEach(id => {
          if (!projectionModelIds.includes(id)) {
            projectionModelIds.push(id);
          }
        });
      }
    }

    const filePath = await downloadStore.getModelFullPath(_model);
    if (_model.isLocal || _model.origin === ModelOrigin.LOCAL) {
      // Local models are always removed from the list, when the file is
      // deleted.

      // Check if we need to release context (if this model is currently
      // active)
      const needsContextRelease = modelStore.activeModelId === _model.id;

      // Remove model from list first
      runInAction(() => {
        modelStore.models.splice(modelIndex, 1);
      });

      // Release context if needed - this will handle all state cleanup
      if (needsContextRelease) {
        await modelStore.releaseContext(true); // Clear active model and all related state
      }

      // Delete the file from internal storage
      try {
        await RNFS.unlink(filePath);
      } catch (err) {
        console.error('Failed to delete local model file:', err);
      }
    } else {
      // Non-local models are not removed from the list, when the file is
      // deleted.
      logger.debug('deleting: ', filePath);

      try {
        if (filePath) {
          await RNFS.unlink(filePath);

          // Check if we need to release context (if this model is currently
          // active)
          const needsContextRelease = modelStore.activeModelId === _model.id;

          // Update model state first
          runInAction(() => {
            _model.progress = 0;
            _model.isDownloaded = false; // Mark as not downloaded after successful deletion
          });

          // Release context if needed - this will handle all state cleanup
          if (needsContextRelease) {
            await modelStore.releaseContext(true); // Clear active model and all related state
          }
        } else {
          console.error("Failed to delete, file doesn't exist: ", filePath);
        }
        downloadStore.refreshDownloadStatuses();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    }

    // After deleting an LLM, check if any of its projection models have
    // become orphaned
    if (
      projectionModelIds.length > 0 &&
      _model.modelType !== ModelType.PROJECTION
    ) {
      await modelStore.cleanupOrphanedProjectionModels(projectionModelIds);
    }

    if (modelStore.contextInitParams.selectedDraftModelId === _model.id) {
      modelStore.setSelectedDraftModel(undefined);
    }
  },

  /**
   * HF entry point (composite — it calls addHFModel internally; the
   * composition is the store's business, callers of downloadHFModel are
   * download-domain callers).
   *
   * Catalog dispatches (addHFModel / setModelVisionEnabled) stay on the
   * facade (ج32 — dies with the facade family at 4e); the download kick-off
   * keeps the ج28 facade shape (override surface — dies at 4d).
   */
  downloadHFModel: async (
    hfModel: HuggingFaceModel,
    modelFile: ModelFile,
    options?: {
      enableVision?: boolean;
      projectionModelId?: string; // User-selected projection model
    },
  ) => {
    try {
      const newModel = await modelStore.addHFModel(hfModel, modelFile);
      if (!newModel) {
        throw new Error('Failed to add model to store');
      }

      // Set vision preference based on user choice
      if (newModel.supportsMultimodal && options?.enableVision !== undefined) {
        modelStore.setModelVisionEnabled(newModel.id, options.enableVision);
      }

      // Override default projection model with user selection if provided
      if (newModel.supportsMultimodal && options?.projectionModelId) {
        // Validate that selected projection model exists in repository
        const mmprojFiles = getMmprojFiles(hfModel.siblings || []);
        const selectedExists = mmprojFiles.some(
          file =>
            `${hfModel.id}/${file.rfilename}` === options.projectionModelId,
        );

        if (selectedExists) {
          runInAction(() => {
            newModel.defaultProjectionModel = options.projectionModelId;
          });
        } else {
          console.warn(
            'Selected projection model not found in repository, using auto-determined default',
          );
        }
      }

      // Wait a bit to ensure the projection model is added to the store
      // This is needed because addHFModel adds mmproj models asynchronously
      await new Promise(resolve => setTimeout(resolve, 200));

      // Use the centralized download method which handles mmproj automatically
      // ج28 shape: dispatched through the god facade — ModelStore.test
      // overrides god members and the facade is the dispatch surface those
      // overrides live on. Dies at 4d with the facade family.
      modelStore.checkSpaceAndDownload(newModel.id);

      // The error handling is now done in the downloadManager callbacks
    } catch (error) {
      // Only handle errors related to the initial setup before the download
      // starts
      console.error('Failed to set up HF model download:', error);
      Alert.alert(
        uiStore.l10n.errors.downloadSetupFailedTitle,
        t(uiStore.l10n.errors.downloadSetupFailedMessage, {
          message: (error as Error).message,
        }),
      );
    }
  },

  // ── pass-through methods (move in B20 — untouched by B19) ──
  getProjectionModelStatus: (...args) =>
    modelStore.getProjectionModelStatus(...args),
  canDeleteProjectionModel: (...args) =>
    modelStore.canDeleteProjectionModel(...args),
  getDownloadedLLMsUsingProjectionModel: (...args) =>
    modelStore.getDownloadedLLMsUsingProjectionModel(...args),
};
