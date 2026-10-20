import type {ModelStore} from '../ModelStore';
// Barrel-routed ON PURPOSE: test suites mock the store barrel; a direct
// '../ModelStore' import would bypass their mocks and construct the real
// singleton (network fetch + DeviceInfo) inside every suite that renders
// a migrated component. Type-only import keeps the Pick<ModelStore,...>
// compile-time drift guard. Revisit at Phase 4 dissolution.
import {modelStore, uiStore, hfStore, modelHubStore} from '../';
import {observable, runInAction} from 'mobx';
import type {Model} from '../../utils/types';
import {ModelOrigin, ModelType} from '../../utils/types';
import type {ErrorState} from '../../utils/errors';
import {createErrorState} from '../../utils/errors';
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

// ج34 (B16): flushPendingLocalPathRecoveries is still private on the god
// object — narrow structural view (the ج18 precedent). Dies at B18 when the
// file-family migrates.
type GodDownloadPrivates = {
  flushPendingLocalPathRecoveries: () => void;
};

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
        // ج35b: verifyDownloadedModel is B19 — facade dispatch until then.
        const verified = await modelStore.verifyDownloadedModel(model);
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
    await Promise.all(
      modelStore.models.map(model =>
        modelStore.checkFileExists(model).catch(error => {
          console.warn(
            '[ModelStore] Could not determine file status for model:',
            model.id,
            error,
          );
        }),
      ),
    );
    // Persist every path re-anchored during the pass in a single write.
    // ج34: file-family member still private on the god object until B18
    // (narrow structural view, ج18 precedent).
    (
      modelStore as unknown as GodDownloadPrivates
    ).flushPendingLocalPathRecoveries();
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
      // ج34: file-path owner still on the god object until B18.
      const destinationPath = await modelStore.getModelFullPath(model);
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
  // ── pass-through methods (move in B18..B19 — untouched by B17) ──
  verifyDownloadedModel: (...args) => modelStore.verifyDownloadedModel(...args),
  getModelFullPath: (...args) => modelStore.getModelFullPath(...args),
  resolveLocalModelPath: (...args) => modelStore.resolveLocalModelPath(...args),
  checkFileExists: (...args) => modelStore.checkFileExists(...args),
  deleteModel: (...args) => modelStore.deleteModel(...args),
  removeInvalidLocalModels: (...args) =>
    modelStore.removeInvalidLocalModels(...args),
  downloadHFModel: (...args) => modelStore.downloadHFModel(...args),
  getProjectionModelStatus: (...args) =>
    modelStore.getProjectionModelStatus(...args),
  canDeleteProjectionModel: (...args) =>
    modelStore.canDeleteProjectionModel(...args),
  getDownloadedLLMsUsingProjectionModel: (...args) =>
    modelStore.getDownloadedLLMsUsingProjectionModel(...args),
};
