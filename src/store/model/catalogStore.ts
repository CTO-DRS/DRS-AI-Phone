import {modelStore, ModelStore} from '../ModelStore';

/**
 * catalogStore — Phase-1 scaffold (fix 4, stage 1 of 4).
 * See docs/audit-worklog.md for the full decomposition plan.
 *
 * ═══════════════════════════ MIGRATION CONTRACT ═══════════════════════════
 * ZERO-LOGIC pass-through to the modelStore singleton (until Phase 4).
 *
 * Domain: model list, search/filter inputs, HF discovery, model metadata,
 * preset/device-rules resolution (owner-approved map, session 3):
 *   • list + views: models, displayModels, availableModels
 *   • provenance: version, rulesVersion, deviceTier
 *   • preset pipeline: resolvePresetModels, reconcilePresets, mergeModelLists
 *   • list mutation: addHFModel, addLocalModel, resetModels,
 *     removeModelFromList, removeModelByFullPath (pure models.splice —
 *     code evidence line 2968), registerOnboardingAssistantModel
 *   • metadata: updateModelName/resetModelName, updateModelChatTemplate/
 *     resetModelChatTemplate, updateModelStopWords/resetModelStopWords,
 *     updateModelHash, fetchAndPersistGGUFMetadata,
 *     fetchAndUpdateModelFileDetails, isModelAvailable
 *   • remote-source catalog: remoteModels, setRemoteModel,
 *     lastUsedModelId, lastUsedModel
 *   • capability metadata: healDraftVisionClassification,
 *     setModelVisionEnabled, getModelVisionPreference, setReasoningOverride,
 *     recordReasoningObserved
 *   • projection compatibility family (PROVISIONAL until Phase 3 review):
 *     getCompatibleProjectionModels, getDefaultProjectionModel,
 *     setDefaultProjectionModel, getLLMsUsingProjectionModel,
 *     hasRequiredProjectionModel
 *
 * Call-site migration (Phase 3): same rule as downloadStore — a file
 * migrates only if zero `modelStore` references remain after the swap.
 *
 * KNOWN CROSS-DOMAIN OVERLAPS (documented, not silent):
 *   • deleteModel (downloadStore) also splices this catalog — Phase 3 will
 *     re-home the list mutation behind a single owner.
 *   • downloadHFModel (downloadStore) calls addHFModel (here) internally —
 *     the composition stays inside the god object until Phase 4.
 *
 * REHYDRATION CLAUSE (Phase 4 gate): the persisted model list + metadata
 * snapshots must rehydrate through a VERSIONED persistence key; losing or
 * downgrading a user's model metadata/preferences on upgrade = failure.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const CATALOG_MEMBERS = [
  'models',
  'displayModels',
  'availableModels',
  'version',
  'rulesVersion',
  'deviceTier',
  'remoteModels',
  'lastUsedModel',
  'lastUsedModelId',
  'resolvePresetModels',
  'reconcilePresets',
  'mergeModelLists',
  'addHFModel',
  'addLocalModel',
  'resetModels',
  'removeModelFromList',
  'removeModelByFullPath',
  'registerOnboardingAssistantModel',
  'updateModelName',
  'resetModelName',
  'updateModelChatTemplate',
  'resetModelChatTemplate',
  'updateModelStopWords',
  'resetModelStopWords',
  'updateModelHash',
  'fetchAndPersistGGUFMetadata',
  'fetchAndUpdateModelFileDetails',
  'isModelAvailable',
  'setRemoteModel',
  'healDraftVisionClassification',
  'setModelVisionEnabled',
  'getModelVisionPreference',
  'setReasoningOverride',
  'recordReasoningObserved',
  'getCompatibleProjectionModels',
  'getDefaultProjectionModel',
  'setDefaultProjectionModel',
  'getLLMsUsingProjectionModel',
  'hasRequiredProjectionModel',
] as const;

export type CatalogMember = (typeof CATALOG_MEMBERS)[number];

/** Compile-time drift guard: ModelStore signature changes break this file. */
export type CatalogStore = Pick<ModelStore, CatalogMember>;

export const catalogStore: CatalogStore = {
  get models() {
    return modelStore.models;
  },
  get displayModels() {
    return modelStore.displayModels;
  },
  get availableModels() {
    return modelStore.availableModels;
  },
  get version() {
    return modelStore.version;
  },
  get rulesVersion() {
    return modelStore.rulesVersion;
  },
  get deviceTier() {
    return modelStore.deviceTier;
  },
  get remoteModels() {
    return modelStore.remoteModels;
  },
  get lastUsedModel() {
    return modelStore.lastUsedModel;
  },
  get lastUsedModelId() {
    return modelStore.lastUsedModelId;
  },
  resolvePresetModels: (...args) => modelStore.resolvePresetModels(...args),
  reconcilePresets: (...args) => modelStore.reconcilePresets(...args),
  mergeModelLists: (...args) => modelStore.mergeModelLists(...args),
  addHFModel: (...args) => modelStore.addHFModel(...args),
  addLocalModel: (...args) => modelStore.addLocalModel(...args),
  resetModels: (...args) => modelStore.resetModels(...args),
  removeModelFromList: (...args) => modelStore.removeModelFromList(...args),
  removeModelByFullPath: (...args) => modelStore.removeModelByFullPath(...args),
  registerOnboardingAssistantModel: (...args) =>
    modelStore.registerOnboardingAssistantModel(...args),
  updateModelName: (...args) => modelStore.updateModelName(...args),
  resetModelName: (...args) => modelStore.resetModelName(...args),
  updateModelChatTemplate: (...args) =>
    modelStore.updateModelChatTemplate(...args),
  resetModelChatTemplate: (...args) =>
    modelStore.resetModelChatTemplate(...args),
  updateModelStopWords: (...args) => modelStore.updateModelStopWords(...args),
  resetModelStopWords: (...args) => modelStore.resetModelStopWords(...args),
  updateModelHash: (...args) => modelStore.updateModelHash(...args),
  fetchAndPersistGGUFMetadata: (...args) =>
    modelStore.fetchAndPersistGGUFMetadata(...args),
  fetchAndUpdateModelFileDetails: (...args) =>
    modelStore.fetchAndUpdateModelFileDetails(...args),
  isModelAvailable: (...args) => modelStore.isModelAvailable(...args),
  setRemoteModel: (...args) => modelStore.setRemoteModel(...args),
  healDraftVisionClassification: (...args) =>
    modelStore.healDraftVisionClassification(...args),
  setModelVisionEnabled: (...args) => modelStore.setModelVisionEnabled(...args),
  getModelVisionPreference: (...args) =>
    modelStore.getModelVisionPreference(...args),
  setReasoningOverride: (...args) => modelStore.setReasoningOverride(...args),
  recordReasoningObserved: (...args) =>
    modelStore.recordReasoningObserved(...args),
  getCompatibleProjectionModels: (...args) =>
    modelStore.getCompatibleProjectionModels(...args),
  getDefaultProjectionModel: (...args) =>
    modelStore.getDefaultProjectionModel(...args),
  setDefaultProjectionModel: (...args) =>
    modelStore.setDefaultProjectionModel(...args),
  getLLMsUsingProjectionModel: (...args) =>
    modelStore.getLLMsUsingProjectionModel(...args),
  hasRequiredProjectionModel: (...args) =>
    modelStore.hasRequiredProjectionModel(...args),
};
