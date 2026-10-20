import {
  AppStateStatus,
  InteractionManager,
  Platform,
  Alert,
} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import 'react-native-get-random-values';
import {makePersistable} from 'mobx-persist-store';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {computed, makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ContextParams, LlamaContext} from 'llama.rn';
import {CompletionParams, CompletionEngine} from '../utils/completionTypes';

import {fetchModelFilesDetails} from '../api/hf';
import {OpenAICompletionEngine} from '../api/completionEngines';

import {uiStore, hfStore, modelHubStore} from '.';
import {serverStore} from './ServerStore';
import {resolveDraftModelId} from './draftResolution';
import {checkGpuSupport} from '../utils/deviceCapabilities';
import {
  getSHA256Hash,
  getMmprojFiles,
  inferRepoFromModelId,
  parseSizeLabel,
} from '../utils';
import {isDraftOnlyModel} from '../utils/mtp';
import {getOriginalModelName} from '../utils/formatters';
import type {OnboardingAssistantModelEntry} from './onboarding/onboardingAssistants';

import {downloadManager, DownloadCancelledError} from '../services/downloads';
import {Tier} from '../services/deviceRules/types';
import type {DeviceRules, DeviceSignals} from '../services/deviceRules/types';

// Bump when the migration logic that re-merges the persisted model list
// changes. Crossing this version runs the one-time prune-and-reconcile.
export const MODEL_LIST_VERSION = 15;

import {stops} from '../utils/chat';
import {
  CacheType,
  ChatTemplateConfig,
  ContextInitParams,
  DraftConfig,
  HuggingFaceModel,
  Model,
  ModelFile,
  ModelOrigin,
  ModelType,
  RemoteSessionBinding,
} from '../utils/types';

import {ErrorState, createErrorState} from '../utils/errors';
import {
  getRecommendedThreadCount,
  getCpuCoreCount,
} from '../utils/deviceCapabilities';
import {detectThinkingCapability} from '../utils/thinkingCapabilityDetection';
import {ReasoningCapability} from '../utils/reasoningCapability';
import {capsMatchBinding} from '../utils/remoteCaps';
import type {ModelCapabilityView} from '../utils/modelCaps';
import {t} from '../locales';
import {createDefaultContextInitParams} from '../utils/contextInitParamsVersions';
import NativeHardwareInfo from '../specs/NativeHardwareInfo';
import {loadLlamaModelInfo} from 'llama.rn';
import {logger} from '../utils/logger';
import {ProjectionModelManager} from './model/ProjectionModelManager';
// Phase-4 R0 (docs/extraction-plan.md, condition 4): DI composition root.
// bootstrap is imported ALONE — never the three pass-through stores. They
// import the store barrel (which re-exports ModelStore), so a static import
// from here would close a madge cycle (gate: pinned at 42). Until 4a
// relocates members, the three domain slots receive `this` — the god object
// IS the sole domain implementation.
import {initializeModelSystem} from './model/bootstrap';
// B10 (phase-4 4a): the nine catalog state members physically live in
// catalogStore (five persist keys as the catalogStore:v2 root's fields,
// four derived views computed there). These are verbatim reverse
// delegations (each dies at 4b when its call sites migrate); the v2 root
// and the one-time legacy import are called from the constructor chain
// below (ج25 — composition wiring, dies at 4e per §8).
import {
  catalogStore,
  catalogResolvePresets,
  catalogUpgradeToFetchedRules,
  importLegacyCatalogState,
  injectCatalogHost,
} from './model/catalogStore';
// B1 (phase-4 4a): the 16 context-parameter setters physically live in
// runtimeStore; these are verbatim reverse delegations (each dies at 4b
// when its call sites migrate). The host injection below gives runtimeStore
// write access to contextInitParams without importing this module.
import {
  MIN_CONTEXT_SIZE,
  clearCompletionPromiseOf,
  injectRuntimeHost,
  registerCompletionPromiseOf,
  releaseContextInternal,
  resolveDraftConfig as resolveDraftConfigOf,
  runtimeStore,
} from './model/runtimeStore';

// B10: createRemoteModel moved verbatim to catalogStore.ts with its only
// consumer (the remoteModels view) — private helper, catalog domain.

export class ModelStore {
  // ── B10 (phase-4 4a): real state lives in catalogStore (boxes; the
  // catalogStore:v2 persist root owns the five persisted keys) ──
  get models(): Model[] {
    return catalogStore.models;
  }
  set models(value: Model[]) {
    catalogStore.models = value;
  }
  /** Persisted version. */
  get version(): number | undefined {
    return catalogStore.version;
  }
  set version(value: number | undefined) {
    catalogStore.version = value;
  }
  /** Resolved device classification. */
  get deviceTier(): Tier | null {
    return catalogStore.deviceTier;
  }
  set deviceTier(value: Tier | null) {
    catalogStore.deviceTier = value;
  }
  /** Provenance of the preset list. */
  get rulesVersion(): string | null {
    return catalogStore.rulesVersion;
  }
  set rulesVersion(value: string | null) {
    catalogStore.rulesVersion = value;
  }

  /**
   * Returns models with projection models filtered out for display purposes
   */
  get displayModels(): Model[] {
    return catalogStore.displayModels;
  }

  // ── B4 (phase-4 4a): real state lives in runtimeStore (box; not persisted) ──
  get appState(): AppStateStatus {
    return runtimeStore.appState;
  }
  set appState(value: AppStateStatus) {
    runtimeStore.appState = value;
  }
  useAutoRelease: boolean = true;
  // UI loading state - true during model load/release transitions
  // ── B8 (phase-4 4a): real state lives in runtimeStore (boxes; not persisted) ──
  get isContextLoading(): boolean {
    return runtimeStore.isContextLoading;
  }
  set isContextLoading(value: boolean) {
    runtimeStore.isContextLoading = value;
  }
  get loadingModel(): Model | undefined {
    return runtimeStore.loadingModel;
  }
  set loadingModel(value: Model | undefined) {
    runtimeStore.loadingModel = value;
  }

  // Unified context initialization parameters
  contextInitParams: ContextInitParams = createDefaultContextInitParams();

  // ── B2 (phase-4 4a): real state lives in runtimeStore (observable box) ──
  // initializeThreadCount (below) writes through the setter; the Settings UI
  // reads through the getter. Both hit the same box runtimeStore owns, so
  // observer re-render semantics are unchanged. The writer itself relocates
  // to bootstrap at B22; call sites migrate at 4b.
  get max_threads(): number {
    return runtimeStore.max_threads;
  }
  set max_threads(value: number) {
    runtimeStore.max_threads = value;
  }

  // ── B8 (phase-4 4a): real state lives in runtimeStore (boxes; not persisted) ──
  get activeModelId(): string | undefined {
    return runtimeStore.activeModelId;
  }
  set activeModelId(value: string | undefined) {
    runtimeStore.activeModelId = value;
  }

  // Flag to track if multimodal is currently active
  get isMultimodalActive(): boolean {
    return runtimeStore.isMultimodalActive;
  }
  set isMultimodalActive(value: boolean) {
    runtimeStore.isMultimodalActive = value;
  }
  get activeProjectionModelId(): string | undefined {
    return runtimeStore.activeProjectionModelId;
  }
  set activeProjectionModelId(value: string | undefined) {
    runtimeStore.activeProjectionModelId = value;
  }

  // Track initialization settings for the active context
  activeContextSettings: ContextInitParams | undefined = undefined;

  // ── B8 (phase-4 4a): real state lives in runtimeStore (boxes; not persisted) ──
  get context(): LlamaContext | undefined {
    return runtimeStore.context;
  }
  set context(value: LlamaContext | undefined) {
    runtimeStore.context = value;
  }

  get engine(): CompletionEngine | undefined {
    return runtimeStore.engine;
  }
  set engine(value: CompletionEngine | undefined) {
    runtimeStore.engine = value;
  }

  get activeRemoteBinding(): RemoteSessionBinding | undefined {
    return runtimeStore.activeRemoteBinding;
  }
  set activeRemoteBinding(value: RemoteSessionBinding | undefined) {
    runtimeStore.activeRemoteBinding = value;
  }

  // ── B10 (phase-4 4a): real state lives in catalogStore (box; v2 root) ──
  get lastUsedModelId(): string | undefined {
    return catalogStore.lastUsedModelId;
  }
  set lastUsedModelId(value: string | undefined) {
    catalogStore.lastUsedModelId = value;
  }

  /** Model ids currently in the post-download verification gate. */
  verifyingModelIds: string[] = [];

  // Auto-release tracking (persist keys — state stays on the god object
  // until the v2 persist roots exist; see runtimeStore.ts B4 note)
  wasAutoReleased: boolean = false;
  lastAutoReleasedModelId: string | undefined = undefined;

  // ── B2 (phase-4 4a): pure constant — module-level export in runtimeStore ──
  get MIN_CONTEXT_SIZE(): number {
    return MIN_CONTEXT_SIZE;
  }

  // ── B6 (phase-4 4a): real state lives in runtimeStore (boxes; not persisted) ──
  get inferencing(): boolean {
    return runtimeStore.inferencing;
  }
  set inferencing(value: boolean) {
    runtimeStore.inferencing = value;
  }
  get isStreaming(): boolean {
    return runtimeStore.isStreaming;
  }
  set isStreaming(value: boolean) {
    runtimeStore.isStreaming = value;
  }

  // Track active completion promise for safe context release
  // This prevents race condition where context is freed while completion is still running
  // ── B6: real state is the runtimeStore box; releaseContext reads it via
  // getActiveCompletionPromise() (bridge ج11, death B7) until this member's
  // family relocates.

  // Recovered local-model paths awaiting persistence. resolveLocalModelPath
  // collects (model -> re-anchored path) here instead of writing each one in
  // its own runInAction; a container change invalidates every local path at
  // once, so the batch flush turns N full store serializations into one.
  // Not in the persist list, so it is never serialized itself.
  private pendingLocalPathRecoveries: Map<Model, string> = new Map();

  // When true, the e2e benchmark runner owns the native context lifecycle.
  // Other callers (ChatView auto-load, selectModel, initContext) must defer
  // to keep the matrix's per-cell devices/n_gpu_layers from being shadowed
  // by an in-flight init that started before the matrix could configure them.
  // Runtime-only; not persisted.
  // ── B5 (phase-4 4a): real state lives in runtimeStore (box; not persisted) ──
  get benchmarkActive(): boolean {
    return runtimeStore.benchmarkActive;
  }
  set benchmarkActive(value: boolean) {
    runtimeStore.benchmarkActive = value;
  }

  downloadError: ErrorState | null = null;
  // ── B7 (phase-4 4a): real state lives in runtimeStore (box; not persisted) ──
  get modelLoadError(): ErrorState | null {
    return runtimeStore.modelLoadError;
  }
  set modelLoadError(value: ErrorState | null) {
    runtimeStore.modelLoadError = value;
  }

  // Memory calibration variables (persisted)
  // Updated at app startup and after model release
  availableMemoryCeiling: number | undefined = undefined;
  // Updated after successful model load using GGUF estimator
  largestSuccessfulLoad: number | undefined = undefined;
  // Projection models orphaned by the vision heal, awaiting deletion; drained
  // every launch (see drainPendingProjectionCleanup).
  pendingProjectionCleanupIds: string[] = [];

  constructor() {
    makeAutoObservable(this, {
      activeModel: computed,
      activeModelCaps: computed,
      contextId: computed,
      remoteModels: computed,
      activeDownloads: computed,
      // Plain helper object (see src/store/model/ProjectionModelManager.ts):
      // it holds no state of its own, so keep it out of the observable tree.
      projectionManager: false,
    });
    // B1 (phase-4 4a): host injection for runtimeStore's physical setters —
    // must precede any setter call (persist.then / UI). See runtimeStore.ts.
    injectRuntimeHost(this);
    // B10 (phase-4 4a): catalog host marker — precedes the v2 root hydration
    // (see catalogStore.ts; guards ج23/ج24 read boxes only in production).
    injectCatalogHost({host: this});
    makePersistable(this, {
      name: 'ModelStore',
      properties: [
        'useAutoRelease',
        'contextInitParams',
        'wasAutoReleased',
        'lastAutoReleasedModelId',
        'availableMemoryCeiling',
        'largestSuccessfulLoad',
        'pendingProjectionCleanupIds',
      ],
      storage: AsyncStorage,
    }).then(async () => {
      // B10 (phase-4 4a): catalogStore:v2 persist root — the five catalog
      // keys moved physically to catalogStore (§3, part 1); the one-time
      // legacy import distributes the catalog half of the old all-in-one
      // payload (§3, part 2). Ordering is load-bearing: v2 hydration first,
      // legacy seed second, then the system initializers (the version gate
      // in initializeStore must see the seeded list). ج25 — wiring dies 4e.
      await makePersistable(catalogStore, {
        name: 'catalogStore:v2',
        properties: [
          'models',
          'version',
          'deviceTier',
          'rulesVersion',
          'lastUsedModelId',
        ],
        storage: AsyncStorage,
      });
      await importLegacyCatalogState();
      await initializeModelSystem({
        catalog: this,
        download: this,
        runtime: this,
        initializeStore: () => this.initializeStore(),
        initializeThreadCount: () => this.initializeThreadCount(),
      });
    });

    this.setupAppStateListener();

    // Set up download manager callbacks
    downloadManager.setCallbacks({
      onProgress: (modelId, progress) => {
        const model = this.models.find(m => m.id === modelId);
        if (model) {
          runInAction(() => {
            model.progress = progress.progress;
            model.downloadSpeed = `${progress.speed} ${uiStore.l10n.common.downloadETA}: ${progress.eta}`;
          });
        }
      },
      onComplete: async modelId => {
        const model = this.models.find(m => m.id === modelId);
        if (model) {
          runInAction(() => {
            model.progress = 100;
          });

          // Verification gate: the model only counts as installed after its
          // file passes the integrity checks (size + checksum when available).
          const verified = await this.verifyDownloadedModel(model);
          if (!verified) {
            return; // error state already surfaced by the gate
          }

          runInAction(() => {
            model.isDownloaded = true;
            model.downloadedAt = Date.now();
          });

          // Fetch and persist GGUF metadata after download completes
          // Skip for projection models (CLIP) - they have different metadata structure
          if (model.modelType !== ModelType.PROJECTION) {
            await this.fetchAndPersistGGUFMetadata(model);
          }
        }
      },
      onError: (modelId, error) => {
        console.error('Download error for model', modelId, error);
        const model = this.models.find(m => m.id === modelId);
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
          this.downloadError = errorState;
        });
      },
    });
  }

  private async initializeThreadCount() {
    try {
      const cores = await getCpuCoreCount();
      runInAction(() => {
        this.max_threads = cores;
      });

      // Only set recommended thread count on first launch.
      // After hydration, this.version is set if the store was previously persisted.
      // On fresh install, this.version is undefined (default).
      const isFirstLaunch = this.version === undefined;
      if (isFirstLaunch) {
        const threads = await getRecommendedThreadCount();
        runInAction(() => {
          this.contextInitParams = {
            ...this.contextInitParams,
            n_threads: threads,
          };
        });
      }
    } catch (error) {
      console.error('Failed to initialize thread count:', error);
      runInAction(() => {
        this.max_threads = 4;
      });
    }
  }

  // ── B1 (phase-4 4a): implementations live in runtimeStore since batch 1 ──
  // Verbatim reverse delegation; each line dies when its call sites migrate (4b).
  // Block bodies on purpose: an arrow-expression body makes the return type
  // resolve through Pick<ModelStore,...> back into this class — TS7024.
  setNThreads = (n_threads: number) => {
    runtimeStore.setNThreads(n_threads);
  };

  setCacheTypeK = (cache_type: CacheType) => {
    runtimeStore.setCacheTypeK(cache_type);
  };

  setCacheTypeV = (cache_type: CacheType) => {
    runtimeStore.setCacheTypeV(cache_type);
  };

  setNBatch = (n_batch: number) => {
    runtimeStore.setNBatch(n_batch);
  };

  setNUBatch = (n_ubatch: number) => {
    runtimeStore.setNUBatch(n_ubatch);
  };

  setNContext = (n_ctx: number) => {
    runtimeStore.setNContext(n_ctx);
  };

  setNGPULayers = (n_gpu_layers: number) => {
    runtimeStore.setNGPULayers(n_gpu_layers);
  };

  setImageMaxTokens = (image_max_tokens: number) => {
    runtimeStore.setImageMaxTokens(image_max_tokens);
  };

  setUseMlock = (use_mlock: boolean) => {
    runtimeStore.setUseMlock(use_mlock);
  };

  setUseMmap = (use_mmap: 'true' | 'false' | 'smart') => {
    runtimeStore.setUseMmap(use_mmap);
  };

  setNoExtraBufts = (no_extra_bufts: boolean) => {
    runtimeStore.setNoExtraBufts(no_extra_bufts);
  };

  setSpeculativeEnabled = (speculativeEnabled: boolean) => {
    runtimeStore.setSpeculativeEnabled(speculativeEnabled);
  };

  setSelectedDraftModel = (selectedDraftModelId?: string) => {
    runtimeStore.setSelectedDraftModel(selectedDraftModelId);
  };

  setSpecDraftNGpuLayers = (spec_draft_n_gpu_layers: number) => {
    runtimeStore.setSpecDraftNGpuLayers(spec_draft_n_gpu_layers);
  };

  setSpecDraftCacheTypeK = (spec_draft_cache_type_k: CacheType) => {
    runtimeStore.setSpecDraftCacheTypeK(spec_draft_cache_type_k);
  };

  setSpecDraftCacheTypeV = (spec_draft_cache_type_v: CacheType) => {
    runtimeStore.setSpecDraftCacheTypeV(spec_draft_cache_type_v);
  };

  // ── B2 (phase-4 4a): implementations live in runtimeStore since batch 2 ──
  // Verbatim reverse delegation; each dies when its call sites migrate (4b).
  // Block bodies + explicit return types on purpose: an arrow-expression body
  // (or bare inference) resolves the return type through Pick<ModelStore,...>
  // back into this class — TS7024.
  /**
   * Get effective context initialization parameters with constraints applied
   * This is the unified method that replaces both getEffectiveBatchValues and getEffectiveInitSettings
   */
  getEffectiveContextInitParams = async (
    filePath?: string,
    draftConfig?: DraftConfig,
  ): Promise<Omit<ContextParams, 'model'>> => {
    return runtimeStore.getEffectiveContextInitParams(filePath, draftConfig);
  };

  // Legacy methods for backward compatibility

  /** @deprecated Use getEffectiveContextInitParams instead */
  getEffectiveBatchValues = (): {
    n_ctx: number;
    n_batch: number;
    n_ubatch: number;
  } => {
    return runtimeStore.getEffectiveBatchValues();
  };

  /** @deprecated Use getEffectiveContextInitParams instead */
  getEffectiveInitSettings = async (
    filePath?: string,
  ): Promise<Omit<ContextParams, 'model'>> => {
    return runtimeStore.getEffectiveInitSettings(filePath);
  };

  /** @deprecated Use getEffectiveBatchValues instead */
  getEffectiveValues = (): {
    n_ctx: number;
    n_batch: number;
    n_ubatch: number;
  } => {
    return runtimeStore.getEffectiveValues();
  };

  // Drafts downloaded before draft detection existed were classified as
  // vision models (their repo carries an mmproj); re-derive so they heal.
  // The pairing may have auto-downloaded that mmproj, and projection models
  // are only reachable through a multimodal model's UI — which the heal
  // removes — so the cleared ids are recorded (persisted with the same write
  // that strips the pairing) and drained after download state is synced.
  healDraftVisionClassification = () => {
    runInAction(() => {
      this.models.forEach(model => {
        // A downloaded record without ggufMetadata is only draft-classified by
        // its filename; wait for the header backfill so it can veto first.
        if (model.isDownloaded && !model.ggufMetadata) {
          return;
        }
        if (model.supportsMultimodal && isDraftOnlyModel(model)) {
          const cleared = new Set(this.pendingProjectionCleanupIds);
          model.compatibleProjectionModels?.forEach(id => cleared.add(id));
          if (model.defaultProjectionModel) {
            cleared.add(model.defaultProjectionModel);
          }
          this.pendingProjectionCleanupIds = [...cleared];
          model.supportsMultimodal = false;
          model.capabilities = model.capabilities?.filter(c => c !== 'vision');
          model.compatibleProjectionModels = undefined;
          model.defaultProjectionModel = undefined;
          model.visionEnabled = undefined;
        }
      });
    });
  };

  /**
   * Delete projection models the heal orphaned. Runs every launch: an id
   * stays queued while its download is still in flight or its deletion
   * fails, so a kill or an unfinished mmproj download cannot strand the
   * file forever. An id whose projection model has downloaded dependents is
   * legitimately shared — dropped, never deleted.
   */
  drainPendingProjectionCleanup = async () => {
    if (this.pendingProjectionCleanupIds.length === 0) {
      return;
    }
    const remaining: string[] = [];
    for (const id of this.pendingProjectionCleanupIds) {
      const projection = this.models.find(m => m.id === id);
      if (!projection || projection.modelType !== ModelType.PROJECTION) {
        continue;
      }
      if (this.getDownloadedLLMsUsingProjectionModel(id).length > 0) {
        continue;
      }
      if (downloadManager.isDownloading(id)) {
        remaining.push(id);
        continue;
      }
      if (!projection.isDownloaded) {
        continue;
      }
      try {
        await this.deleteModel(projection);
        if (this.models.find(m => m.id === id)?.isDownloaded) {
          remaining.push(id);
        }
      } catch (error) {
        console.warn('[ModelStore] orphaned projection cleanup failed:', error);
        remaining.push(id);
      }
    }
    runInAction(() => {
      this.pendingProjectionCleanupIds = remaining;
    });
  };

  initializeStore = async () => {
    const storedVersion = this.version || 0;
    logger.debug('models: ', this.models);

    this.healDraftVisionClassification();

    // Sync download manager with active downloads
    await downloadManager.syncWithActiveDownloads(this.models);

    // After the sync so an in-flight mmproj download is visible and waits. A
    // failure retries next launch; it must not abort the rest of init.
    try {
      await this.drainPendingProjectionCleanup();
    } catch (error) {
      console.warn('[ModelStore] projection cleanup drain failed:', error);
    }

    // Apply the bundled offline floor immediately (no network) so the list is
    // never empty while a slow rules fetch is in flight, then merge/reconcile.
    const presets = await this.resolvePresets();

    if (storedVersion < MODEL_LIST_VERSION) {
      await this.mergeModelLists(presets);
      // mergeModelLists awaits the download-status checks (which re-anchor stale
      // container paths), so pruning here — as the non-migration branch does —
      // is now safe: a recoverable local model has already been settled and will
      // not be dropped as missing.
      this.removeInvalidLocalModels();
      // Only finalize the one-time migration once presets actually resolved.
      // An empty result signals a transient resolve failure (e.g. the RAM read
      // rejected); leave the version unbumped so the migration retries next
      // launch instead of locking in an empty default list.
      if (presets.length > 0) {
        runInAction(() => {
          this.version = MODEL_LIST_VERSION;
        });
      }
    } else {
      this.reconcilePresets(presets);
      await this.initializeDownloadStatus();
      this.removeInvalidLocalModels();
    }

    // Upgrade past the bundled floor to the online rules override in the
    // background; reconcile (id-keyed, dedup) folds in any newer set.
    // v1.36.0: pushed off the launch window — this performs a network fetch
    // (10s timeout) plus rules parsing on EVERY startup, while the bundled
    // floor already resolved above keeps presets usable in the meantime.
    InteractionManager.runAfterInteractions(() => {
      this.upgradeToFetchedRules();
    });

    await this.initializeGpuSettings(); // Should be awaited to ensure GPU settings are applied before initializing context

    // Initialize available memory ceiling at app startup if not set
    if (this.availableMemoryCeiling === undefined) {
      try {
        const availableBytes = await NativeHardwareInfo.getAvailableMemory();
        runInAction(() => {
          this.availableMemoryCeiling = availableBytes;
        });
      } catch (error) {
        // Fallback when native call fails
        console.warn(
          '[ModelStore] Native getAvailableMemory failed, using fallback:',
          error,
        );
        const totalMemory = await DeviceInfo.getTotalMemory();
        // Use conservative heuristic: min(60% of RAM, RAM - 1.2GB)
        const fallbackCeiling = Math.min(
          totalMemory * 0.6,
          totalMemory - 1.2 * 1e9,
        );
        runInAction(() => {
          this.availableMemoryCeiling = Math.max(fallbackCeiling, 0); // Ensure non-negative
        });
      }
    }

    // Load missing GGUF metadata for downloaded models (background, non-blocking)
    this.loadMissingGGUFMetadata();

    // Check if we need to reload an auto-released model (for app restarts)
    this.checkAndReloadAutoReleasedModel();
  };

  // ── B11 (phase-4 4a): preset-pipeline implementations live in catalogStore
  // since batch 11. DraftRulesManager dissolved there — its file died with the
  // batch (every host usage co-moved: deviceTier/rulesVersion writes onto the
  // catalog boxes, resolvePresetModels/reconcilePresets onto co-moved
  // members). Verbatim reverse delegations (B8 pattern) until call sites
  // migrate at 4d; initializeStore keeps exercising the two private names
  // until its own dissolution at B23.
  private resolvePresets = (): Promise<Model[]> => catalogResolvePresets();

  private upgradeToFetchedRules = (): Promise<void> =>
    catalogUpgradeToFetchedRules();

  resolvePresetModels = (
    rules: DeviceRules,
    signals: DeviceSignals,
  ): Model[] => catalogStore.resolvePresetModels(rules, signals);

  reconcilePresets = (presets: Model[]): void =>
    catalogStore.reconcilePresets(presets);

  mergeModelLists = (presets: Model[] = []): Promise<void> =>
    catalogStore.mergeModelLists(presets);

  // ── B4 (phase-4 4a): implementations live in runtimeStore since batch 4 ──
  setupAppStateListener = () => {
    runtimeStore.setupAppStateListener();
  };

  // Auto-release management methods
  disableAutoRelease = (reason: string) => {
    runtimeStore.disableAutoRelease(reason);
  };

  enableAutoRelease = (reason: string) => {
    runtimeStore.enableAutoRelease(reason);
  };

  get isAutoReleaseEnabled(): boolean {
    return runtimeStore.isAutoReleaseEnabled;
  }

  checkAndReloadAutoReleasedModel = async () => {
    await runtimeStore.checkAndReloadAutoReleasedModel();
  };

  handleAppStateChange = async (nextAppState: AppStateStatus) => {
    await runtimeStore.handleAppStateChange(nextAppState);
  };

  /**
   * Remote models are exempt from auto-release, so a session survives
   * backgrounding — but the capability probe behind it may not have: iOS can
   * tear the request down, and the first probe is the request that raises the
   * local-network prompt, so a grant always arrives after it already failed.
   * Without this, caps stay unknown for the rest of the session and the only
   * recovery is re-selecting the model by hand.
   *
   * Also skipped once the server record has been repointed away from that
   * backend: the probe would read a backend this session never talks to, and
   * it cannot produce caps this session could use. The next activation
   * rebuilds the binding and probes the url it is built from.
   */
  private reprobeRemoteCapsIfUnknown = () => {
    const model = this.activeModel;
    if (
      model?.origin !== ModelOrigin.REMOTE ||
      !model.serverId ||
      !model.remoteModelId ||
      capsMatchBinding(
        serverStore.remoteCaps[model.id],
        this.activeRemoteBinding,
        model.id,
      )
    ) {
      return;
    }
    const binding = this.activeRemoteBinding;
    if (binding?.modelId === model.id) {
      const configuredUrl = serverStore.servers.find(
        s => s.id === model.serverId,
      )?.url;
      if (configuredUrl !== undefined && configuredUrl !== binding.url) {
        return;
      }
    }
    serverStore
      .fetchRemoteModelCaps(model.serverId, model.remoteModelId)
      .catch(() => {});
  };

  // ── B8 (phase-4 4a): implementation lives in runtimeStore since batch 8 ──
  reinitializeContext = async (): Promise<void> => {
    await runtimeStore.reinitializeContext();
  };

  /**
   * Determines the full path for a model file on the device's storage.
   * This path is used for multiple purposes:
   * - As the destination path when downloading a model
   * - To check if a model is downloaded (by checking file existence at this path)
   * - To access the model file for operations like context initialization or deletion
   *
   * Path structure varies by model origin:
   * - LOCAL: Uses the model's fullPath property
   * - PRESET: Checks both legacy path (DocumentDirectoryPath/filename) and
   *          new path (DocumentDirectoryPath/models/preset/author/filename)
   * - HF: Uses DocumentDirectoryPath/models/hf/author/filename
   *
   * IMPORTANT: This logic is duplicated in native Swift code for iOS Shortcuts
   * See: ios/DRS AI/AppIntents/AssistantDataProvider.swift - parseModelPath() method
   * If we modify this function, we need to update the Swift version as well.
   *
   * @param model - The model object containing necessary metadata (origin, filename, author, etc.)
   * @returns Promise<string> - The full path where the model file is or should be stored
   * @throws Error if filename is undefined or if fullPath is undefined for local models
   */
  getModelFullPath = async (model: Model): Promise<string> => {
    // For local models, use the fullPath
    if (model.isLocal || model.origin === ModelOrigin.LOCAL) {
      if (!model.fullPath) {
        throw new Error('Full path is undefined for local model');
      }
      return this.resolveLocalModelPath(model);
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

      // Check if file exists at very old path first (for backwards compatibility)
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

    // For HF models, use author/repo/model structure with backwards compatibility
    if (model.origin === ModelOrigin.HF) {
      const author = model.author || 'unknown';

      // Try to get repo from model, or infer from model.id, or fallback to 'unknown'
      let repo = model.repo;
      if (!repo) {
        repo = inferRepoFromModelId(model.id) || 'unknown';
      }

      // Old path structure (for backwards compatibility)
      const oldPath = `${RNFS.DocumentDirectoryPath}/models/hf/${author}/${model.filename}`;

      // New path structure includes repository name
      const newPath = `${RNFS.DocumentDirectoryPath}/models/hf/${author}/${repo}/${model.filename}`;

      // Check if file exists at old path (backwards compatibility)
      // This handles: existing downloads, models after reset, models after app update
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
  };

  /**
   * Re-anchors a LOCAL model's stored absolute path onto the current app
   * container.
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
   * ios/DRS AI/AppIntents/AssistantDataProvider.swift. Keep the two in sync; the
   * shared '/models/local/' marker must match on both sides.
   */
  resolveLocalModelPath = async (model: Model): Promise<string> => {
    const storedPath = model.fullPath!;

    // A rejected exists() must not escape: getModelFullPath is treated as
    // non-throwing by every consumer, and deleteModel awaits it *outside* its
    // try (a throw would abort the delete before the unlink). An indeterminate
    // check is degraded to "not present" — recovery is attempted, and if it is
    // also indeterminate we fall through to the stored path so the existing
    // not-found handling still applies.
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
    this.pendingLocalPathRecoveries.set(model, recoveredPath);
    return recoveredPath;
  };

  /**
   * Applies every path recovered since the last flush in one runInAction, so a
   * container change that invalidates N local paths persists once rather than N
   * times. Called after refreshDownloadStatuses settles; entries for models no
   * longer in the store are dropped.
   */
  private flushPendingLocalPathRecoveries = () => {
    if (this.pendingLocalPathRecoveries.size === 0) {
      return;
    }
    const recoveries = Array.from(this.pendingLocalPathRecoveries.entries());
    this.pendingLocalPathRecoveries.clear();
    runInAction(() => {
      for (const [model, recoveredPath] of recoveries) {
        if (this.models.includes(model)) {
          model.fullPath = recoveredPath;
        }
      }
    });
  };

  async checkFileExists(model: Model) {
    const filePath = await this.getModelFullPath(model);
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
  }

  refreshDownloadStatuses = async () => {
    // Await every check: callers (notably initializeStore, which then runs
    // removeInvalidLocalModels) depend on isDownloaded being settled before they
    // prune.
    //
    // Each check is isolated: a single failure (e.g. an RNFS error, or a local
    // model with no fullPath) must not abort the others, and must leave
    // isDownloaded untouched rather than defaulting it to false — an
    // indeterminate result is not evidence the file is gone.
    await Promise.all(
      this.models.map(model =>
        this.checkFileExists(model).catch(error => {
          console.warn(
            '[ModelStore] Could not determine file status for model:',
            model.id,
            error,
          );
        }),
      ),
    );
    // Persist every path re-anchored during the pass in a single write.
    this.flushPendingLocalPathRecoveries();
  };

  initializeDownloadStatus = async () => {
    await this.refreshDownloadStatuses();
  };

  removeInvalidLocalModels = () => {
    runInAction(() => {
      this.models = this.models.filter(model => {
        // Keep all non-local models (preset and HF)
        if (!(model.isLocal || model.origin === ModelOrigin.LOCAL)) {
          return true;
        }
        // For local models, isDownloaded==true means the file exists, otherwise
        // it's invalid. Callers must let refreshDownloadStatuses settle first —
        // it re-anchors stale container paths (resolveLocalModelPath) so a
        // recoverable model is not treated as missing here.
        if (model.isDownloaded) {
          return true;
        }
        // Dropping a local model is unrecoverable (there is no download URL to
        // re-fetch from), so make it visible rather than silent.
        console.warn(
          '[ModelStore] Removing local model whose file is no longer present:',
          {modelId: model.id, name: model.name, fullPath: model.fullPath},
        );
        return false;
      });
    });
  };

  /**
   * Private method to handle projection model download for vision models
   * @param model The vision model that needs its projection model downloaded
   */
  private _downloadProjectionModelIfNeeded = async (model: Model) => {
    // Only auto-download for vision models that aren't projection models themselves
    if (
      !model.supportsMultimodal ||
      !model.defaultProjectionModel ||
      model.modelType === ModelType.PROJECTION
    ) {
      return;
    }

    // Check if vision is enabled for this model (uses getModelVisionPreference for proper default handling)
    if (!this.getModelVisionPreference(model)) {
      logger.debug(
        'Vision disabled for model, skipping projection model download:',
        model.id,
      );
      return;
    }

    const projModelId = model.defaultProjectionModel;
    const projModel = this.models.find(m => m.id === projModelId);

    if (
      projModel &&
      !projModel.isDownloaded &&
      !downloadManager.isDownloading(projModelId)
    ) {
      logger.debug('Auto-downloading projection model for vision model:', {
        llm: model.id,
        projection: projModelId,
      });

      try {
        // Download the projection model
        await this.checkSpaceAndDownload(projModelId);
      } catch (error) {
        console.error('Failed to auto-download projection model:', error);
        // Don't re-throw - projection model download failure shouldn't fail the main model download
        // The user can manually download the projection model later if needed
      }
    }
  };

  private _downloadDraftModelIfNeeded = async (model: Model) => {
    const draftModelId = resolveDraftModelId(
      model,
      this.contextInitParams.selectedDraftModelId,
    );
    if (
      !draftModelId ||
      model.modelType === ModelType.DRAFT ||
      !this.contextInitParams.speculativeEnabled
    ) {
      return;
    }

    const draftModel = this.models.find(m => m.id === draftModelId);

    if (
      draftModel &&
      !draftModel.isDownloaded &&
      !downloadManager.isDownloading(draftModelId)
    ) {
      logger.debug('Auto-downloading draft model for speculative target:', {
        target: model.id,
        draft: draftModelId,
      });

      try {
        await this.checkSpaceAndDownload(draftModelId);
      } catch (error) {
        console.error('Failed to auto-download draft model:', error);
        // Don't re-throw - draft download failure shouldn't fail the target download.
      }
    }
  };

  checkSpaceAndDownload = async (modelId: string) => {
    const model = this.models.find(m => m.id === modelId);
    // Skip if model is undefined, already downloaded, local or doesn't have a download URL
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
      const destinationPath = await this.getModelFullPath(model);
      const authToken = hfStore.shouldUseToken ? hfStore.hfToken : null;
      await downloadManager.startDownload(model, destinationPath, authToken, {
        networkType: modelHubStore.wifiOnlyDownloads ? 'WIFI' : 'ANY',
      });

      // For vision models, automatically download the projection model
      await this._downloadProjectionModelIfNeeded(model);
      await this._downloadDraftModelIfNeeded(model);
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
        this.downloadError = errorState;
      });

      // Re-throw so the caller knows the download failed
      throw err;
    }
  };

  cancelDownload = async (modelId: string) => {
    await downloadManager.cancelDownload(modelId);
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.isDownloaded = false;
        model.progress = 0;
      });
    }
    this.refreshDownloadStatuses();
  };

  get isDownloading() {
    return (modelId: string) => downloadManager.isDownloading(modelId);
  }

  /** Android pause (WorkManager PAUSED); no-op/false on iOS. */
  pauseDownload = async (modelId: string): Promise<boolean> =>
    downloadManager.pauseDownload(modelId);

  /** Resume a paused Android download from its persisted byte offset. */
  resumeDownload = async (modelId: string): Promise<boolean> =>
    downloadManager.resumeDownload(modelId);

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
  verifyDownloadedModel = async (model: Model): Promise<boolean> => {
    const MAX_HASH_VERIFY_BYTES = 4 * 1024 * 1024 * 1024;
    runInAction(() => {
      this.verifyingModelIds = [...this.verifyingModelIds, model.id];
    });
    try {
      const filePath = await this.getModelFullPath(model);
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
        const filePath = await this.getModelFullPath(model);
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
        this.downloadError = errorState;
      });
      return false;
    } finally {
      runInAction(() => {
        this.verifyingModelIds = this.verifyingModelIds.filter(
          id => id !== model.id,
        );
      });
    }
  };

  getDownloadProgress = (modelId: string) => {
    return downloadManager.getDownloadProgress(modelId);
  };

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
  }

  /**
   * Removes a model from the models list if it is not downloaded.
   * @param modelId - The ID of the model to remove.
   * @returns boolean - Returns true if the model was removed, false otherwise.
   */
  // ── B11 (phase-4 4a): implementation lives in catalogStore since batch 11.
  removeModelFromList = (model: Model): boolean =>
    catalogStore.removeModelFromList(model);

  deleteModel = async (model: Model) => {
    // id should work as well, as long as we are differentiating between models by origin.
    const modelIndex = this.models.findIndex(
      m => m.id === model.id && m.origin === model.origin,
    );
    if (modelIndex === -1) {
      return;
    }
    const _model = this.models[modelIndex];

    // Special handling for projection models
    if (_model.modelType === ModelType.PROJECTION) {
      const canDeleteResult = this.canDeleteProjectionModel(_model.id);
      if (!canDeleteResult.canDelete) {
        throw new Error(
          canDeleteResult.reason || 'Cannot delete projection model',
        );
      }

      // Disable vision for dependent models when their projection model is deleted
      if (
        canDeleteResult.dependentModels &&
        canDeleteResult.dependentModels.length > 0
      ) {
        // Use Promise.allSettled to handle potential errors gracefully
        await Promise.allSettled(
          canDeleteResult.dependentModels.map(dependentModel =>
            this.setModelVisionEnabled(dependentModel.id, false),
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
      // Add all compatible projection models (in case user downloaded additional ones)
      if (_model.compatibleProjectionModels) {
        _model.compatibleProjectionModels.forEach(id => {
          if (!projectionModelIds.includes(id)) {
            projectionModelIds.push(id);
          }
        });
      }
    }

    const filePath = await this.getModelFullPath(_model);
    if (_model.isLocal || _model.origin === ModelOrigin.LOCAL) {
      // Local models are always removed from the list, when the file is deleted.

      // Check if we need to release context (if this model is currently active)
      const needsContextRelease = this.activeModelId === _model.id;

      // Remove model from list first
      runInAction(() => {
        this.models.splice(modelIndex, 1);
      });

      // Release context if needed - this will handle all state cleanup
      if (needsContextRelease) {
        await this.releaseContext(true); // Clear active model and all related state
      }

      // Delete the file from internal storage
      try {
        await RNFS.unlink(filePath);
      } catch (err) {
        console.error('Failed to delete local model file:', err);
      }
    } else {
      // Non-local models are not removed from the list, when the file is deleted.
      logger.debug('deleting: ', filePath);

      try {
        if (filePath) {
          await RNFS.unlink(filePath);

          // Check if we need to release context (if this model is currently active)
          const needsContextRelease = this.activeModelId === _model.id;

          // Update model state first
          runInAction(() => {
            _model.progress = 0;
            _model.isDownloaded = false; // Mark as not downloaded after successful deletion
          });

          // Release context if needed - this will handle all state cleanup
          if (needsContextRelease) {
            await this.releaseContext(true); // Clear active model and all related state
          }

          //logger.debug('models: ', this.models);
        } else {
          console.error("Failed to delete, file doesn't exist: ", filePath);
        }
        this.refreshDownloadStatuses();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    }

    // After deleting an LLM, check if any of its projection models have become orphaned
    if (
      projectionModelIds.length > 0 &&
      _model.modelType !== ModelType.PROJECTION
    ) {
      await this.cleanupOrphanedProjectionModels(projectionModelIds);
    }

    if (this.contextInitParams.selectedDraftModelId === _model.id) {
      this.setSelectedDraftModel(undefined);
    }
  };

  /**
   * Fetch and persist GGUF metadata for a downloaded model
   * Called after download completes to enable accurate memory estimation
   */
  fetchAndPersistGGUFMetadata = async (model: Model) => {
    try {
      const filePath = await this.getModelFullPath(model);
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
  };

  /**
   * Load GGUF metadata for downloaded models that don't have it yet.
   * Runs in background, doesn't block startup.
   */
  private loadMissingGGUFMetadata = () => {
    const modelsNeedingMetadata = this.models.filter(
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
          await this.fetchAndPersistGGUFMetadata(model);
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
  };

  // ── B8 (phase-4 4a): resolveMultimodalConfig / checkMemoryAndConfirm /
  // proceedWithInitialization left with initContext (module-level helpers in
  // runtimeStore.ts — private members, no god-object surface needed).

  // ── B3 (phase-4 4a): implementations live in runtimeStore since batch 3 ──
  get effectiveDraftMode(): DraftConfig['mode'] {
    return runtimeStore.effectiveDraftMode;
  }

  get effectiveDraftCacheDefaults(): {k: CacheType; v: CacheType} {
    return runtimeStore.effectiveDraftCacheDefaults;
  }

  // ── B8 (phase-4 4a): implementation lives in runtimeStore (module
  // function). This private reverse delegation keeps the god-object surface
  // identical for the suites that exercise the private name directly (B1
  // pattern: every moved member keeps its delegation until its call sites
  // migrate at 4d).
  private resolveDraftConfig = async (model: Model): Promise<DraftConfig> =>
    resolveDraftConfigOf(runtimeStore, model);

  // ── B5 (phase-4 4a): implementations live in runtimeStore since batch 5 ──
  enterBenchmarkMode = async (): Promise<void> => {
    await runtimeStore.enterBenchmarkMode();
  };

  exitBenchmarkMode = (): void => {
    runtimeStore.exitBenchmarkMode();
  };

  // ── B8 (phase-4 4a): implementation lives in runtimeStore since batch 8
  // (its pre-flight helpers + proceedWithInitialization went with it as
  // module functions). Verbatim reverse delegation — dies at 4b when the
  // call sites migrate. The JSDoc moved with the body.
  initContext = async (
    model: Model,
    mmProjPath?: string,
  ): Promise<LlamaContext | null> => {
    return runtimeStore.initContext(model, mmProjPath);
  };

  // ── B7 (phase-4 4a): implementations live in runtimeStore since batch 7 ──
  releaseContext = async (
    clearActiveModel: boolean = false,
  ): Promise<string> => {
    return runtimeStore.releaseContext(clearActiveModel);
  };

  /** Internal release - caller must already hold the mutex. */
  // ── B7: implementation lives in runtimeStore (module function). This
  // private reverse delegation keeps the god-object surface identical for
  // the suite that exercises the private name directly (B1 pattern: every
  // moved member keeps its delegation until its call sites migrate at 4d).
  private _releaseContextInternal = async (
    clearActiveModel: boolean = false,
  ): Promise<string> => {
    return releaseContextInternal(this, clearActiveModel);
  };

  manualReleaseContext = async () => {
    await runtimeStore.manualReleaseContext();
  };

  // ── B3 (phase-4 4a): implementation lives in runtimeStore since batch 3 ──
  get activeModel(): Model | undefined {
    return runtimeStore.activeModel;
  }

  // ── B3 (phase-4 4a): capabilityEnv moved with its only consumer (capsFor);
  // implementation lives in runtimeStore since batch 3 ──
  /**
   * Capabilities of any model, active or not — the model card's entry point.
   * Never annotate it explicitly as `action`: that untracks the observable
   * reads, so every card would freeze on its first value while the suite
   * stayed green.
   */
  capsFor = (model: Model | undefined): ModelCapabilityView => {
    return runtimeStore.capsFor(model);
  };

  /** Capabilities of the live session — chat's entry point. */
  get activeModelCaps(): ModelCapabilityView {
    return runtimeStore.activeModelCaps;
  }

  // ── B10 (phase-4 4a): implementation lives in catalogStore since batch 10 ──
  get lastUsedModel(): Model | undefined {
    return catalogStore.lastUsedModel;
  }

  /**
   * Returns a string context identifier for the active model.
   * For local models: the numeric native context ID as a string.
   * For remote models: "remote-{serverId}" string.
   */
  // ── B3 (phase-4 4a): implementation lives in runtimeStore since batch 3 ──
  get contextId(): string | undefined {
    return runtimeStore.contextId;
  }

  /**
   * Derived from `serverStore.userSelectedModels` and `serverStore.servers` —
   * not from `serverModels`, so the list a server currently advertises does not
   * change which cards exist. Remote models are never stored in the persisted
   * `models` array.
   */
  // ── B10 (phase-4 4a): implementation lives in catalogStore since batch 10 ──
  get remoteModels(): Model[] {
    return catalogStore.remoteModels;
  }

  setActiveModel(modelId: string) {
    this.activeModelId = modelId;
  }

  /**
   * Set a remote model as the active model and create an OpenAI completion engine.
   * Releases any active local context first.
   */
  setRemoteModel = async (model: Model): Promise<void> => {
    if (!model.serverId || !model.remoteModelId) {
      throw new Error('Model is missing remote configuration');
    }

    // Release any existing context (local or remote)
    await this.releaseContext();

    const apiKey = await serverStore.getApiKey(model.serverId);
    const server = serverStore.servers.find(s => s.id === model.serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    runInAction(() => {
      this.engine = new OpenAICompletionEngine(
        server.url,
        model.remoteModelId!,
        apiKey,
        server.requestTimeoutMs,
        server.serverType,
      );
      this.activeRemoteBinding = {
        modelId: model.id,
        serverId: model.serverId!,
        remoteModelId: model.remoteModelId!,
        url: server.url,
        serverType: server.serverType,
      };
      this.setActiveModel(model.id);
      // Do NOT set lastUsedModelId for remote models -- server may be offline on next launch
    });

    serverStore
      .fetchRemoteModelCaps(model.serverId, model.remoteModelId, apiKey)
      .catch(() => {});
  };

  /**
   * Public method that routes model selection to the appropriate handler.
   * All callsites should use selectModel() instead of initContext() directly.
   * - Remote models: calls setRemoteModel()
   * - Local models: calls initContext()
   */
  selectModel = async (model: Model): Promise<void> => {
    if (model.origin === ModelOrigin.REMOTE) {
      await this.setRemoteModel(model);
    } else {
      await this.initContext(model);
    }
  };

  downloadHFModel = async (
    hfModel: HuggingFaceModel,
    modelFile: ModelFile,
    options?: {
      enableVision?: boolean;
      projectionModelId?: string; // User-selected projection model
    },
  ) => {
    try {
      const newModel = await this.addHFModel(hfModel, modelFile);
      if (!newModel) {
        throw new Error('Failed to add model to store');
      }

      // Set vision preference based on user choice
      if (newModel.supportsMultimodal && options?.enableVision !== undefined) {
        this.setModelVisionEnabled(newModel.id, options.enableVision);
        // runInAction(() => {
        //   newModel.visionEnabled = options.enableVision;
        // });
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
      this.checkSpaceAndDownload(newModel.id);

      // The error handling is now done in the downloadManager callbacks
    } catch (error) {
      // Only handle errors related to the initial setup before the download starts
      console.error('Failed to set up HF model download:', error);
      Alert.alert(
        uiStore.l10n.errors.downloadSetupFailedTitle,
        t(uiStore.l10n.errors.downloadSetupFailedMessage, {
          message: (error as Error).message,
        }),
      );
    }
  };

  /**
   * Adds a new HF model to the models list, only if it doesn't exist yet.
   * For multimodal models, ensures all required projection models are also added.
   * @param hfModel - The Hugging Face model to add.
   * @param modelFile - The model file to add.
   * @returns The new model that was added.
   */
  // ── B11 (phase-4 4a): implementation lives in catalogStore since batch 11.
  addHFModel = async (
    hfModel: HuggingFaceModel,
    modelFile: ModelFile,
  ): Promise<Model | undefined> => catalogStore.addHFModel(hfModel, modelFile);

  /**
   * Lazy-register a curated onboarding-assistant HF entry into `models`.
   * Single writer for HF-origin onboarding picks; only call site is
   * `useOnboardingHandlers.finish`. Synthesizes the minimal
   * `{hfModel, modelFile}` pair and delegates to `addHFModel`, which
   * provides idempotency. `siblings: []` keeps `isVisionRepo` false so
   * no projection model materializes (text-only by design).
   */
  // ── B11 (phase-4 4a): implementation lives in catalogStore since batch 11.
  registerOnboardingAssistantModel = async (
    entry: OnboardingAssistantModelEntry,
  ): Promise<Model | undefined> =>
    catalogStore.registerOnboardingAssistantModel(entry);

  // ── B11 (phase-4 4a): implementation lives in catalogStore since batch 11.
  removeModelByFullPath = (fullPath: string): void =>
    catalogStore.removeModelByFullPath(fullPath);

  // ── B11 (phase-4 4a): implementation lives in catalogStore since batch 11.
  addLocalModel = async (localFilePath: string) => {
    await catalogStore.addLocalModel(localFilePath);
  };

  // ── B12 (phase-4 4a): implementations live in catalogStore since batch 12.
  updateModelChatTemplate = (
    modelId: string,
    newConfig: ChatTemplateConfig,
  ): void => catalogStore.updateModelChatTemplate(modelId, newConfig);

  updateModelStopWords = (
    modelId: string,
    newStopWords: CompletionParams['stop'],
  ): void => catalogStore.updateModelStopWords(modelId, newStopWords);

  updateModelName = (modelId: string, newName: string): void =>
    catalogStore.updateModelName(modelId, newName);

  // ── B11 (phase-4 4a): implementation lives in catalogStore since batch 11.
  resetModels = async (): Promise<void> => {
    await catalogStore.resetModels();
  };

  // ── B12 (phase-4 4a): implementations live in catalogStore since batch 12.
  resetModelChatTemplate = (modelId: string): void =>
    catalogStore.resetModelChatTemplate(modelId);

  resetModelStopWords = (modelId: string): void =>
    catalogStore.resetModelStopWords(modelId);

  resetModelName = (modelId: string): void =>
    catalogStore.resetModelName(modelId);

  private async initializeGpuSettings() {
    const gpuCapabilities = await checkGpuSupport();

    // If GPU is not supported but currently enabled, disable it
    if (
      !gpuCapabilities.isSupported &&
      this.contextInitParams.no_gpu_devices === false
    ) {
      runInAction(() => {
        this.contextInitParams = {
          ...this.contextInitParams,
          no_gpu_devices: true,
          n_gpu_layers: 0,
        };
      });
    }
    // If GPU is supported, the persisted value will be used
  }

  setNoGpuDevices = (no_gpu_devices: boolean) => {
    runInAction(() => {
      this.contextInitParams = {
        ...this.contextInitParams,
        no_gpu_devices,
      };
    });
  };

  // New v2.0 setters
  setDevices = (devices: string[] | undefined) => {
    runInAction(() => {
      this.contextInitParams = {
        ...this.contextInitParams,
        devices,
      };
    });
  };

  setFlashAttnType = (flash_attn_type: 'auto' | 'on' | 'off') => {
    runInAction(() => {
      this.contextInitParams = {
        ...this.contextInitParams,
        flash_attn_type,
        // Reset cache types to F16 if flash attention is disabled
        ...(flash_attn_type !== 'off'
          ? {}
          : {
              cache_type_k: CacheType.F16,
              cache_type_v: CacheType.F16,
            }),
      };
    });
  };

  setKvUnified = (kv_unified: boolean) => {
    runInAction(() => {
      this.contextInitParams = {
        ...this.contextInitParams,
        kv_unified,
      };
    });
  };

  setNParallel = (n_parallel: number) => {
    runInAction(() => {
      this.contextInitParams = {
        ...this.contextInitParams,
        n_parallel,
      };
    });
  };

  // ── B4 (phase-4 4a): implementation lives in runtimeStore since batch 4 ──
  updateUseAutoRelease = (useAutoRelease: boolean) => {
    runtimeStore.updateUseAutoRelease(useAutoRelease);
  };

  /**
   * Updates stop tokens for a model based on its context and chat template
   * @param ctx - The LlamaContext instance
   * @param model - App model to update stop tokens for
   */
  private async updateModelStopTokens(ctx: LlamaContext, model: Model) {
    const storeModel = this.models.find(m => m.id === model.id);
    if (!storeModel) {
      return;
    }

    const stopTokens: string[] = [];

    try {
      // Get EOS token from model metadata
      const eos_token_id = Number(
        (ctx.model as any)?.metadata?.['tokenizer.ggml.eos_token_id'],
      );

      if (!isNaN(eos_token_id)) {
        const detokenized = await ctx.detokenize([eos_token_id]);
        if (detokenized) {
          stopTokens.push(detokenized);
        }
      }

      // Add relevant stop tokens from chat templates
      // First check model's custom chat template.
      const template = storeModel.chatTemplate?.chatTemplate;
      logger.debug('template: ', template);
      if (template) {
        const templateStops = stops.filter(stop => template.includes(stop));
        stopTokens.push(...templateStops);
      }

      // Then check context's chat template
      const ctxtTemplate = (ctx.model as any)?.metadata?.[
        'tokenizer.chat_template'
      ];
      if (ctxtTemplate) {
        const contextStops = stops.filter(stop => ctxtTemplate.includes(stop));
        stopTokens.push(...contextStops);
      }

      logger.debug('stopTokens: ', stopTokens);
      // Only update if we found stop tokens
      if (stopTokens.length > 0) {
        runInAction(() => {
          // Helper function to check and update stop tokens
          const updateStopTokens = (words: CompletionParams['stop']) => {
            const uniqueStops = Array.from(
              new Set([...(words || []), ...stopTokens]),
            ).filter(Boolean); // Remove any null/undefined/empty values
            return uniqueStops;
          };

          // Update both default and current completion settings
          storeModel.defaultStopWords = updateStopTokens(
            storeModel.defaultStopWords,
          );
          storeModel.stopWords = updateStopTokens(storeModel.stopWords);
        });
      }
    } catch (error) {
      console.error('Error updating model stop tokens:', error);
      // Continue execution - stop token update is not critical
    }
  }

  /**
   * Update model thinking capabilities based on the loaded context
   */
  private async updateModelThinkingCapabilities(
    ctx: LlamaContext,
    model: Model,
  ) {
    try {
      const storeModel = this.models.find(m => m.id === model.id);
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

  /**
   * Learn-from-stream entry point. The first time a model actually emits
   * reasoning, flip axis-1 to learned 'yes'. Routes remote ids to ServerStore
   * (one direction). Idempotent and monotonic; never overrides a user
   * declaration (handled by the per-store writers).
   */
  recordReasoningObserved = (modelId: string): void => {
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
  };

  /**
   * Manual model-card override. Top of precedence; routes remote ids to
   * ServerStore, local to the persisted Model.
   */
  setReasoningOverride = (modelId: string, cap: ReasoningCapability): void => {
    const localModel = this.models.find(m => m.id === modelId);
    if (!localModel) {
      serverStore.setRemoteReasoningOverride(modelId, cap);
      return;
    }
    runInAction(() => {
      localModel.reasoning = cap;
      localModel.supportsThinking = cap.isReasoning === 'yes';
    });
  };

  /**
   * Returns available (i.e. downloaded models) models with projection models filtered out,
   * plus remote models from configured servers.
   */
  // ── B10 (phase-4 4a): implementation lives in catalogStore since batch 10 ──
  get availableModels(): Model[] {
    return catalogStore.availableModels;
  }

  // ── B6 (phase-4 4a): implementations live in runtimeStore since batch 6 ──
  setInferencing(value: boolean) {
    runtimeStore.setInferencing(value);
  }

  setIsStreaming(value: boolean) {
    runtimeStore.setIsStreaming(value);
  }

  /**
   * Register an active completion promise for safe context release.
   * This should be called when starting a completion operation.
   * @param promise The completion promise to track
   */
  registerCompletionPromise(promise: Promise<any>) {
    registerCompletionPromiseOf(promise);
  }

  /**
   * Clear the active completion promise.
   * This should be called when the completion finishes (success or error).
   */
  clearCompletionPromise() {
    clearCompletionPromiseOf();
  }

  /**
   * Projection (multimodal mmproj) model management — implementation lives
   * in src/store/model/ProjectionModelManager.ts (audit F-12). Delegating
   * members preserve the public API of the store.
   */
  readonly projectionManager = new ProjectionModelManager(this);

  getCompatibleProjectionModels = (modelId: string): Model[] =>
    this.projectionManager.getCompatibleProjectionModels(modelId);

  setDefaultProjectionModel = (modelId: string, projectionModelId: string) =>
    this.projectionManager.setDefaultProjectionModel(
      modelId,
      projectionModelId,
    );

  getDefaultProjectionModel = (modelId: string): Model | undefined =>
    this.projectionManager.getDefaultProjectionModel(modelId);

  getLLMsUsingProjectionModel = (projectionModelId: string): Model[] =>
    this.projectionManager.getLLMsUsingProjectionModel(projectionModelId);

  getDownloadedLLMsUsingProjectionModel = (
    projectionModelId: string,
  ): Model[] =>
    this.projectionManager.getDownloadedLLMsUsingProjectionModel(
      projectionModelId,
    );

  hasRequiredProjectionModel = (model: Model): boolean =>
    this.projectionManager.hasRequiredProjectionModel(model);

  getProjectionModelStatus = (
    model: Model,
  ): {
    isAvailable: boolean;
    state: 'not_needed' | 'downloaded' | 'downloading' | 'missing';
    projectionModel?: Model;
  } => this.projectionManager.getProjectionModelStatus(model);

  canDeleteProjectionModel = (
    projectionModelId: string,
  ): {canDelete: boolean; reason?: string; dependentModels?: Model[]} =>
    this.projectionManager.canDeleteProjectionModel(projectionModelId);

  cleanupOrphanedProjectionModel = async (projectionModelId: string) =>
    this.projectionManager.cleanupOrphanedProjectionModel(projectionModelId);

  cleanupOrphanedProjectionModels = async (projectionModelIds: string[]) =>
    this.projectionManager.cleanupOrphanedProjectionModels(projectionModelIds);

  setModelVisionEnabled = async (modelId: string, enabled: boolean) =>
    this.projectionManager.setModelVisionEnabled(modelId, enabled);

  getModelVisionPreference = (model: Model): boolean =>
    this.projectionManager.getModelVisionPreference(model);

  /**
   * Starts a completion with one or more images
   * @param params - Completion parameters including image paths
   * @returns Promise<void>
   */
  // ── B6 (phase-4 4a): implementation lives in runtimeStore since batch 6 ──
  startImageCompletion = async (params: {
    prompt: string;
    image_path?: string; // For backward compatibility
    image_paths?: string[]; // New parameter for multiple images
    systemMessage?: string;
    onToken?: (token: string) => void;
    onComplete?: (text: string) => void;
    onError?: (error: Error) => void;
  }): Promise<void> => {
    await runtimeStore.startImageCompletion(params);
  };

  /**
   * Fetches and updates model file details from HuggingFace.
   * This is used when we need to get the lfs.oid for integrity checks.
   * @param model - The model to update
   * @returns Promise<void>
   */
  // ── B12 (phase-4 4a): implementation lives in catalogStore since batch 12.
  async fetchAndUpdateModelFileDetails(model: Model): Promise<void> {
    return catalogStore.fetchAndUpdateModelFileDetails(model);
  }

  // Expensive operation.
  // It will be calculating hash if hash is not set, unless force is true.
  // ── B12 (phase-4 4a): implementation lives in catalogStore since batch 12.
  updateModelHash = async (modelId: string, force: boolean = false) => {
    await catalogStore.updateModelHash(modelId, force);
  };

  // ── B12 (phase-4 4a): implementation lives in catalogStore since batch 12.
  isModelAvailable = (modelId?: string): boolean =>
    catalogStore.isModelAvailable(modelId);

  // /**
  //  * Gets localized strings based on the current language from uiStore
  //  */
  // getL10n() {
  //   const language = uiStore.language;
  //   // Import the l10n object from locales
  //   const {l10n} = require('../locales');
  //   // Return the localized strings for the current language
  //   return l10n[language];
  // }

  clearDownloadError = () => {
    this.downloadError = null;
  };

  // ── B7 (phase-4 4a): implementation lives in runtimeStore since batch 7 ──
  clearModelLoadError = () => {
    runtimeStore.clearModelLoadError();
  };

  retryDownload = () => {
    const modelId = this.downloadError?.metadata?.modelId;
    this.clearDownloadError();

    if (modelId) {
      // Find the model and retry download
      const model = this.models.find(m => m.id === modelId);
      if (model) {
        this.checkSpaceAndDownload(model.id);
      }
    }
  };
}

export const modelStore = new ModelStore();
