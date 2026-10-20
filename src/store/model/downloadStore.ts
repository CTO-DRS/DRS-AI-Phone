import type {ModelStore} from '../ModelStore';
// Barrel-routed ON PURPOSE: test suites mock the store barrel; a direct
// '../ModelStore' import would bypass their mocks and construct the real
// singleton (network fetch + DeviceInfo) inside every suite that renders
// a migrated component. Type-only import keeps the Pick<ModelStore,...>
// compile-time drift guard. Revisit at Phase 4 dissolution.
import {modelStore} from '../';
import {observable} from 'mobx';
import type {Model} from '../../utils/types';
import type {ErrorState} from '../../utils/errors';
import {downloadManager} from '../../services/downloads';

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
  // ── pass-through methods (move in B17..B19 — untouched by B16) ──
  checkSpaceAndDownload: (...args) => modelStore.checkSpaceAndDownload(...args),
  cancelDownload: (...args) => modelStore.cancelDownload(...args),
  pauseDownload: (...args) => modelStore.pauseDownload(...args),
  resumeDownload: (...args) => modelStore.resumeDownload(...args),
  retryDownload: (...args) => modelStore.retryDownload(...args),
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
