import type {ModelStore} from '../ModelStore';
// Barrel-routed ON PURPOSE: test suites mock the store barrel; a direct
// '../ModelStore' import would bypass their mocks and construct the real
// singleton (network fetch + DeviceInfo) inside every suite that renders
// a migrated component. Type-only import keeps the Pick<ModelStore,...>
// compile-time drift guard. Revisit at Phase 4 dissolution.
import {modelStore, serverStore} from '../';
import {observable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ModelOrigin, ModelType} from '../../utils/types';
import type {Model} from '../../utils/types';
import type {ChatTemplateConfig} from '../../utils/types';
import type {HuggingFaceModel, ModelFile} from '../../utils/types';
import type {CompletionParams} from '../../utils/completionTypes';
import {
  DeviceRules,
  DeviceSignals,
  RuleCandidate,
  RuleDraft,
  Tier,
} from '../../services/deviceRules/types';
import {filterProjectionModels, getRecommendedProjectionModel} from '../../utils/multimodalHelpers';
import {hfAsModel, getMmprojFiles, deepMerge, inferRepoFromModelId, getSHA256Hash, parseSizeLabel} from '../../utils';
import {isDraftOnlyModel} from '../../utils/mtp';
import {loadLlamaModelInfo} from 'llama.rn';
import type {LlamaContext} from 'llama.rn';
import {getOriginalModelName} from '../../utils/formatters';
import {fetchModelFilesDetails} from '../../api/hf';
import {OpenAICompletionEngine} from '../../api/completionEngines';
import {detectThinkingCapability} from '../../utils/thinkingCapabilityDetection';
import type {ReasoningCapability} from '../../utils/reasoningCapability';
import {ProjectionModelManager} from './ProjectionModelManager';
import type {CompletionEngine} from '../../utils/completionTypes';
import type {RemoteSessionBinding} from '../../utils/types';
import {downloadManager} from '../../services/downloads';
import {getLocalModelDefaultSettings, getHFDefaultSettings} from '../../utils/chat';
import {logger} from '../../utils/logger';
import {classify, ClassifyPlatform} from '../../services/deviceRules/classify';
import {deriveUrl, parseDeviceRules} from '../../services/deviceRules/parse';
import {fetchRules} from '../../services/deviceRules/rules';
import {readDeviceSignals} from '../../services/deviceRules/signals';
import type {OnboardingAssistantModelEntry} from '../onboarding/onboardingAssistants';
import androidRulesRaw from '../bundledDeviceRules/rules.android.json';
import iosRulesRaw from '../bundledDeviceRules/rules.ios.json';
import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {v4 as uuidv4} from 'uuid';

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
 *
 * B11 (phase-4 4a): the list-mutation + preset-pipeline members moved home —
 * nine public members plus resolvePresetModels (travels with the manager:
 * its only callers are the manager itself and the pass-through) and the four
 * preset privates. DraftRulesManager DISSOLVED here: its host usages all
 * co-moved (deviceTier/rulesVersion writes → this module's boxes;
 * resolvePresetModels/reconcilePresets calls → members below), so the class
 * became module functions and its file was deleted. The god object keeps
 * verbatim reverse delegations (B8 pattern) until 4d. New documented bridges:
 * ج26 download-status calls (die B16), ج27 GGUF calls (die B13).
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

// ───────────── B11 (phase-4 4a): preset pipeline — DraftRulesManager dissolved ─────────────
// The manager (audit F-12) re-homes into the catalog domain it always served:
// every one of its host usages co-moves with this batch — the deviceTier /
// rulesVersion writes land on THIS module's own boxes, and the
// resolvePresetModels / reconcilePresets calls land on members defined below.
// The class file dies; the four methods become module functions with verbatim
// bodies. resolvePresets / upgradeToFetchedRules are EXPORTED because the god
// object's initializeStore (dissolves at B23) reaches them through private
// reverse delegations (B8 pattern); candidateToPair / draftToStub stay
// module-private (their only consumer, resolvePresetModels, co-moved).
function catalogCandidateToPair(
  candidate: RuleCandidate,
): {hfModel: HuggingFaceModel; modelFile: ModelFile} {
  const modelFile: ModelFile = {
    rfilename: candidate.hfFilename,
    url: deriveUrl(candidate.hfRepo, candidate.hfFilename),
    size: candidate.sizeBytes,
  };
  const siblings: ModelFile[] | undefined = candidate.mmproj
    ? [
        {rfilename: candidate.hfFilename, size: candidate.sizeBytes},
        {
          rfilename: candidate.mmproj.hfFilename,
          url: deriveUrl(
            candidate.mmproj.hfRepo,
            candidate.mmproj.hfFilename,
          ),
          size: candidate.mmproj.sizeBytes,
        },
      ]
    : undefined;
  const hfModel = {
    id: candidate.hfRepo,
    author: candidate.hfRepo.split('/')[0],
    url: `https://huggingface.co/${candidate.hfRepo}`,
    specs: {gguf: {total: candidate.params ?? 0}},
    siblings,
  } as unknown as HuggingFaceModel;
  return {hfModel, modelFile};
}

function catalogDraftToStub(draft: RuleDraft): Model {
  const modelFile: ModelFile = {
    rfilename: draft.hfFilename,
    url: deriveUrl(draft.hfRepo, draft.hfFilename),
    size: draft.sizeBytes,
  };
  const hfModel = {
    id: draft.hfRepo,
    author: draft.hfRepo.split('/')[0],
    url: `https://huggingface.co/${draft.hfRepo}`,
    specs: {gguf: {total: 0}},
    siblings: undefined,
  } as unknown as HuggingFaceModel;
  return {...hfAsModel(hfModel, modelFile), modelType: ModelType.DRAFT};
}

// Bump when the migration logic that re-merges the persisted model list
// changes. Crossing this version runs the one-time prune-and-reconcile.
// B23: moved here from the god object (version semantics are catalog state
// since B10; the initializeStore dissolve reads it in bootstrap).
export const MODEL_LIST_VERSION = 15;

export async function catalogResolvePresets(): Promise<Model[]> {
  try {
    const signals = await readDeviceSignals();
    const bundledRaw = Platform.OS === 'ios' ? iosRulesRaw : androidRulesRaw;
    const rules = parseDeviceRules(bundledRaw, DeviceInfo.getVersion());
    const tier = classify(
      signals,
      rules.classifier,
      Platform.OS as ClassifyPlatform,
    );
    runInAction(() => {
      // Owner-direct writes (ج21 shape): the manager now lives in the module
      // that owns these boxes — the god-host round trip dies with the move.
      deviceTierBox.set(tier);
      rulesVersionBox.set(rules.rulesVersion);
    });
    return catalogStore.resolvePresetModels(rules, signals);
  } catch (error) {
    console.warn('[ModelStore] preset resolution failed:', error);
    return [];
  }
}

export async function catalogUpgradeToFetchedRules(): Promise<void> {
  try {
    const fetched = await fetchRules(DeviceInfo.getVersion());
    if (!fetched) {
      return;
    }
    const signals = await readDeviceSignals();
    const tier = classify(
      signals,
      fetched.classifier,
      Platform.OS as ClassifyPlatform,
    );
    runInAction(() => {
      deviceTierBox.set(tier);
      rulesVersionBox.set(fetched.rulesVersion);
    });
    catalogStore.reconcilePresets(
      catalogStore.resolvePresetModels(fetched, signals),
    );
  } catch (error) {
    console.warn('[ModelStore] fetched-rules upgrade failed:', error);
  }
}

// ج27 (B11): GGUF-family member still private on the god object, reached
// through a narrow structural view — the ج18 precedent (GodObjectPrivates in
// runtimeStore.ts). ✅ DIED AT B13: the GGUF family moved home; the cast and
// this type are retired (kept as a tombstone comment only).

// ج30 (B13): healDraftVisionClassification reads/writes
// pendingProjectionCleanupIds — a runtime-owned persist key still resident on
// the god object until B22 (§3-أ: persist keys stay god-object fields until
// runtimeStore:v2 exists). Access goes through the barrel binding — this is
// the PRODUCER side of the documented cleanupQueueBridge (catalog→runtime→
// download). The hop dies at B22 when the key migrates to runtimeStore:v2.

/**
 * Load GGUF metadata for downloaded models that don't have it yet.
 * Runs in background, doesn't block startup.
 * (Private member of the god object — module function here, the B8 pattern;
 * callers: resetModels below and initializeStore through the god's private
 * reverse delegation until B23.)
 */
export function catalogLoadMissingGGUFMetadata() {
  const modelsNeedingMetadata = catalogStore.models.filter(
    m =>
      m.isDownloaded &&
      !m.ggufMetadata &&
      m.modelType !== ModelType.PROJECTION,
  );

  if (modelsNeedingMetadata.length === 0) {
    return;
  }

  // Fetch in background, don't block startup
  (async () => {
    for (const model of modelsNeedingMetadata) {
      try {
        await catalogStore.fetchAndPersistGGUFMetadata(model);
      } catch (error) {
        // Log but continue - not critical for startup
        console.warn(
          '[ModelStore] Failed to fetch metadata for',
          model.name,
          error,
        );
      }
    }
  })();
}

// ج31 (B14): ✅ DIED AT B15 — the narrow PM view and its barrel fallback are
// gone: catalogStore constructs and exports THE ProjectionModelManager
// instance (module bottom), so the vision members call it directly.

// ج32 (B14): setRemoteModel's runtime writes (engine / activeRemoteBinding /
// setActiveModel / releaseContext) dispatch through the god facade instead of
// a static runtimeStore import. A static import here closes a load-order
// cycle (runtimeStore ← catalogStore ← runtimeStore) that broke the
// requireActual factories of suites mocking this module; the facade hop is
// the ج28 shape (dispatch surface those suites and overrides live on) and
// reaches the identical owner state through the god's B8 accessor pairs.
// Dies at 4d with the facade's reverse delegations.
type GodRuntimeWrites = {
  releaseContext: (clearActiveModel?: boolean) => Promise<string>;
  engine: CompletionEngine | undefined;
  activeRemoteBinding: RemoteSessionBinding | undefined;
  setActiveModel: (modelId: string) => void;
};

/**
 * Update model thinking capabilities based on the loaded context.
 * (Private member of the god object — module function here, the B8 pattern;
 * runtimeStore's proceedWithInitialization imports it directly since B14 —
 * the ج18 member-half cast died with the move.)
 */
export async function catalogUpdateModelThinkingCapabilities(
  ctx: LlamaContext,
  model: Model,
) {
  try {
    const storeModel = catalogStore.models.find(m => m.id === model.id);
    if (!storeModel) {
      return;
    }

    // Detection is the 'detected' writer; it must not override a user
    // declaration or a learned flip (precedence: user > learned > detected).
    if (
      storeModel.reasoning?.source === 'user' ||
      storeModel.reasoning?.source === 'learned'
    ) {
      return;
    }

    const result = await detectThinkingCapability(ctx);

    runInAction(() => {
      // Keep the deprecated boolean + tags in sync for back-compat readers.
      storeModel.supportsThinking = result.supported;
      if (result.thinkingStartTag) {
        storeModel.thinkingStartTag = result.thinkingStartTag;
      }
      if (result.thinkingEndTag) {
        storeModel.thinkingEndTag = result.thinkingEndTag;
      }
      storeModel.reasoning = {
        isReasoning: result.supported ? 'yes' : 'no',
        source: 'detected',
        supportsEffort: false,
        effortValues: [],
        effortSource: 'none',
      };
    });
  } catch (error) {
    console.error('Error updating model thinking capabilities:', error);
    // Continue execution - thinking capability detection is not critical
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
  // ── B11 (phase-4 4a): real implementations (moved from the god object).
  // Bodies verbatim; `this.*` reaches the members and boxes of THIS store.
  // Cross-scope calls go through the barrel binding (mocked in suites):
  // ج26 = initializeDownloadStatus / refreshDownloadStatuses (die B16),
  // ج27 = fetchAndPersistGGUFMetadata / loadMissingGGUFMetadata (die B13).

  // Materialize the device-tier preset list from rules. Each thin candidate is
  // turned into the minimal pair hfAsModel reads (catalogCandidateToPair), so
  // the result is origin:HF, identical to an HF-browser add. Multimodal
  // candidates also push their mmproj projector stub (mirrors addHFModel) so
  // the projection is resolvable for download. Deduped by model.id
  // (author/repo/filename), first wins.
  resolvePresetModels(
    rules: DeviceRules,
    signals: DeviceSignals,
  ): Model[] {
    const tier = classify(
      signals,
      rules.classifier,
      Platform.OS as ClassifyPlatform,
    );
    const flat = rules.tiers[tier].models.flatMap(candidate => {
      const {hfModel, modelFile} = catalogCandidateToPair(candidate);
      const llm = hfAsModel(hfModel, modelFile);
      let named = candidate.displayName
        ? {...llm, name: candidate.displayName}
        : llm;

      const extras: Model[] = [];
      if (named.supportsMultimodal) {
        const projModels = getMmprojFiles(hfModel.siblings || []).map(file =>
          hfAsModel(hfModel, file),
        );
        extras.push(...projModels);
      }
      if (candidate.draft) {
        const draftStub = catalogDraftToStub(candidate.draft);
        named = {...named, defaultDraftModel: draftStub.id};
        extras.push(draftStub);
      }
      return [named, ...extras];
    });

    // Dedup on the full model id (author/repo/filename) so two authors sharing
    // a repo name + filename don't collapse. The id also spans origins,
    // matching a legacy origin:PRESET download against a new origin:HF rule
    // entry.
    const seen = new Set<string>();
    const presets: Model[] = [];
    for (const model of flat) {
      if (seen.has(model.id)) {
        continue;
      }
      seen.add(model.id);
      presets.push({...model, isRulePreset: true});
    }
    return presets;
  },

  // Resolve the preset list from the bundled offline floor only — no network.
  // This populates the model list immediately on first launch so a slow or
  // hanging rules fetch can never leave the list empty. The fetched online
  // override is applied afterwards by upgradeToFetchedRules
  // (fire-and-forget; see catalogUpgradeToFetchedRules above).

  // Reconcile the freshly-resolved rule presets into the model list. Keyed on
  // the full model id (author/repo/filename), which spans origins: a
  // downloaded legacy PRESET and a new origin:HF rule entry share it, so the
  // kept download suppresses the rule stub (no duplicate card, no
  // re-download).
  //
  // Two-sided so the list stays equal to the current rule set:
  //  - prune non-downloaded rule-provenance stubs no longer in the fresh set
  //    (a newer rulesVersion dropped them, or the device re-tiered). Downloaded
  //    models of any origin and user-added HF/LOCAL models are never pruned.
  //  - append the fresh presets not already represented by a kept model.
  reconcilePresets(presets: Model[]) {
    if (presets.length === 0) {
      return;
    }
    const freshIds = new Set(presets.map(p => p.id));
    const kept = this.models.filter(
      m => !(m.isRulePreset && !m.isDownloaded && !freshIds.has(m.id)),
    );
    const existing = new Set(kept.map(m => m.id));
    const toAdd = presets.filter(p => !existing.has(p.id));
    if (kept.length === this.models.length && toAdd.length === 0) {
      return;
    }
    runInAction(() => {
      this.models = [...kept, ...toAdd];
    });
  },

  mergeModelLists(presets: Model[] = []) {
    // The default list is data-driven: rule-resolved origin:HF presets replace
    // the old static PRESET array. Keep every downloaded model regardless of
    // origin, drop non-downloaded PRESET stubs, then reconcile the resolved
    // presets in by model.id (author/repo/filename, origin-spanning) so a kept
    // legacy PRESET download suppresses its rule stub.
    const mergedModels = [...this.models].filter(
      model => model.origin !== ModelOrigin.PRESET || model.isDownloaded,
    );

    // Handle HF and LOCAL models
    mergedModels.forEach(model => {
      if (
        model.origin === ModelOrigin.HF ||
        model.origin === ModelOrigin.LOCAL ||
        model.isLocal
      ) {
        // Reset default settings
        if (model.origin === ModelOrigin.LOCAL || model.isLocal) {
          const defaultSettings = getLocalModelDefaultSettings();
          model.defaultChatTemplate = {...defaultSettings.chatTemplate};
          model.defaultStopWords = defaultSettings.completionParams.stop;
        } else if (model.origin === ModelOrigin.HF) {
          const defaultSettings = getHFDefaultSettings(
            model.hfModel as HuggingFaceModel,
          );
          model.defaultChatTemplate = {...defaultSettings.chatTemplate};
          model.defaultStopWords = defaultSettings.completionParams.stop;
        }

        // Update current settings while preserving any customizations
        model.chatTemplate = deepMerge(
          model.chatTemplate || {},
          model.defaultChatTemplate,
        );
        model.stopWords = [
          ...(model.stopWords || []),
          ...(model.defaultStopWords || []),
        ];

        // Infer repo from model.id if missing (for existing HF models)
        if (model.origin === ModelOrigin.HF && !model.repo) {
          const inferredRepo = inferRepoFromModelId(model.id);
          if (inferredRepo) {
            model.repo = inferredRepo;
            logger.debug(
              `[ModelStore] Inferred repo "${inferredRepo}" from model.id: ${model.id}`,
            );
          }
        }
      }
    });

    runInAction(() => {
      this.models = mergedModels;
    });

    this.reconcilePresets(presets);

    // Returned (not awaited) so callers inside runInAction can stay sync while
    // initializeStore can still await settlement before pruning local models.
    // ج26: download-status owner still on the god object until B16.
    return modelStore.initializeDownloadStatus();
  },

  /**
   * Removes a model from the models list if it is not downloaded.
   * @param modelId - The ID of the model to remove.
   * @returns boolean - Returns true if the model was removed, false otherwise.
   */
  removeModelFromList(model: Model): boolean {
    const modelIndex = this.models.findIndex(
      m => m.id === model.id && m.origin === model.origin,
    );
    if (modelIndex !== -1) {
      const _model = this.models[modelIndex];
      if (!_model.isDownloaded) {
        runInAction(() => {
          this.models.splice(modelIndex, 1);
        });
        return true;
      }
    }
    return false;
  },

  /**
   * Adds a new HF model to the models list, only if it doesn't exist yet.
   * For multimodal models, ensures all required projection models are also
   * added.
   * @param hfModel - The Hugging Face model to add.
   * @param modelFile - The model file to add.
   * @returns The new model that was added.
   */
  async addHFModel(hfModel: HuggingFaceModel, modelFile: ModelFile) {
    const newModel = hfAsModel(hfModel, modelFile);
    const storeModel = this.models.find(m => m.id === newModel.id);

    // For non-multimodal models, return early if the model already exists
    if (storeModel && !newModel.supportsMultimodal) {
      return storeModel;
    }

    // Add the model to the store if it doesn't exist
    let modelToReturn = storeModel;
    if (!storeModel) {
      runInAction(() => {
        this.models.push(newModel);
      });
      modelToReturn = newModel;
    }

    // For multimodal models, always ensure projection models are in the store
    if (
      newModel.supportsMultimodal &&
      newModel.compatibleProjectionModels?.length
    ) {
      // Get the mmproj files from the repository
      const mmprojFiles = getMmprojFiles(hfModel.siblings || []);

      // Add each projection model to the store if it doesn't exist
      for (const mmprojFile of mmprojFiles) {
        const projModelId = `${hfModel.id}/${mmprojFile.rfilename}`;
        const existingProjModel = this.models.find(m => m.id === projModelId);

        if (!existingProjModel) {
          // Create and add the projection model
          const projModel = hfAsModel(hfModel, mmprojFile);
          runInAction(() => {
            this.models.push(projModel);
          });
        }
      }

      // If we're working with an existing model, update its projection model
      // references to ensure they're current with what's now in the store
      if (storeModel) {
        const updatedCompatibleModels = mmprojFiles.map(
          file => `${hfModel.id}/${file.rfilename}`,
        );

        runInAction(() => {
          // Update compatible projection models list
          storeModel.compatibleProjectionModels = updatedCompatibleModels;

          // Ensure default projection model is set if not already set
          if (
            !storeModel.defaultProjectionModel &&
            updatedCompatibleModels.length > 0
          ) {
            // Use the same logic as hfAsModel to determine the default
            const mmprojFilenames = mmprojFiles.map(file => file.rfilename);
            const recommendedFile = getRecommendedProjectionModel(
              modelFile.rfilename,
              mmprojFilenames,
            );
            if (recommendedFile) {
              storeModel.defaultProjectionModel = `${hfModel.id}/${recommendedFile}`;
            }
          }
        });
      }
    }

    // If this is a projection model, check if we need to update any vision
    // models
    if (newModel.modelType === ModelType.PROJECTION) {
      // Get the repository ID from the model ID
      const repoId = newModel.id.split('/').slice(0, 2).join('/');

      // Find vision models from the same repository
      const visionModels = this.models.filter(
        m =>
          m.supportsMultimodal &&
          m.id.startsWith(repoId) &&
          m.id !== newModel.id,
      );

      // Update the compatible projection models for each vision model
      for (const visionModel of visionModels) {
        if (!visionModel.compatibleProjectionModels?.includes(newModel.id)) {
          runInAction(() => {
            if (!visionModel.compatibleProjectionModels) {
              visionModel.compatibleProjectionModels = [];
            }
            visionModel.compatibleProjectionModels.push(newModel.id);

            // If no default projection model is set, set this one as default
            if (!visionModel.defaultProjectionModel) {
              visionModel.defaultProjectionModel = newModel.id;
            }
          });
        }
      }
    }

    // ج26: download-status owner still on the god object until B16.
    await modelStore.refreshDownloadStatuses();
    return modelToReturn;
  },

  /**
   * Lazy-register a curated onboarding-assistant HF entry into `models`.
   * Single writer for HF-origin onboarding picks; only call site is
   * `useOnboardingHandlers.finish`. Synthesizes the minimal
   * `{hfModel, modelFile}` pair and delegates to `addHFModel`, which
   * provides idempotency. `siblings: []` keeps `isVisionRepo` false so
   * no projection model materializes (text-only by design).
   */
  async registerOnboardingAssistantModel(
    entry: OnboardingAssistantModelEntry,
  ): Promise<Model | undefined> {
    const modelFile: ModelFile = {
      rfilename: entry.filename,
      url: entry.downloadUrl,
      size: entry.sizeBytes,
    } as ModelFile;
    const hfModel: HuggingFaceModel = {
      id: entry.repo,
      author: entry.author,
      url: `https://huggingface.co/${entry.repo}`,
      specs: {gguf: {total: entry.params}},
      siblings: [] as ModelFile[],
    } as HuggingFaceModel;
    return this.addHFModel(hfModel, modelFile);
  },

  removeModelByFullPath(fullPath: string) {
    const index = this.models.findIndex(
      m =>
        (m.isLocal || m.origin === ModelOrigin.LOCAL) &&
        m.fullPath === fullPath,
    );
    if (index !== -1) {
      this.models.splice(index, 1);
    }
  },

  async addLocalModel(localFilePath: string) {
    const filename = localFilePath.split('/').pop(); // Extract filename from path
    if (!filename) {
      throw new Error('Invalid local file path');
    }

    // Read file size from disk
    let fileSize = 0;
    try {
      const stat = await RNFS.stat(localFilePath);
      fileSize = Number(stat.size) || 0;
    } catch (e) {
      console.warn('[ModelStore] Failed to read file size:', e);
    }

    const defaultSettings = getLocalModelDefaultSettings();

    const model: Model = {
      id: uuidv4(), // Generate a unique ID
      author: '',
      name: filename,
      size: fileSize,
      params: 0, // Will be updated after GGUF metadata read
      isDownloaded: true,
      downloadUrl: '',
      hfUrl: '',
      progress: 0,
      filename,
      fullPath: localFilePath,
      isLocal: true, // Kept for backward compatibility
      origin: ModelOrigin.LOCAL,
      defaultChatTemplate: {...defaultSettings.chatTemplate},
      chatTemplate: {...defaultSettings.chatTemplate},
      defaultStopWords: [...(defaultSettings?.completionParams?.stop || [])],
      stopWords: [...(defaultSettings?.completionParams?.stop || [])],
      defaultCompletionSettings: defaultSettings.completionParams,
      completionSettings: {...defaultSettings.completionParams},
    };

    runInAction(() => {
      this.models.push(model);
      // ج26: download-status owner still on the god object until B16.
      modelStore.refreshDownloadStatuses();
    });

    // Get the MobX observable version — the plain `model` object was wrapped
    // in a proxy when pushed into the observable array. We must pass the proxy
    // so that mutations inside fetchAndPersistGGUFMetadata trigger reactivity.
    const observableModel = this.models.find(m => m.id === model.id);
    if (observableModel) {
      // ج27 DIED at B13: the GGUF family lives here now — internal call.
      await this.fetchAndPersistGGUFMetadata(observableModel);
    }
  },

  async resetModels() {
    const localModels = this.models.filter(
      model => model.isLocal || model.origin === ModelOrigin.LOCAL,
    );
    localModels.forEach(model => {
      const defaultSettings = getLocalModelDefaultSettings();
      // We change the default settings as well, in case the app introduces
      // new settings.
      model.defaultChatTemplate = {...defaultSettings.chatTemplate};
      model.defaultStopWords = [
        ...(defaultSettings?.completionParams?.stop || []),
      ];
      model.chatTemplate = {...defaultSettings.chatTemplate};
      model.stopWords = [...(defaultSettings?.completionParams?.stop || [])];

      // Clear GGUF metadata to force re-fetch with correct number types
      model.ggufMetadata = undefined;
    });

    const hfModels = this.models.filter(
      model => model.origin === ModelOrigin.HF,
    );
    hfModels.forEach(model => {
      const defaultSettings = getHFDefaultSettings(
        model.hfModel as HuggingFaceModel,
      );
      // We change the default settings as well, in case the app introduces
      // new settings.
      model.defaultChatTemplate = {...defaultSettings.chatTemplate};
      model.defaultStopWords = [
        ...(defaultSettings?.completionParams?.stop || []),
      ];
      model.chatTemplate = {...defaultSettings.chatTemplate};
      model.stopWords = [...(defaultSettings?.completionParams?.stop || [])];

      // Clear GGUF metadata to force re-fetch with correct number types
      model.ggufMetadata = undefined;
    });

    // Re-resolve the device-appropriate presets so reset repopulates the
    // default rule list synchronously, mirroring initializeStore (rather than
    // leaving it empty until the next launch re-migrates).
    const presets = await catalogResolvePresets();

    runInAction(() => {
      // Seed with the kept local/HF models so the preset reconcile dedups
      // against them (a downloaded HF model matching a rule preset is not
      // duplicated).
      this.models = [...localModels, ...hfModels];
      this.version = 0;
      // ج28: dispatched through the god facade, not this.* — ModelStore.test
      // overrides god members (e.g. resetModels spies mergeModelLists) and
      // the facade is the dispatch surface those overrides live on. Same
      // shape as ج2 (read via reverse delegation). The call reaches the same
      // implementation (facade → catalogStore.mergeModelLists). Dies at 4d
      // when ModelStore.test splits and suites exercise catalogStore
      // directly.
      modelStore.mergeModelLists(presets);

      // mergeModelLists appends defaultStopWords onto existing stopWords to
      // preserve user customizations; on the just-reset kept models that
      // duplicates the seeded defaults. Dedup the affected models (distinct
      // entries are preserved).
      [...localModels, ...hfModels].forEach(model => {
        model.stopWords = [...new Set(model.stopWords)];
      });
    });

    // Re-fetch GGUF metadata with correct number types
    // ج27 DIED at B13: internal module call (the GodCatalogPrivates cast is
    // gone with the bridge).
    catalogLoadMissingGGUFMetadata();
  },

  // ── B12 (phase-4 4a): real implementations (metadata updaters).
  // Bodies verbatim; ج29 = getModelFullPath still on the god (die B18).
  updateModelChatTemplate(
    modelId: string,
    newConfig: ChatTemplateConfig,
  ) {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.chatTemplate = newConfig;
      });
    }
  },

  updateModelStopWords(
    modelId: string,
    newStopWords: CompletionParams['stop'],
  ) {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.stopWords = newStopWords;
      });
    }
  },

  updateModelName(modelId: string, newName: string) {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.name = newName;
      });
    }
  },

  resetModelChatTemplate(modelId: string) {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.chatTemplate = {...model.defaultChatTemplate};
      });
    }
  },

  resetModelStopWords(modelId: string) {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.stopWords = [...(model.defaultStopWords || [])];
      });
    }
  },

  resetModelName(modelId: string) {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.name = getOriginalModelName(model);
      });
    }
  },

  /**
   * Fetches and updates model file details from HuggingFace.
   * This is used when we need to get the lfs.oid for integrity checks.
   * @param model - The model to update
   * @returns Promise<void>
   */
  async fetchAndUpdateModelFileDetails(model: Model): Promise<void> {
    if (!model.hfModel?.id) {
      return;
    }

    try {
      const fileDetails = await fetchModelFilesDetails(model.hfModel.id);
      const matchingFile = fileDetails.find(
        file => file.path === model.hfModelFile?.rfilename,
      );

      if (matchingFile && matchingFile.lfs) {
        runInAction(() => {
          if (model.hfModelFile) {
            model.hfModelFile.lfs = matchingFile.lfs;
          }
        });
      }
    } catch (error) {
      console.error('Failed to fetch model file details:', error);
    }
  },

  // Expensive operation.
  // It will be calculating hash if hash is not set, unless force is true.
  async updateModelHash(modelId: string, force: boolean = false) {
    const model = this.models.find(m => m.id === modelId);

    // We only update hash if the model is downloaded and not currently being
    // downloaded.
    if (model?.isDownloaded && !downloadManager.isDownloading(modelId)) {
      // If not forced, we only update hash if it's not already set.
      if (model.hash && !force) {
        return;
      }
      // ج29 died at B18 (file-family re-homed to downloadStore; the
      // implementation now lives there — this line remains a facade
      // dispatch, ج28-family, dies with the facade at 4e).
      const filePath = await modelStore.getModelFullPath(model);
      const hash = await getSHA256Hash(filePath);
      runInAction(() => {
        model.hash = hash;
      });
    }
  },

  isModelAvailable(modelId?: string): boolean {
    if (!modelId) {
      return false;
    }
    return this.availableModels.some(m => m.id === modelId);
  },

  // ── B13 (phase-4 4a): real implementations (GGUF family). ج27 DIES here
  // (declared B11→B13): the resetModels / addLocalModel calls flipped
  // internal. ج29 gains fetchAndPersistGGUFMetadata→getModelFullPath.

  // Drafts downloaded before draft detection existed were classified as
  // vision models (their repo carries an mmproj); re-derive so they heal.
  // The pairing may have auto-downloaded that mmproj, and projection models
  // are only reachable through a multimodal model's UI — which the heal
  // removes — so the cleared ids are recorded (persisted with the same write
  // that strips the pairing) and drained after download state is synced.
  healDraftVisionClassification() {
    runInAction(() => {
      this.models.forEach(model => {
        // A downloaded record without ggufMetadata is only draft-classified by
        // its filename; wait for the header backfill so it can veto first.
        if (model.isDownloaded && !model.ggufMetadata) {
          return;
        }
        if (model.supportsMultimodal && isDraftOnlyModel(model)) {
          // ج30: cleanupQueueBridge producer side — key god-resident until B22.
          const cleared = new Set(modelStore.pendingProjectionCleanupIds);
          model.compatibleProjectionModels?.forEach(id => cleared.add(id));
          if (model.defaultProjectionModel) {
            cleared.add(model.defaultProjectionModel);
          }
          modelStore.pendingProjectionCleanupIds = [...cleared];
          model.supportsMultimodal = false;
          model.capabilities = model.capabilities?.filter(c => c !== 'vision');
          model.compatibleProjectionModels = undefined;
          model.defaultProjectionModel = undefined;
          model.visionEnabled = undefined;
        }
      });
    });
  },

  /**
   * Fetch and persist GGUF metadata for a downloaded model
   * Called after download completes to enable accurate memory estimation
   */
  async fetchAndPersistGGUFMetadata(model: Model) {
    try {
      // ج29 died at B18 (file-family re-homed to downloadStore; the
      // implementation now lives there — this line remains a facade
      // dispatch, ج28-family, dies with the facade at 4e).
      const filePath = await modelStore.getModelFullPath(model);
      if (!filePath) {
        console.warn(
          '[ModelStore] Cannot fetch GGUF metadata: model path is undefined',
        );
        return;
      }

      const modelInfo = await loadLlamaModelInfo(filePath);
      if (!modelInfo || typeof modelInfo !== 'object') {
        console.warn('[ModelStore] Invalid model info returned');
        return;
      }

      // Default vocab sizes by architecture (matches Python memory_estimator.py)
      const ARCH_DEFAULT_VOCAB: Record<string, number> = {
        llama: 128256,
        gemma2: 256000,
        gemma3n: 262144,
        qwen2: 151936,
        qwen3: 151936,
        lfm2: 65536,
        phi3: 32064,
        mistral: 32000,
        deepseek2: 102400,
        clip: 49408, // CLIP models have smaller vocab
      };

      // Get the architecture to determine the correct key prefix
      const architecture: string =
        (modelInfo as any)['general.architecture'] || 'llama';

      // Helper to get architecture-specific value with fallback (matches Python get_arch_value)
      const getArchValue = (
        field: string,
        defaultValue?: number,
      ): number | undefined => {
        const key = `${architecture}.${field}`;
        const value = (modelInfo as any)[key];
        if (value !== undefined && value !== null) {
          // Handle string values (GGUF sometimes returns strings)
          if (typeof value === 'string') {
            const parsed = value.includes('.')
              ? parseFloat(value)
              : parseInt(value, 10);
            return isNaN(parsed) ? defaultValue : parsed;
          }
          return typeof value === 'number' ? value : defaultValue;
        }
        return defaultValue;
      };

      // Extract core fields (these are required)
      const n_layers = getArchValue('block_count');
      const n_embd = getArchValue('embedding_length');
      const n_head = getArchValue('attention.head_count');

      // Validate core fields exist - without these we can't estimate memory
      if (!n_layers || !n_embd || !n_head) {
        return;
      }

      // Extract optional fields with fallbacks (matches Python ModelInfo.__post_init__)
      const n_head_kv = getArchValue('attention.head_count_kv', n_head); // fallback to n_head
      const n_vocab =
        getArchValue('vocab_size') ||
        ARCH_DEFAULT_VOCAB[architecture] ||
        128000;

      // Derive head dimensions if not present (matches Python)
      const n_embd_head_k =
        getArchValue('attention.key_length') || Math.floor(n_embd / n_head);
      const n_embd_head_v =
        getArchValue('attention.value_length') || Math.floor(n_embd / n_head);

      // SWA (Sliding Window Attention) - optional
      const sliding_window = getArchValue('attention.sliding_window');

      // Context length from GGUF
      const context_length = getArchValue('context_length');

      const nextn_predict_layers = getArchValue('nextn_predict_layers');
      const embedding_length_out = getArchValue('embedding_length_out');

      const metadata = {
        architecture,
        n_layers,
        n_embd,
        n_head,
        n_head_kv: n_head_kv!,
        n_vocab,
        n_embd_head_k,
        n_embd_head_v,
        sliding_window,
        context_length,
        nextn_predict_layers,
        embedding_length_out,
      };

      const paramCount = parseSizeLabel(
        (modelInfo as any)['general.size_label'],
      );

      runInAction(() => {
        model.ggufMetadata = metadata;
        if (!model.params && paramCount) {
          model.params = paramCount;
        }
      });
    } catch (error) {
      console.warn('[ModelStore] Failed to fetch GGUF metadata:', error);
    }
  },

  // ── B14 (phase-4 4a): real implementations (remote + vision/reasoning).
  // setRemoteModel dispatches its runtime writes through the god facade (ج32
  // — no static runtimeStore import: it would close a load-order cycle and
  // break requireActual factories). ج31 below reaches the PM until B15.

  /**
   * Set a remote model as the active model and create an OpenAI completion
   * engine. Releases any active local context first.
   */
  async setRemoteModel(model: Model): Promise<void> {
    if (!model.serverId || !model.remoteModelId) {
      throw new Error('Model is missing remote configuration');
    }

    // ج32: runtime writes through the god facade (owner state via the B8
    // accessor pairs — no static runtimeStore import, see the type above).
    const god = modelStore as unknown as GodRuntimeWrites;
    // Release any existing context (local or remote)
    await god.releaseContext();

    const apiKey = await serverStore.getApiKey(model.serverId);
    const server = serverStore.servers.find(s => s.id === model.serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    runInAction(() => {
      god.engine = new OpenAICompletionEngine(
        server.url,
        model.remoteModelId!,
        apiKey,
        server.requestTimeoutMs,
        server.serverType,
      );
      god.activeRemoteBinding = {
        modelId: model.id,
        serverId: model.serverId!,
        remoteModelId: model.remoteModelId!,
        url: server.url,
        serverType: server.serverType,
      };
      god.setActiveModel(model.id);
      // Do NOT set lastUsedModelId for remote models -- server may be offline
      // on next launch
    });

    serverStore
      .fetchRemoteModelCaps(model.serverId, model.remoteModelId, apiKey)
      .catch(() => {});
  },

  /**
   * Manual model-card override. Top of precedence; routes remote ids to
   * ServerStore, local to the persisted Model.
   */
  setReasoningOverride(modelId: string, cap: ReasoningCapability): void {
    const localModel = this.models.find(m => m.id === modelId);
    if (!localModel) {
      serverStore.setRemoteReasoningOverride(modelId, cap);
      return;
    }
    runInAction(() => {
      localModel.reasoning = cap;
      localModel.supportsThinking = cap.isReasoning === 'yes';
    });
  },

  /**
   * Learn-from-stream entry point. The first time a model actually emits
   * reasoning, flip axis-1 to learned 'yes'. Routes remote ids to ServerStore
   * (one direction). Idempotent and monotonic; never overrides a user
   * declaration (handled by the per-store writers).
   */
  recordReasoningObserved(modelId: string): void {
    const localModel = this.models.find(m => m.id === modelId);
    if (!localModel) {
      // Not a persisted local model → remote; delegate to ServerStore.
      serverStore.recordRemoteReasoningObserved(modelId);
      return;
    }
    const existing = localModel.reasoning;
    if (existing?.source === 'user' || existing?.isReasoning === 'yes') {
      return;
    }
    runInAction(() => {
      localModel.reasoning = {
        isReasoning: 'yes',
        source: 'learned',
        supportsEffort: existing?.supportsEffort ?? false,
        effortValues: existing?.effortValues ?? [],
        effortSource: existing?.effortSource ?? 'none',
      };
      localModel.supportsThinking = true;
    });
  },

  // ── B15 (phase-4 4a): real implementations (projection-catalog family).
  // Bodies live in the re-homed ProjectionModelManager (part-1: the manager
  // instance is constructed below and exported from this module — ONE
  // instance serves the remaining download/runtime-facing god members until
  // B19/B20). ج31 DIED: the ج14-era narrow view + barrel fallback are gone.
  getCompatibleProjectionModels(modelId: string): Model[] {
    return projectionManager.getCompatibleProjectionModels(modelId);
  },

  setDefaultProjectionModel(modelId: string, projectionModelId: string) {
    projectionManager.setDefaultProjectionModel(modelId, projectionModelId);
  },

  getDefaultProjectionModel(modelId: string): Model | undefined {
    return projectionManager.getDefaultProjectionModel(modelId);
  },

  getLLMsUsingProjectionModel(projectionModelId: string): Model[] {
    return projectionManager.getLLMsUsingProjectionModel(projectionModelId);
  },

  hasRequiredProjectionModel(model: Model): boolean {
    return projectionManager.hasRequiredProjectionModel(model);
  },

  setModelVisionEnabled(modelId: string, enabled: boolean) {
    return projectionManager.setModelVisionEnabled(modelId, enabled);
  },

  getModelVisionPreference(model: Model): boolean {
    return projectionManager.getModelVisionPreference(model);
  },
};

// ───────────── B15 (phase-4 4a): ProjectionModelManager re-homing, part 1 ─────────────
// ONE instance, constructed here and EXPORTED: the remaining god members
// (getProjectionModelStatus / canDeleteProjectionModel / cleanupOrphaned* /
// getDownloadedLLMsUsingProjectionModel — B19/B20) flip their delegation to
// this instance, and the god's own field dies with the batch. The host mixes
// three documented sources (see ProjectionHost): catalog state from THIS
// store, and the runtimeBridge reads + initContext/deleteModel calls through
// the god facade (ج33 — the ج32 family: no static runtimeStore import, the
// load-order cycle it would close breaks requireActual factories). ج33 dies
// at 4e when bootstrap becomes the sole composition root and injects runtime
// directly into the manager.
export const projectionManager = new ProjectionModelManager({
  get models() {
    return catalogStore.models;
  },
  get context() {
    return modelStore.context;
  },
  get activeModelId() {
    return modelStore.activeModelId;
  },
  get activeProjectionModelId() {
    return modelStore.activeProjectionModelId;
  },
  get isMultimodalActive() {
    return modelStore.isMultimodalActive;
  },
  initContext: (model, mmProjPath) => modelStore.initContext(model, mmProjPath),
  deleteModel: model => modelStore.deleteModel(model),
});
