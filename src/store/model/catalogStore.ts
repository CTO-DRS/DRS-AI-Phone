import type {ModelStore} from '../ModelStore';
// Barrel-routed ON PURPOSE: test suites mock the store barrel; a direct
// '../ModelStore' import would bypass their mocks and construct the real
// singleton (network fetch + DeviceInfo) inside every suite that renders
// a migrated component. Type-only import keeps the Pick<ModelStore,...>
// compile-time drift guard. Revisit at Phase 4 dissolution.
import {modelStore, serverStore} from '../';
import {observable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ModelOrigin} from '../../utils/types';
import type {Model} from '../../utils/types';
import type {CompletionParams} from '../../utils/completionTypes';
import type {Tier} from '../../services/deviceRules/types';
import {filterProjectionModels} from '../../utils/multimodalHelpers';

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
 *
 * ═══════════════ B10 (phase-4 4a): STATE MOVES HOME ═══════════════
 * The nine catalog state members physically live here as of B10:
 *   • five persist keys (models, version, deviceTier, rulesVersion,
 *     lastUsedModelId) as observable boxes — the catalogStore:v2 persist
 *     root (makePersistable, called from the ModelStore constructor chain)
 *     owns them, satisfying §3-أ (persist keys stay writable fields of
 *     their persist owner; boxes are the field mechanism for a plain-object
 *     store, and mobx-persist-store hydrates through the setters below).
 *   • four derived views (displayModels, availableModels, lastUsedModel,
 *     remoteModels) as real computations over the boxes + serverStore.
 * The god object keeps writable-computed accessor pairs delegating here
 * (B2/B7/B8 pattern) so every external consumer, suite and host sees
 * identical state and reactivity.
 *
 * ج23 (B10): catalogHost marker guard on the five relocated persist keys
 * — the ج22 shape. With the host injected (production + unmocked suites:
 * the constructor ran) the box IS the state; in barrel-mocked suites no
 * constructor ever runs, so the central mock owns the state and reads fall
 * through the barrel binding. Death: 4e (forced) with early per-suite death
 * in 4b/4c as callers migrate to sub-store mocks.
 * ج24 (B10): the same guard on the four relocated derived views — the
 * central mock carries its own displayModels/availableModels/lastUsedModel
 * computations (and lacks remoteModels), so the fallback preserves exact
 * suite behavior. Same death schedule as ج23.
 * ج25 (B10): the v2-root + legacy-import call-sites in the god constructor
 * — composition wiring, dies at 4e when bootstrap becomes the sole
 * composition root (§8 lifecycle table, final row).
 * ═══════════════════════════════════════════════════════════════════
 */

// ───────────── B10 (phase-4 4a): host marker + state boxes ─────────────
/**
 * DI marker (ModelStore constructor). Unlike the B1 runtime host this host
 * carries NO members: the five catalog persist keys moved physically into
 * this module's boxes, so nothing is written through the host. It exists
 * only to separate the two worlds for read guards ج23/ج24 (see the file
 * header). Must run before the v2 persist root hydrates.
 */
export interface CatalogHost {
  /** Structural identity of the wiring god object (marker only). */
  readonly host: unknown;
}

let catalogHost: CatalogHost | null = null;

export function injectCatalogHost(host: CatalogHost): void {
  catalogHost = host;
}

const modelsBox = observable.box<Model[]>([]);
const versionBox = observable.box<number | undefined>(undefined);
const deviceTierBox = observable.box<Tier | null>(null);
const rulesVersionBox = observable.box<string | null>(null);
const lastUsedModelIdBox = observable.box<string | undefined>(undefined);

/**
 * Factory for remote Model cards — moved verbatim from ModelStore.ts with
 * its only consumer (the remoteModels view below). Private helper, not part
 * of the store contract.
 */
function createRemoteModel(params: {
  serverId: string;
  serverName: string;
  remoteModelId: string;
  modelName: string;
}): Model {
  const emptyChatTemplate = {
    name: '',
    addBosToken: false,
    addEosToken: false,
    bosToken: '',
    eosToken: '',
    chatTemplate: '',
    addGenerationPrompt: false,
  };
  return {
    id: `${params.serverId}/${params.remoteModelId}`,
    name: params.modelName,
    author: params.serverName,
    origin: ModelOrigin.REMOTE,
    isDownloaded: true,
    isLocal: false,
    size: 0,
    params: 0,
    downloadUrl: '',
    hfUrl: '',
    progress: 0,
    filename: '',
    defaultChatTemplate: emptyChatTemplate,
    chatTemplate: emptyChatTemplate,
    defaultStopWords: [],
    stopWords: [],
    defaultCompletionSettings: {} as CompletionParams,
    completionSettings: {} as CompletionParams,
    serverId: params.serverId,
    serverName: params.serverName,
    remoteModelId: params.remoteModelId,
  };
}

/**
 * One-time legacy import (extraction-plan §3, part 2 — catalog half).
 *
 * Reads the god object's legacy `ModelStore` persistence key (written by
 * builds ≤ v1.41.x with all twelve keys), distributes the five catalog
 * payloads into the boxes, and leaves the key untouched. Fail-safe: any
 * read/parse error skips silently so the import retries next launch — the
 * legacy key is never modified before a successful FULL import.
 *
 * Ordering (constructor chain): v2 root hydration FIRST (second launch
 * onward the `catalogStore:v2` key is authoritative), then this import —
 * whose payload only carries catalog keys on the FIRST post-upgrade launch
 * (the god root re-saves with seven runtime keys immediately), making the
 * import idempotent.
 *
 * Part 3 (legacy-key cleanup) is deferred to B22/4e: the key still carries
 * the seven runtime persist payloads until runtimeStore:v2 exists.
 */
export async function importLegacyCatalogState(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem('ModelStore');
    if (!raw) {
      return; // fresh install, or legacy payload already migrated to v2 keys
    }
    const legacy = JSON.parse(raw) as Record<string, unknown>;
    runInAction(() => {
      if (typeof legacy.models !== 'undefined') {
        modelsBox.set(legacy.models as Model[]);
      }
      if (typeof legacy.version !== 'undefined') {
        versionBox.set(legacy.version as number);
      }
      if (typeof legacy.deviceTier !== 'undefined') {
        deviceTierBox.set(legacy.deviceTier as Tier);
      }
      if (typeof legacy.rulesVersion !== 'undefined') {
        rulesVersionBox.set(legacy.rulesVersion as string);
      }
      if (typeof legacy.lastUsedModelId !== 'undefined') {
        lastUsedModelIdBox.set(legacy.lastUsedModelId as string);
      }
    });
  } catch {
    // Fail-safe (§3.2): corrupt/unreadable legacy key — retry next launch.
    // Deliberately silent: persistence diagnostics belong to the storage
    // layer, and this must never abort the constructor chain.
  }
}

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
  // ── B10 (phase-4 4a): real state (boxes above; v2 persist root) ──
  // ج23 guard: box when the constructor ran (production + unmocked suites),
  // barrel fallback in barrel-mocked suites (ج22 shape — see file header).
  get models(): Model[] {
    return catalogHost ? modelsBox.get() : modelStore.models;
  },
  set models(value: Model[]) {
    runInAction(() => {
      modelsBox.set(value);
    });
  },
  get version(): number | undefined {
    return catalogHost ? versionBox.get() : modelStore.version;
  },
  set version(value: number | undefined) {
    runInAction(() => {
      versionBox.set(value);
    });
  },
  get deviceTier(): Tier | null {
    return catalogHost ? deviceTierBox.get() : modelStore.deviceTier;
  },
  set deviceTier(value: Tier | null) {
    runInAction(() => {
      deviceTierBox.set(value);
    });
  },
  get rulesVersion(): string | null {
    return catalogHost ? rulesVersionBox.get() : modelStore.rulesVersion;
  },
  set rulesVersion(value: string | null) {
    runInAction(() => {
      rulesVersionBox.set(value);
    });
  },
  get lastUsedModelId(): string | undefined {
    return catalogHost ? lastUsedModelIdBox.get() : modelStore.lastUsedModelId;
  },
  set lastUsedModelId(value: string | undefined) {
    runInAction(() => {
      lastUsedModelIdBox.set(value);
    });
  },
  // ── B10 (phase-4 4a): derived views — real computations over the boxes ──
  /** Returns models with projection models filtered out for display purposes. */
  get displayModels(): Model[] {
    if (!catalogHost) {
      return modelStore.displayModels; // ج24 — barrel-mocked suites
    }
    return [...filterProjectionModels(this.models), ...this.remoteModels];
  },
  /**
   * Returns available (i.e. downloaded models) models with projection models
   * filtered out, plus remote models from configured servers.
   */
  get availableModels(): Model[] {
    if (!catalogHost) {
      return modelStore.availableModels; // ج24 — barrel-mocked suites
    }
    const localAvailable = filterProjectionModels(
      this.models.filter(
        model =>
          // Include models that are either local or downloaded
          model.isLocal ||
          model.origin === ModelOrigin.LOCAL ||
          model.isDownloaded,
      ),
    );
    return [...localAvailable, ...this.remoteModels];
  },
  get lastUsedModel(): Model | undefined {
    if (!catalogHost) {
      return modelStore.lastUsedModel; // ج24 — barrel-mocked suites
    }
    return this.lastUsedModelId
      ? this.models.find(m => m.id === this.lastUsedModelId && m.isDownloaded)
      : undefined;
  },
  /**
   * Derived from `serverStore.userSelectedModels` and `serverStore.servers` —
   * not from `serverModels`, so the list a server currently advertises does not
   * change which cards exist. Remote models are never stored in the persisted
   * `models` array.
   */
  get remoteModels(): Model[] {
    if (!catalogHost) {
      return modelStore.remoteModels; // ج24 — barrel-mocked suites
    }
    const models: Model[] = [];
    for (const selected of serverStore.userSelectedModels) {
      const server = serverStore.servers.find(s => s.id === selected.serverId);
      if (!server) {
        continue;
      }
      // Use the remote model ID as the display name
      models.push(
        createRemoteModel({
          serverId: selected.serverId,
          serverName: server.name,
          remoteModelId: selected.remoteModelId,
          modelName: selected.remoteModelId,
        }),
      );
    }
    return models;
  },
  // ── pass-through methods (move in B11..B15 — untouched by B10) ──
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
