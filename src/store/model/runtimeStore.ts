import type {ModelStore} from '../ModelStore';
// Barrel-routed ON PURPOSE: test suites mock the store barrel; a direct
// '../ModelStore' import would bypass their mocks and construct the real
// singleton (network fetch + DeviceInfo) inside every suite that renders
// a migrated component. Type-only import keeps the Pick<ModelStore,...>
// compile-time drift guard. Revisit at Phase 4 dissolution.
import {modelStore, serverStore} from '../';
import {observable, runInAction} from 'mobx';
import {Platform} from 'react-native';
import type {ContextParams} from 'llama.rn';
import {
  CacheType,
  ContextInitParams,
  DraftConfig,
  Model,
  ModelOrigin,
} from '../../utils/types';
import {resolveUseMmap} from '../../utils/memorySettings';
import {resolveDeviceSelection} from '../../utils/deviceSelection';
import {draftCacheDefaults, effectiveDraftModeOf} from '../draftResolution';
import {resolveModelCaps} from '../../utils/modelCaps';
import type {CapabilityEnv, ModelCapabilityView} from '../../utils/modelCaps';

/**
 * runtimeStore — Phase-1 scaffold (fix 4, stage 1 of 4).
 * See docs/audit-worklog.md for the full decomposition plan.
 *
 * ═══════════════════════════ MIGRATION CONTRACT ═══════════════════════════
 * ZERO-LOGIC pass-through to the modelStore singleton (until Phase 4).
 *
 * Domain: context/engine lifecycle, active session, generation entry points,
 * GPU/context parameter surface, benchmark mode, memory + auto-release
 * (owner-approved map, session 3):
 *   • session identity: activeModel, activeModelId, setActiveModel,
 *     selectModel, context, contextId, engine, activeRemoteBinding, appState
 *   • lifecycle: initContext, reinitializeContext, releaseContext,
 *     manualReleaseContext, isContextLoading, loadingModel
 *   • parameters: contextInitParams, activeContextSettings,
 *     getEffectiveContextInitParams (+ deprecated getEffective* shims),
 *     max_threads, MIN_CONTEXT_SIZE, setNThreads, setCacheTypeK/V,
 *     setNBatch, setNUBatch, setNContext, setNGPULayers, setImageMaxTokens,
 *     setUseMlock, setUseMmap, setNoExtraBufts, setSpeculativeEnabled,
 *     setSelectedDraftModel, setSpecDraft*, setNoGpuDevices, setDevices,
 *     setFlashAttnType, setKvUnified, setNParallel
 *   • generation: startImageCompletion, inferencing, isStreaming,
 *     setInferencing, setIsStreaming
 *   • benchmark: benchmarkActive, enterBenchmarkMode, exitBenchmarkMode
 *   • failure/memory: modelLoadError, clearModelLoadError,
 *     availableMemoryCeiling, largestSuccessfulLoad
 *   • auto-release: useAutoRelease, isAutoReleaseEnabled, enableAutoRelease,
 *     disableAutoRelease, updateUseAutoRelease, wasAutoReleased,
 *     lastAutoReleasedModelId, handleAppStateChange, setupAppStateListener,
 *     checkAndReloadAutoReleasedModel
 *   • capabilities view: capsFor, activeModelCaps, effectiveDraftMode,
 *     effectiveDraftCacheDefaults
 *   • projection cleanup family (PROVISIONAL until Phase 3 review):
 *     pendingProjectionCleanupIds, drainPendingProjectionCleanup,
 *     cleanupOrphanedProjectionModel, cleanupOrphanedProjectionModels
 *
 * Call-site migration (Phase 3): a file migrates only if zero `modelStore`
 * references remain after the swap.
 *
 * REHYDRATION CLAUSE (Phase 4 gate): context/GPU parameter preferences are
 * user-tunable state persisted today on the god object's persistence key;
 * when they move here the rehydration must be versioned — dropping a user's
 * n_ctx / GPU / draft preferences on upgrade = migration failure.
 * ══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════ B1 (phase-4 4a): FIRST PHYSICAL MEMBERS ═══════════════
// The 16 context-parameter setters (setNThreads..setSpecDraftCacheTypeV) are
// the first members whose implementation physically lives here instead of the
// god object. They write contextInitParams, which stays on the god object
// until B22 (persist-key migration). Access is therefore INJECTED, never
// imported: the ModelStore constructor calls injectRuntimeHost(this) before
// any setter can run, and each setter writes through that host — the MobX
// observable field, the action wrapper, and the write semantics are the
// god object's own. Zero modelStore references — the inside counter drops
// by exactly the 16 delegation lines this batch replaces.
// The host stays NARROW (B1 shape): real members that are consumed during
// render by migrated components read state through the store's own
// pass-through getters / the barrel binding — which suites mock — never
// through requireHost() (no constructor runs in barrel-mocked suites).
// The host is for WRITE paths only until B22 retires it (extraction-plan §8).
export interface RuntimeHost {
  contextInitParams: ContextInitParams;
}

let runtimeHost: RuntimeHost | null = null;

/**
 * DI injection point (ModelStore constructor). Must run before any parameter
 * setter; a setter called without a host is a lifecycle bug and throws.
 */
export function injectRuntimeHost(host: RuntimeHost): void {
  runtimeHost = host;
}

function requireHost(): RuntimeHost {
  if (!runtimeHost) {
    throw new Error(
      'runtimeStore: host not injected — ModelStore must call injectRuntimeHost before store members run',
    );
  }
  return runtimeHost;
}

// B1 setters keep their narrow alias — their bodies stay byte-identical.
function hostInitParams(): RuntimeHost {
  return requireHost();
}

// capabilityEnv moved verbatim (a PRIVATE member of the god object — it is
// not part of the runtime contract, so it lives at module level here). It
// reads the runtime flags through the store's OWN getters and serverStore
// through the BARREL (mocked in suites, real in production) — exactly the
// collaborator resolution the central mock's own implementation uses, so
// barrel-mocked suites see identical behavior with no host on render paths.
function capabilityEnvOf(s: RuntimeStore): CapabilityEnv {
  return {
    remoteCaps: serverStore.remoteCaps,
    listCaps: serverStore.listCaps,
    binding: s.activeRemoteBinding,
    isMultimodalActive: s.isMultimodalActive,
    activeContextSettings: s.activeContextSettings,
    activeModelId: s.activeModelId,
  };
}

// ═══════════ B2 (phase-4 4a): FIRST REAL STATE + PURE CONSTANT ═══════════
// max_threads: the real state home is this module (observable box). The god
// object's `max_threads` accessor pair forwards here — initializeThreadCount
// writes through it (until B22 moves the writer into bootstrap) and the
// Settings UI reads it; MobX tracks the same box through both paths, so
// observer re-render semantics are unchanged. Writes wrap in runInAction
// like every B1 setter.
const maxThreads = observable.box<number>(4);

// MIN_CONTEXT_SIZE: pure constant — no host, no state. Exported at module
// level; runtimeStore.MIN_CONTEXT_SIZE and the god object's delegating
// getter both return it verbatim.
export const MIN_CONTEXT_SIZE = 200;

export const RUNTIME_MEMBERS = [
  'activeModel',
  'activeModelId',
  'setActiveModel',
  'selectModel',
  'context',
  'contextId',
  'engine',
  'isContextLoading',
  'loadingModel',
  'initContext',
  'reinitializeContext',
  'releaseContext',
  'manualReleaseContext',
  'contextInitParams',
  'activeContextSettings',
  'getEffectiveContextInitParams',
  'getEffectiveBatchValues',
  'getEffectiveInitSettings',
  'getEffectiveValues',
  'max_threads',
  'MIN_CONTEXT_SIZE',
  'setNThreads',
  'setCacheTypeK',
  'setCacheTypeV',
  'setNBatch',
  'setNUBatch',
  'setNContext',
  'setNGPULayers',
  'setImageMaxTokens',
  'setUseMlock',
  'setUseMmap',
  'setNoExtraBufts',
  'setSpeculativeEnabled',
  'setSelectedDraftModel',
  'setSpecDraftNGpuLayers',
  'setSpecDraftCacheTypeK',
  'setSpecDraftCacheTypeV',
  'setNoGpuDevices',
  'setDevices',
  'setFlashAttnType',
  'setKvUnified',
  'setNParallel',
  'isMultimodalActive',
  'activeProjectionModelId',
  'startImageCompletion',
  'inferencing',
  'isStreaming',
  'setInferencing',
  'setIsStreaming',
  'benchmarkActive',
  'enterBenchmarkMode',
  'exitBenchmarkMode',
  'modelLoadError',
  'clearModelLoadError',
  'availableMemoryCeiling',
  'largestSuccessfulLoad',
  'useAutoRelease',
  'isAutoReleaseEnabled',
  'enableAutoRelease',
  'disableAutoRelease',
  'updateUseAutoRelease',
  'wasAutoReleased',
  'lastAutoReleasedModelId',
  'handleAppStateChange',
  'setupAppStateListener',
  'checkAndReloadAutoReleasedModel',
  'capsFor',
  'activeModelCaps',
  'effectiveDraftMode',
  'effectiveDraftCacheDefaults',
  'activeRemoteBinding',
  'appState',
  'pendingProjectionCleanupIds',
  'drainPendingProjectionCleanup',
  'cleanupOrphanedProjectionModel',
  'cleanupOrphanedProjectionModels',
] as const;

export type RuntimeMember = (typeof RUNTIME_MEMBERS)[number];

/** Compile-time drift guard: ModelStore signature changes break this file. */
export type RuntimeStore = Pick<ModelStore, RuntimeMember>;

export const runtimeStore: RuntimeStore = {
  // ── B3 (phase-4 4a): real implementation (was god-object computed) ──
  // Reads the list through the barrel binding (mocked in suites, the real
  // god object in production) — identical data to the pre-move body; the
  // read flips to catalogStore when B10 relocates the list.
  get activeModel(): Model | undefined {
    // Derivation over the singleton's lists — the god object's own computed
    // logic. Optional chains + the host-guarded tail are mock-compat:
    // partial barrel suites stub `activeModel` as DATA with no lists; there
    // (and only there — runtimeHost is null because no constructor ran)
    // this returns exactly what the old pass-through returned. In production
    // both lists always exist and the host is injected, so the fallback is
    // unreachable and cannot recurse through the delegating getter. The
    // fallback dies at 4c (sub-store mocks) / B10 (list relocation).
    const derived =
      modelStore.models?.find(model => model.id === this.activeModelId) ||
      modelStore.remoteModels?.find(model => model.id === this.activeModelId);
    if (derived || runtimeHost) {
      return derived;
    }
    return modelStore.activeModel;
  },
  get activeModelId() {
    return modelStore.activeModelId;
  },
  get context() {
    return modelStore.context;
  },
  // ── B3 (phase-4 4a): real implementation ──
  get contextId(): string | undefined {
    if (this.context) {
      return String(this.context.id);
    }
    const model = this.activeModel;
    if (model?.origin === ModelOrigin.REMOTE && model.serverId) {
      return `remote-${model.serverId}`;
    }
    return undefined;
  },
  get engine() {
    return modelStore.engine;
  },
  get isContextLoading() {
    return modelStore.isContextLoading;
  },
  get loadingModel() {
    return modelStore.loadingModel;
  },
  get contextInitParams() {
    return modelStore.contextInitParams;
  },
  get activeContextSettings() {
    return modelStore.activeContextSettings;
  },
  // ── B2 (phase-4 4a): real state (box above) + pure constant (module) ──
  get max_threads() {
    return maxThreads.get();
  },
  set max_threads(value: number) {
    runInAction(() => {
      maxThreads.set(value);
    });
  },
  get MIN_CONTEXT_SIZE() {
    return MIN_CONTEXT_SIZE;
  },
  get isMultimodalActive() {
    return modelStore.isMultimodalActive;
  },
  get activeProjectionModelId() {
    return modelStore.activeProjectionModelId;
  },
  get inferencing() {
    return modelStore.inferencing;
  },
  get isStreaming() {
    return modelStore.isStreaming;
  },
  get benchmarkActive() {
    return modelStore.benchmarkActive;
  },
  get modelLoadError() {
    return modelStore.modelLoadError;
  },
  get availableMemoryCeiling() {
    return modelStore.availableMemoryCeiling;
  },
  get largestSuccessfulLoad() {
    return modelStore.largestSuccessfulLoad;
  },
  get useAutoRelease() {
    return modelStore.useAutoRelease;
  },
  get isAutoReleaseEnabled() {
    return modelStore.isAutoReleaseEnabled;
  },
  get wasAutoReleased() {
    return modelStore.wasAutoReleased;
  },
  get lastAutoReleasedModelId() {
    return modelStore.lastAutoReleasedModelId;
  },
  get appState() {
    return modelStore.appState;
  },
  get activeRemoteBinding() {
    return modelStore.activeRemoteBinding;
  },
  // ── B3 (phase-4 4a): draft/capabilities surface — real implementations ──
  /** Capabilities of the live session — chat's entry point. */
  get activeModelCaps(): ModelCapabilityView {
    return this.capsFor(this.activeModel);
  },
  get effectiveDraftMode(): DraftConfig['mode'] {
    // The barrel binding structurally satisfies DraftResolutionSource
    // (models + activeModel + contextInitParams) in BOTH worlds — the real
    // god object in production, the central mock in barrel-mocked suites —
    // same shape as the pre-move `effectiveDraftModeOf(this)`.
    return effectiveDraftModeOf(modelStore);
  },
  get effectiveDraftCacheDefaults(): {k: CacheType; v: CacheType} {
    return draftCacheDefaults(
      this.effectiveDraftMode,
      this.contextInitParams.flash_attn_type === 'on',
    );
  },
  get pendingProjectionCleanupIds() {
    return modelStore.pendingProjectionCleanupIds;
  },
  setActiveModel: (...args) => modelStore.setActiveModel(...args),
  selectModel: (...args) => modelStore.selectModel(...args),
  initContext: (...args) => modelStore.initContext(...args),
  reinitializeContext: (...args) => modelStore.reinitializeContext(...args),
  releaseContext: (...args) => modelStore.releaseContext(...args),
  manualReleaseContext: (...args) => modelStore.manualReleaseContext(...args),
  /**
   * Get effective context initialization parameters with constraints applied
   * This is the unified method that replaces both getEffectiveBatchValues and getEffectiveInitSettings
   *
   * B2 (phase-4 4a): implementation moved verbatim from ModelStore. Method
   * shorthand on purpose — `this.contextInitParams` is this store's own
   * getter, which proxies the god object's observable field until B22
   * relocates the persist key, so the read chain (and MobX tracking) is
   * identical to the pre-move body.
   */
  async getEffectiveContextInitParams(
    filePath?: string,
    draftConfig?: DraftConfig,
  ): Promise<Omit<ContextParams, 'model'>> {
    // Apply batch constraints
    const effectiveContext = this.contextInitParams.n_ctx;
    const effectiveBatch = Math.min(
      this.contextInitParams.n_batch,
      effectiveContext,
    );
    const effectiveUBatch = Math.min(
      this.contextInitParams.n_ubatch,
      effectiveBatch,
    );

    // Resolve the effective use_mmap value based on the setting
    const currentUseMmap = this.contextInitParams.use_mmap;
    let effectiveUseMmap: boolean;

    if (currentUseMmap === 'smart') {
      // Handle 'smart' option
      effectiveUseMmap = filePath
        ? await resolveUseMmap('smart', filePath)
        : true;
    } else if (currentUseMmap === 'true') {
      effectiveUseMmap = true;
    } else if (currentUseMmap === 'false') {
      effectiveUseMmap = false;
    } else {
      // Default fallback
      effectiveUseMmap = true;
    }

    const mode = draftConfig?.mode ?? 'off';
    const speculative = mode !== 'off';

    // Handle flash_attn_type (v2.0) - platform-specific default
    const flashAttnModeDefault =
      mode === 'paired'
        ? 'off'
        : mode === 'embedded'
          ? 'auto'
          : Platform.OS === 'ios'
            ? 'auto'
            : 'off';
    const flash_attn_type =
      this.contextInitParams.flash_attn_type ?? flashAttnModeDefault;

    // Build the params object, filtering out undefined values
    const params: Partial<Omit<ContextParams, 'model'>> = {
      n_ctx: effectiveContext,
      n_batch: effectiveBatch,
      n_ubatch: effectiveUBatch,
      n_threads: this.contextInitParams.n_threads,
      flash_attn_type, // NEW: replaces flash_attn boolean
      cache_type_k: this.contextInitParams.cache_type_k,
      cache_type_v: this.contextInitParams.cache_type_v,
      n_gpu_layers: this.contextInitParams.n_gpu_layers ?? 99,
      devices: this.contextInitParams.devices?.slice(),
      kv_unified: this.contextInitParams.kv_unified ?? true, // NEW (default true!)
      n_parallel: this.contextInitParams.n_parallel ?? 1, // NEW (1 for blocking mode only)
      use_mlock: this.contextInitParams.use_mlock,
      use_mmap: effectiveUseMmap,
      no_extra_bufts: this.contextInitParams.no_extra_bufts,
    };

    if (speculative) {
      // llama.rn's speculative type set stays empty without spec_type — nothing engages.
      params.spec_type = 'draft-mtp';

      // llama.rn throws on spec_draft_n_max <= 0 with DRAFT_MTP.
      params.spec_draft_n_max =
        this.contextInitParams.spec_draft_n_max !== undefined
          ? Math.max(1, this.contextInitParams.spec_draft_n_max)
          : undefined;
      params.spec_draft_n_min = this.contextInitParams.spec_draft_n_min;
      params.spec_draft_p_min = this.contextInitParams.spec_draft_p_min;
      params.spec_draft_p_split = this.contextInitParams.spec_draft_p_split;

      const cacheDefaults = draftCacheDefaults(mode, flash_attn_type === 'on');
      params.spec_draft_cache_type_k =
        this.contextInitParams.spec_draft_cache_type_k ?? cacheDefaults.k;
      // With flash attention explicitly off a quantized draft V cache can
      // never load (llama.cpp hard-refuses it) — clamp even an explicit pick.
      const draftV =
        this.contextInitParams.spec_draft_cache_type_v ?? cacheDefaults.v;
      params.spec_draft_cache_type_v =
        flash_attn_type === 'off' && draftV !== CacheType.F16
          ? CacheType.F16
          : draftV;

      if (draftConfig?.mode === 'paired') {
        params.model_draft = draftConfig.resolvedDraftPath;
        params.is_model_draft_asset = false;
        params.spec_draft_n_gpu_layers =
          this.contextInitParams.spec_draft_n_gpu_layers ?? 99;
      } else {
        params.spec_draft_n_gpu_layers =
          this.contextInitParams.spec_draft_n_gpu_layers;
      }
    }

    Object.assign(
      params,
      await resolveDeviceSelection({
        devices: params.devices,
        n_gpu_layers: params.n_gpu_layers,
      }),
    );

    // Remove undefined values from the params object
    return Object.fromEntries(
      Object.entries(params).filter(([_, value]) => value !== undefined),
    ) as Omit<ContextParams, 'model'>;
  },

  // Legacy methods for backward compatibility

  /** @deprecated Use getEffectiveContextInitParams instead */
  getEffectiveBatchValues() {
    const effectiveContext = this.contextInitParams.n_ctx;
    const effectiveBatch = Math.min(
      this.contextInitParams.n_batch,
      effectiveContext,
    );
    const effectiveUBatch = Math.min(
      this.contextInitParams.n_ubatch,
      effectiveBatch,
    );

    return {
      n_ctx: effectiveContext,
      n_batch: effectiveBatch,
      n_ubatch: effectiveUBatch,
    };
  },

  /** @deprecated Use getEffectiveContextInitParams instead */
  async getEffectiveInitSettings(
    filePath?: string,
  ): Promise<Omit<ContextParams, 'model'>> {
    return this.getEffectiveContextInitParams(filePath);
  },

  /** @deprecated Use getEffectiveBatchValues instead */
  getEffectiveValues() {
    return this.getEffectiveBatchValues();
  },
  setNThreads: (n_threads: number) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        n_threads,
      };
    });
  },

  setCacheTypeK: (cache_type: CacheType) => {
    runInAction(() => {
      const host = hostInitParams();
      // Only allow changing cache type if flash attention is enabled
      // Support both old flash_attn and new flash_attn_type
      const flashAttnEnabled =
        host.contextInitParams.flash_attn ||
        (host.contextInitParams.flash_attn_type &&
          host.contextInitParams.flash_attn_type !== 'off');

      if (flashAttnEnabled) {
        host.contextInitParams = {
          ...host.contextInitParams,
          cache_type_k: cache_type,
        };
      }
    });
  },

  setCacheTypeV: (cache_type: CacheType) => {
    runInAction(() => {
      const host = hostInitParams();
      // Only allow changing cache type if flash attention is enabled
      // Support both old flash_attn and new flash_attn_type
      const flashAttnEnabled =
        host.contextInitParams.flash_attn ||
        (host.contextInitParams.flash_attn_type &&
          host.contextInitParams.flash_attn_type !== 'off');

      if (flashAttnEnabled) {
        host.contextInitParams = {
          ...host.contextInitParams,
          cache_type_v: cache_type,
        };
      }
    });
  },

  setNBatch: (n_batch: number) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        n_batch,
      };
    });
  },

  setNUBatch: (n_ubatch: number) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        n_ubatch,
      };
    });
  },

  setNContext: (n_ctx: number) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        n_ctx,
      };
    });
  },

  setNGPULayers: (n_gpu_layers: number) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        n_gpu_layers,
      };
    });
  },

  setImageMaxTokens: (image_max_tokens: number) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        image_max_tokens,
      };
    });
  },

  setUseMlock: (use_mlock: boolean) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        use_mlock,
      };
    });
  },

  setUseMmap: (use_mmap: 'true' | 'false' | 'smart') => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        use_mmap,
      };
    });
  },

  setNoExtraBufts: (no_extra_bufts: boolean) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        no_extra_bufts,
      };
    });
  },

  setSpeculativeEnabled: (speculativeEnabled: boolean) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        speculativeEnabled,
      };
    });
  },

  setSelectedDraftModel: (selectedDraftModelId?: string) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        selectedDraftModelId,
      };
    });
  },

  setSpecDraftNGpuLayers: (spec_draft_n_gpu_layers: number) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        spec_draft_n_gpu_layers,
      };
    });
  },

  setSpecDraftCacheTypeK: (spec_draft_cache_type_k: CacheType) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        spec_draft_cache_type_k,
      };
    });
  },

  setSpecDraftCacheTypeV: (spec_draft_cache_type_v: CacheType) => {
    runInAction(() => {
      const host = hostInitParams();
      host.contextInitParams = {
        ...host.contextInitParams,
        spec_draft_cache_type_v,
      };
    });
  },
  setNoGpuDevices: (...args) => modelStore.setNoGpuDevices(...args),
  setDevices: (...args) => modelStore.setDevices(...args),
  setFlashAttnType: (...args) => modelStore.setFlashAttnType(...args),
  setKvUnified: (...args) => modelStore.setKvUnified(...args),
  setNParallel: (...args) => modelStore.setNParallel(...args),
  startImageCompletion: (...args) => modelStore.startImageCompletion(...args),
  setInferencing: (...args) => modelStore.setInferencing(...args),
  setIsStreaming: (...args) => modelStore.setIsStreaming(...args),
  enterBenchmarkMode: (...args) => modelStore.enterBenchmarkMode(...args),
  exitBenchmarkMode: (...args) => modelStore.exitBenchmarkMode(...args),
  clearModelLoadError: (...args) => modelStore.clearModelLoadError(...args),
  enableAutoRelease: (...args) => modelStore.enableAutoRelease(...args),
  disableAutoRelease: (...args) => modelStore.disableAutoRelease(...args),
  updateUseAutoRelease: (...args) => modelStore.updateUseAutoRelease(...args),
  handleAppStateChange: (...args) => modelStore.handleAppStateChange(...args),
  setupAppStateListener: (...args) => modelStore.setupAppStateListener(...args),
  checkAndReloadAutoReleasedModel: (...args) =>
    modelStore.checkAndReloadAutoReleasedModel(...args),
  /**
   * Capabilities of any model, active or not — the model card's entry point.
   * (The god object's delegation keeps the original comment: never annotate
   * it explicitly as `action` — that untracks the observable reads, so every
   * card would freeze on its first value while the suite stayed green.)
   * Method shorthand + capabilityEnvOf(): plain function, no MobX annotation
   * of its own — tracking belongs to the caller's reaction/computed.
   */
  capsFor(model: Model | undefined): ModelCapabilityView {
    return resolveModelCaps(model, capabilityEnvOf(this));
  },
  drainPendingProjectionCleanup: (...args) =>
    modelStore.drainPendingProjectionCleanup(...args),
  cleanupOrphanedProjectionModel: (...args) =>
    modelStore.cleanupOrphanedProjectionModel(...args),
  cleanupOrphanedProjectionModels: (...args) =>
    modelStore.cleanupOrphanedProjectionModels(...args),
};
