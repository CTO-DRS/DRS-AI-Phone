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

import {uiStore} from '.';
import {serverStore} from './ServerStore';
import {getOriginalModelName} from '../utils/formatters';
import type {OnboardingAssistantModelEntry} from './onboarding/onboardingAssistants';

import {downloadManager} from '../services/downloads';
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
import {ReasoningCapability} from '../utils/reasoningCapability';
import type {ModelCapabilityView} from '../utils/modelCaps';
import {t} from '../locales';
import {createDefaultContextInitParams} from '../utils/contextInitParamsVersions';
import NativeHardwareInfo from '../specs/NativeHardwareInfo';
import {logger} from '../utils/logger';
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
  catalogLoadMissingGGUFMetadata,
  catalogResolvePresets,
  catalogUpgradeToFetchedRules,
  importLegacyCatalogState,
  injectCatalogHost,
  projectionManager,
} from './model/catalogStore';
// B16 (phase-4 4a): the download-status family (state + implementations)
// physically lives in downloadStore — reverse delegations and writable
// accessor pairs below (B10 shape). Direct import: the god→download edge is
// the declared madge step toward the B16 ledger value.
import {
  downloadStore,
  mutationSync,
  importLegacyDownloadState,
  _downloadDraftModelIfNeeded,
  _downloadProjectionModelIfNeeded,
} from './model/downloadStore';
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
  initializeGpuSettings as initializeGpuSettingsOf,
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
  // ── B16 (phase-4 4a): real state lives in downloadStore (box; §2 #7
  // transient). Writable accessor pair — the B10 shape.
  get verifyingModelIds(): string[] {
    return downloadStore.verifyingModelIds;
  }
  set verifyingModelIds(value: string[]) {
    downloadStore.verifyingModelIds = value;
  }

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

  // ── B18 (phase-4 4a): pendingLocalPathRecoveries (private Map) moved to
  // downloadStore with its family (resolveLocalModelPath writer /
  // flushPendingLocalPathRecoveries flusher — both real there since B18,
  // the flush is module-local).

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

  // ── B16 (phase-4 4a): real state lives in downloadStore (box; §2 #5
  // transient). Writable accessor pair — the B10 shape. The mutationSync
  // block and the B17/B19 download flows keep writing through it until
  // their batches.
  get downloadError(): ErrorState | null {
    return downloadStore.downloadError;
  }
  set downloadError(value: ErrorState | null) {
    downloadStore.downloadError = value;
  }
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
  // ── B20 (phase-4 4a): real state lives in downloadStore (box). PERSISTED
  // via the `downloadStore:v2` root since B20 — the rehydration clause is
  // honored: the one-time legacy import seeds it from the old ModelStore
  // payload (B10 pattern; legacy-key cleanup deferred to B22/4e).
  get pendingProjectionCleanupIds(): string[] {
    return downloadStore.pendingProjectionCleanupIds;
  }
  set pendingProjectionCleanupIds(value: string[]) {
    downloadStore.pendingProjectionCleanupIds = value;
  }

  constructor() {
    makeAutoObservable(this, {
      activeModel: computed,
      activeModelCaps: computed,
      contextId: computed,
      remoteModels: computed,
      activeDownloads: computed,
      // B15: the PM field moved to catalogStore (module singleton) — the
      // annotation entry retired with it.
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
      // B20 (phase-4 4a): downloadStore:v2 persist root — the projection-
      // cleanup queue key moved physically to downloadStore (§3 pattern);
      // the one-time legacy import distributes the old all-in-one payload.
      // Ordering mirrors the catalog root: v2 hydration first, legacy seed
      // second. ج25 — wiring dies 4e.
      await makePersistable(downloadStore, {
        name: 'downloadStore:v2',
        properties: ['pendingProjectionCleanupIds'],
        storage: AsyncStorage,
      });
      await importLegacyDownloadState();
      await initializeModelSystem({
        catalog: this,
        download: this,
        runtime: this,
        initializeStore: () => this.initializeStore(),
        initializeThreadCount: () => this.initializeThreadCount(),
      });
    });

    this.setupAppStateListener();

    // ── B17 (phase-4 4a): the mutationSync composition (downloadManager
    // setCallbacks block) moved verbatim into downloadStore — the constructor
    // calls it (ج25-family wiring — dies at 4e with the composition root).
    mutationSync();
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
  // ── B13 (phase-4 4a): implementation lives in catalogStore since batch 13.
  healDraftVisionClassification = (): void =>
    catalogStore.healDraftVisionClassification();

  /**
   * Delete projection models the heal orphaned. Runs every launch: an id
   * stays queued while its download is still in flight or its deletion
   * fails, so a kill or an unfinished mmproj download cannot strand the
   * file forever. An id whose projection model has downloaded dependents is
   * legitimately shared — dropped, never deleted.
   */
  // ── B20 (phase-4 4a): implementation lives in downloadStore since batch
  // 20 (projection-cleanup family; the queue box is downloadStore:v2 state).
  drainPendingProjectionCleanup = async () => {
    await downloadStore.drainPendingProjectionCleanup();
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
  // ── B14 (phase-4 4a): reprobeRemoteCapsIfUnknown moved into runtimeStore
  // (module function) — its only caller was handleAppStateChange there; the
  // private member and the ج5 cast died with the move.

  // ── B8 (phase-4 4a): implementation lives in runtimeStore since batch 8 ──
  reinitializeContext = async (): Promise<void> => {
    await runtimeStore.reinitializeContext();
  };

  // ── B18 (phase-4 4a): implementation lives in downloadStore since batch
  // 18 (files/storage family — doc comment moved verbatim with it).
  getModelFullPath = async (model: Model): Promise<string> =>
    downloadStore.getModelFullPath(model);


  // ── B18 (phase-4 4a): implementation lives in downloadStore since batch
  // 18 (files/storage family — doc comment moved verbatim with it).
  resolveLocalModelPath = async (model: Model): Promise<string> =>
    downloadStore.resolveLocalModelPath(model);




  // ── B18 (phase-4 4a): implementation lives in downloadStore since batch 18.
  checkFileExists = async (model: Model): Promise<void> => {
    await downloadStore.checkFileExists(model);
  };


  /**
   * Reactive list of in-flight downloads. Each entry carries the Model object
   * plus the latest formatted progress strings so observers can render a
   * banner / sheet / list row without re-deriving anything per frame.
   */
  // ── B16 (phase-4 4a): real implementation lives in downloadStore (see the
  // delegating getter further below, next to its original site).
  getDownloadProgress = (modelId: string): number =>
    downloadStore.getDownloadProgress(modelId);

  // ── B16 (phase-4 4a): implementation lives in downloadStore since batch 16
  // (ج34: its body still reaches the file-family through the facade until B18;
  // ج26's substance lands — the owner implements the family — while the hop
  // stays facade-mediated because a static catalogStore→downloadStore import
  // would re-close the B14 load-order cycle).
  refreshDownloadStatuses = async () => {
    await downloadStore.refreshDownloadStatuses();
  };

  // ── B16 (phase-4 4a): implementation lives in downloadStore since batch 16.
  initializeDownloadStatus = async () => {
    await downloadStore.initializeDownloadStatus();
  };

  // ── B18 (phase-4 4a): implementation lives in downloadStore since batch
  // 18 (the models-list write dispatches through the downloadStore
  // implementation; the facade read/write pair remains until 4e).
  removeInvalidLocalModels = () => {
    downloadStore.removeInvalidLocalModels();
  };


  // ── B20 (phase-4 4a): the pair is module-local on downloadStore — these
  // PRIVATE reverse delegates keep the god-object surface identical for the
  // ModelStore.test.ts drives (`as any`, B1/B13 pattern); they die with the
  // facade family at 4d/4e.
  private _downloadProjectionModelIfNeeded = async (model: Model) => {
    await _downloadProjectionModelIfNeeded(model);
  };

  private _downloadDraftModelIfNeeded = async (model: Model) => {
    await _downloadDraftModelIfNeeded(model);
  };

  // ── B17 (phase-4 4a): implementations live in downloadStore since batch 17.
  checkSpaceAndDownload = async (modelId: string): Promise<void> => {
    await downloadStore.checkSpaceAndDownload(modelId);
  };

  // ── B17 (phase-4 4a): implementation lives in downloadStore since batch 17.
  cancelDownload = async (modelId: string): Promise<void> => {
    await downloadStore.cancelDownload(modelId);
  };

  // ── B16 (phase-4 4a): implementation lives in downloadStore since batch 16
  // (SEMANTIC TRAP preserved: getter returning a function).
  get isDownloading(): (modelId: string) => boolean {
    return downloadStore.isDownloading;
  }

  // ── B17 (phase-4 4a): implementation lives in downloadStore since batch 17.
  pauseDownload = async (modelId: string): Promise<boolean> =>
    downloadStore.pauseDownload(modelId);

  // ── B17 (phase-4 4a): implementation lives in downloadStore since batch 17.
  resumeDownload = async (modelId: string): Promise<boolean> =>
    downloadStore.resumeDownload(modelId);

  /** Resume a paused Android download from its persisted byte offset. */

  // ── B19 (phase-4 4a): implementation lives in downloadStore since batch
  // 19 (verification family — doc comment moved verbatim with it).
  verifyDownloadedModel = async (model: Model): Promise<boolean> =>
    downloadStore.verifyDownloadedModel(model);


  /**
   * Reactive list of in-flight downloads. Each entry carries the Model object
   * plus the latest formatted progress strings so observers can render a
   * banner / sheet / list row without re-deriving anything per frame.
   */
  // ── B16 (phase-4 4a): implementation lives in downloadStore since batch 16.
  get activeDownloads(): Array<{
    modelId: string;
    model: Model;
    progress: number;
    bytesDownloaded: number;
    bytesTotal: number;
    speedLabel: string;
    etaLabel: string;
  }> {
    return downloadStore.activeDownloads;
  }

  /**
   * Removes a model from the models list if it is not downloaded.
   * @param modelId - The ID of the model to remove.
   * @returns boolean - Returns true if the model was removed, false otherwise.
   */
  // ── B11 (phase-4 4a): implementation lives in catalogStore since batch 11.
  removeModelFromList = (model: Model): boolean =>
    catalogStore.removeModelFromList(model);

  // ── B19 (phase-4 4a): implementation lives in downloadStore since batch 19
  // (117-line composite: file delete + list removal + context release +
  // orphan check + stale draft clear; cross-domain dispatches on the facade).
  deleteModel = async (model: Model) => {
    await downloadStore.deleteModel(model);
  };


  /**
   * Fetch and persist GGUF metadata for a downloaded model
   * Called after download completes to enable accurate memory estimation
   */
  // ── B13 (phase-4 4a): implementation lives in catalogStore since batch 13.
  fetchAndPersistGGUFMetadata = async (model: Model) => {
    await catalogStore.fetchAndPersistGGUFMetadata(model);
  };

  /**
   * Load GGUF metadata for downloaded models that don't have it yet.
   * Runs in background, doesn't block startup.
   */
  // ── B13 (phase-4 4a): implementation lives in catalogStore (module function
  // catalogLoadMissingGGUFMetadata). Private reverse delegation keeps the
  // god-object surface identical for initializeStore until B23 (B1 pattern).
  private loadMissingGGUFMetadata = () => {
    catalogLoadMissingGGUFMetadata();
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
  // ── B14 (phase-4 4a): implementation lives in catalogStore since batch 14.
  setRemoteModel = async (model: Model): Promise<void> =>
    catalogStore.setRemoteModel(model);

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

  // ── B19 (phase-4 4a): implementation lives in downloadStore since batch 19
  // (HF entry composite: addHFModel catalog dispatch + vision/projection
  // options + checkSpaceAndDownload kick-off via the ج28 facade shape).
  downloadHFModel = async (
    hfModel: HuggingFaceModel,
    modelFile: ModelFile,
    options?: {
      enableVision?: boolean;
      projectionModelId?: string; // User-selected projection model
    },
  ) => {
    await downloadStore.downloadHFModel(hfModel, modelFile, options);
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

  // ── B21 (phase-4 4a): implementation lives in runtimeStore (module
  // function — host-write shape); private reverse delegate keeps the god
  // surface identical for the initializeStore call site until B23
  // (B1/B13 pattern).
  private async initializeGpuSettings() {
    await initializeGpuSettingsOf();
  }

  // ── B21 (phase-4 4a): implementations live in runtimeStore since batch 21
  // (host-write shape — the B1 family; the host retires at B22).
  setNoGpuDevices = (no_gpu_devices: boolean) => {
    runtimeStore.setNoGpuDevices(no_gpu_devices);
  };

  // New v2.0 setters
  setDevices = (devices: string[] | undefined) => {
    runtimeStore.setDevices(devices);
  };

  setFlashAttnType = (flash_attn_type: 'auto' | 'on' | 'off') => {
    runtimeStore.setFlashAttnType(flash_attn_type);
  };

  setKvUnified = (kv_unified: boolean) => {
    runtimeStore.setKvUnified(kv_unified);
  };

  setNParallel = (n_parallel: number) => {
    runtimeStore.setNParallel(n_parallel);
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

  // ── B14 (phase-4 4a): updateModelThinkingCapabilities moved into
  // catalogStore (module function catalogUpdateModelThinkingCapabilities) —
  // its caller proceedWithInitialization (runtimeStore) imports it directly;
  // the private member and the ج18 member-half cast died with the move.

  /**
   * Learn-from-stream entry point. The first time a model actually emits
   * reasoning, flip axis-1 to learned 'yes'. Routes remote ids to ServerStore
   * (one direction). Idempotent and monotonic; never overrides a user
   * declaration (handled by the per-store writers).
   */
  // ── B14 (phase-4 4a): implementation lives in catalogStore since batch 14.
  recordReasoningObserved = (modelId: string): void =>
    catalogStore.recordReasoningObserved(modelId);

  /**
   * Manual model-card override. Top of precedence; routes remote ids to
   * ServerStore, local to the persisted Model.
   */
  // ── B14 (phase-4 4a): implementation lives in catalogStore since batch 14.
  setReasoningOverride = (modelId: string, cap: ReasoningCapability): void =>
    catalogStore.setReasoningOverride(modelId, cap);

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
  // ── B15 (phase-4 4a): ProjectionModelManager re-homed, part 1 — the ONE
  // instance is constructed and exported by catalogStore (module bottom); the
  // god's field died with the batch. The five projection-catalog members are
  // real on catalogStore (below); the download/runtime-facing members (B19/
  // B20) flip their delegation to the re-homed instance until their batches.
  getCompatibleProjectionModels = (modelId: string): Model[] =>
    catalogStore.getCompatibleProjectionModels(modelId);

  setDefaultProjectionModel = (
    modelId: string,
    projectionModelId: string,
  ): void => catalogStore.setDefaultProjectionModel(modelId, projectionModelId);

  getDefaultProjectionModel = (modelId: string): Model | undefined =>
    catalogStore.getDefaultProjectionModel(modelId);

  getLLMsUsingProjectionModel = (projectionModelId: string): Model[] =>
    catalogStore.getLLMsUsingProjectionModel(projectionModelId);

  // ── B20: the quartet stays a PM delegation on the god — downloadStore's
  // B20 surface dispatches these THROUGH the facade (importing the PM
  // singleton into downloadStore breaks the requireActual factories /
  // load-order: ج32/ج33 family). Dies with the facade family at 4e.
  getDownloadedLLMsUsingProjectionModel = (
    projectionModelId: string,
  ): Model[] =>
    projectionManager.getDownloadedLLMsUsingProjectionModel(
      projectionModelId,
    );

  hasRequiredProjectionModel = (model: Model): boolean =>
    catalogStore.hasRequiredProjectionModel(model);

  getProjectionModelStatus = (
    model: Model,
  ): {
    isAvailable: boolean;
    state: 'not_needed' | 'downloaded' | 'downloading' | 'missing';
    projectionModel?: Model;
  } => projectionManager.getProjectionModelStatus(model);

  canDeleteProjectionModel = (
    projectionModelId: string,
  ): {canDelete: boolean; reason?: string; dependentModels?: Model[]} =>
    projectionManager.canDeleteProjectionModel(projectionModelId);

  // Explicit Promise<void>: the PM-side inference chain passes through the
  // un-annotated manager methods + the facade-routed host (ج33) — an
  // annotation here breaks the circular return inference (TS7024).
  cleanupOrphanedProjectionModel = async (
    projectionModelId: string,
  ): Promise<void> =>
    projectionManager.cleanupOrphanedProjectionModel(projectionModelId);

  cleanupOrphanedProjectionModels = async (
    projectionModelIds: string[],
  ): Promise<void> =>
    projectionManager.cleanupOrphanedProjectionModels(projectionModelIds);

  // ── B14 (phase-4 4a): implementations live in catalogStore since batch 14
  // (ج31 died at B15: the members call the re-homed PM directly).
  setModelVisionEnabled = async (
    modelId: string,
    enabled: boolean,
  ): Promise<void> => catalogStore.setModelVisionEnabled(modelId, enabled);

  getModelVisionPreference = (model: Model): boolean =>
    catalogStore.getModelVisionPreference(model);

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

  // ── B16 (phase-4 4a): implementation lives in downloadStore since batch 16.
  clearDownloadError = () => {
    downloadStore.clearDownloadError();
  };

  // ── B7 (phase-4 4a): implementation lives in runtimeStore since batch 7 ──
  clearModelLoadError = () => {
    runtimeStore.clearModelLoadError();
  };

  // ── B17 (phase-4 4a): implementation lives in downloadStore since batch 17.
  retryDownload = (): void => {
    downloadStore.retryDownload();
  };
}

export const modelStore = new ModelStore();
