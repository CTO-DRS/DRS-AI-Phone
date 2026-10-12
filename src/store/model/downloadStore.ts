import {modelStore, ModelStore} from '../ModelStore';

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

export const downloadStore: DownloadStore = {
  get activeDownloads() {
    return modelStore.activeDownloads;
  },
  get isDownloading() {
    return modelStore.isDownloading;
  },
  get downloadError() {
    return modelStore.downloadError;
  },
  get verifyingModelIds() {
    return modelStore.verifyingModelIds;
  },
  checkSpaceAndDownload: (...args) => modelStore.checkSpaceAndDownload(...args),
  cancelDownload: (...args) => modelStore.cancelDownload(...args),
  pauseDownload: (...args) => modelStore.pauseDownload(...args),
  resumeDownload: (...args) => modelStore.resumeDownload(...args),
  retryDownload: (...args) => modelStore.retryDownload(...args),
  clearDownloadError: (...args) => modelStore.clearDownloadError(...args),
  refreshDownloadStatuses: (...args) =>
    modelStore.refreshDownloadStatuses(...args),
  initializeDownloadStatus: (...args) =>
    modelStore.initializeDownloadStatus(...args),
  verifyDownloadedModel: (...args) => modelStore.verifyDownloadedModel(...args),
  getDownloadProgress: (...args) => modelStore.getDownloadProgress(...args),
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
