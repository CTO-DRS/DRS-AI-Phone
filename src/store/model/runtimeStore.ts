import type {ModelStore} from '../ModelStore';
// Barrel-routed ON PURPOSE: test suites mock the store barrel; a direct
// '../ModelStore' import would bypass their mocks and construct the real
// singleton (network fetch + DeviceInfo) inside every suite that renders
// a migrated component. Type-only import keeps the Pick<ModelStore,...>
// compile-time drift guard. Revisit at Phase 4 dissolution.
import {modelStore, serverStore, chatSessionStore, uiStore} from '../';
// B10: catalog reads/writes go to the OWNER — direct import (ج1/ج15/ج21
// death mode per the §8 registry: "استيراد المالك بحافة madge معلنة").
// The module is never mocked; in barrel-mocked suites its guard getters
// fall through to the central mock exactly like the pre-B10 pass-through.
import {catalogStore, catalogUpdateModelThinkingCapabilities} from './catalogStore';
import {capsMatchBinding} from '../../utils/remoteCaps';
import {observable, runInAction, toJS} from 'mobx';
import {Alert, AppState, AppStateStatus, Platform} from 'react-native';
import {ContextParams, LlamaContext, initLlama} from 'llama.rn';
import {
  CacheType,
  ContextInitParams,
  DraftConfig,
  Model,
  ModelOrigin,
  RemoteSessionBinding,
} from '../../utils/types';
import {resolveUseMmap} from '../../utils/memorySettings';
import {resolveDeviceSelection} from '../../utils/deviceSelection';
import {stops} from '../../utils/chat';
import {createDefaultContextInitParams} from '../../utils/contextInitParamsVersions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  draftCacheDefaults,
  effectiveDraftModeOf,
  resolveDraftCandidate,
  unpairedDraftCandidate,
} from '../draftResolution';
import {resolveModelCaps} from '../../utils/modelCaps';
import type {CapabilityEnv, ModelCapabilityView} from '../../utils/modelCaps';
import {logger} from '../../utils/logger';
import {ErrorState, createErrorState} from '../../utils/errors';
import NativeHardwareInfo from '../../specs/NativeHardwareInfo';
import {
  CompletionEngine,
  CompletionParams,
  toApiCompletionParams,
} from '../../utils/completionTypes';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';
import {LocalCompletionEngine} from '../../api/completionEngines';
import {hasEnoughMemory} from '../../hooks/useMemoryCheck';
import {createContextInitParams} from '../../utils/contextInitParamsVersions';
import {getModelMemoryRequirement} from '../../utils/memoryEstimator';
import {
  checkGpuSupport,
  isHighEndDevice,
} from '../../utils/deviceCapabilities';

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

/**
 * B21 — GPU initialization probe (moved off the god object's private).
 * Exported for the god's PRIVATE reverse delegate (B1/B13 pattern — the
 * ModelStore.test.ts surface stays identical; the initializeStore call site
 * keeps routing through the delegate until B23). Writes via the host
 * (B1 shape): if GPU is unsupported but currently enabled, disable it.
 */
export async function initializeGpuSettings() {
  const gpuCapabilities = await checkGpuSupport();

  if (
    !gpuCapabilities.isSupported &&
    contextInitParamsBox.get().no_gpu_devices === false
  ) {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        no_gpu_devices: true,
        n_gpu_layers: 0,
      });
    });
  }
  // If GPU is supported, the persisted value will be used
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

// ═══════════ B4 (phase-4 4a): auto-release family — real state + logic ═══════════
// appState + autoReleaseDisabledReasons are NOT persisted → their real state
// moves here (box / observable set). The three persist keys (useAutoRelease,
// wasAutoReleased, lastAutoReleasedModelId) KEEP their state on the god
// object until the v2 persist roots exist (B22+/§3): mobx-persist-store
// skips computed properties when saving (isComputedProp guard), so an
// accessor pair would silently disable persistence. Their methods here read
// and write them through the barrel binding (mocked in suites).
const appStateBox = observable.box<AppStateStatus>(AppState.currentState);
const autoReleaseDisabledReasons = observable.set<string>();

// B5: benchmarkActive — real state (box; not persisted). The e2e runner
// claims/releases the native context through enter/exitBenchmarkMode.
const benchmarkActiveBox = observable.box<boolean>(false);

// B6: completion flags — real state (boxes; not persisted). The promise
// guards safe context release (releaseContext awaits it — now local since
// B7 moved the release family; the ج11 reader bridge died with it).
const inferencingBox = observable.box<boolean>(false);
const isStreamingBox = observable.box<boolean>(false);
const activeCompletionPromiseBox = observable.box<Promise<any> | null>(null);

// registerCompletionPromise / clearCompletionPromise moved verbatim (public
// members outside the phase-1 runtime contract, so they live at module level
// with thin god-object delegations).
export function registerCompletionPromiseOf(promise: Promise<any>) {
  activeCompletionPromiseBox.set(promise);
}

export function clearCompletionPromiseOf() {
  activeCompletionPromiseBox.set(null);
}

// B7: lifecycle-1 state. The mutex is a plain module binding (a promise
// chain — never UI-reactive; the god object's observable annotation carried
// no observers). pendingModelId likewise (internal last-one-wins guard).
// B8: initContext relocated into this module — the exported accessors the
// god object reached through (bridge ج12) died with the move; both guards
// are plain module-private bindings now.
let contextOperationMutex: Promise<void> = Promise.resolve();
let pendingModelId: string | null = null;

// B7: modelLoadError — real state (box; not persisted).
const modelLoadErrorBox = observable.box<ErrorState | null>(null);

// ───────────── B8 (phase-4 4a): lifecycle-2 — real state ─────────────
// The context/session state moves as boxes: context, engine, activeModelId,
// isMultimodalActive, activeProjectionModelId, activeRemoteBinding (the six
// whose releaseContextInternal barrel-writes were bridge ج13 — dies this
// batch per the §8 registry), plus isContextLoading/loadingModel (batch row).
// The god object keeps accessor pairs (writable computeds — the B2/B7
// pattern) so every external consumer, the injected host and the suites see
// identical state and reactivity. activeContextSettings /
// availableMemoryCeiling / largestSuccessfulLoad stay god-object-resident
// (persist keys / B22); lastUsedModelId moved to catalogStore in B10 —
// writes to it go through the owner (ج21 dead, §8 registry).
const isContextLoadingBox = observable.box<boolean>(false);
const loadingModelBox = observable.box<Model | undefined>(undefined);
const contextBox = observable.box<LlamaContext | undefined>(undefined);
const engineBox = observable.box<CompletionEngine | undefined>(undefined);
const activeModelIdBox = observable.box<string | undefined>(undefined);
const isMultimodalActiveBox = observable.box<boolean>(false);
const activeProjectionModelIdBox = observable.box<string | undefined>(
  undefined,
);
const activeRemoteBindingBox = observable.box<RemoteSessionBinding | undefined>(
  undefined,
);

// markAutoReleased / clearAutoReleaseFlags (private members) moved verbatim;
// they write the persist-key flags through the barrel binding until the v2
// roots relocate them.
function markAutoReleased(s: RuntimeStore, modelId: string) {
  // Skip auto-release for remote models (no native context to release)
  const model = s.activeModel;
  if (model?.origin === ModelOrigin.REMOTE) {
    return;
  }
  logger.debug('Marking auto-released: ', modelId);
  runInAction(() => {
    modelStore.wasAutoReleased = true;
    modelStore.lastAutoReleasedModelId = modelId;
  });
}

function clearAutoReleaseFlags() {
  logger.debug('Clearing auto-release flags');
  runInAction(() => {
    modelStore.wasAutoReleased = false;
    modelStore.lastAutoReleasedModelId = undefined;
  });
}

// ═══════════ B2 (phase-4 4a): FIRST REAL STATE + PURE CONSTANT ═══════════
// max_threads: the real state home is this module (observable box). The god
// object's `max_threads` accessor pair forwards here — initializeThreadCount
// writes through it (until B22 moves the writer into bootstrap) and the
// Settings UI reads it; MobX tracks the same box through both paths, so
// observer re-render semantics are unchanged. Writes wrap in runInAction
// like every B1 setter.
// ── B22 (phase-4 4a): host retirement — WRITE paths are host-free (the B1
// setters + B21 GPU family write the boxes natively). The READ guards
// (ج22) survive until 4e as scheduled — they need a liveness signal to
// distinguish production (constructor ran → the boxes ARE the state) from
// barrel-mocked suites (no constructor → the mock singleton owns the state).
// markRuntimeLive() is called from the exact constructor position
// injectRuntimeHost(this) occupied; the RuntimeHost interface and the
// contextInitParams write-access injection are gone for good.
let runtimeLive = false;

/**
 * Liveness mark (ModelStore constructor). Read-guard signal only — the
 * write paths never consult it. Dies at 4e together with the guards.
 */
export function markRuntimeLive(): void {
  runtimeLive = true;
}

// ── B22 (phase-4 4a): real state — the persisted runtime keys move here ──
// contextInitParams was the god object's field (ModelStore persist list);
// availableMemoryCeiling / largestSuccessfulLoad were reassigned to B22 by
// the B9 record (their state rides the runtimeStore:v2 root — rehydration
// clause honored via importLegacyRuntimeState, B10 pattern). Transient:
// activeContextSettings (never persisted).
const contextInitParamsBox = observable.box<ContextInitParams>(
  createDefaultContextInitParams(),
);
const activeContextSettingsBox = observable.box<
  ContextInitParams | undefined
>(undefined);
const availableMemoryCeilingBox = observable.box<number | undefined>(
  undefined,
);
const largestSuccessfulLoadBox = observable.box<number | undefined>(
  undefined,
);

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

/** Internal release - caller must already hold the mutex. */
export async function releaseContextInternal(
  s: {
    context?: LlamaContext;
    engine?: CompletionEngine;
    inferencing: boolean;
    isStreaming: boolean;
    isMultimodalActive: boolean;
    activeProjectionModelId?: string;
    activeRemoteBinding?: RemoteSessionBinding;
    activeModelId?: string;
    availableMemoryCeiling: number | undefined;
  },
  clearActiveModel: boolean = false,
): Promise<string> {
  logger.debug('attempt to release');
  chatSessionStore.exitEditMode();
  // Hoisted on purpose: TS narrowing does not persist across statements
  // for getter accesses.
  const context = s.context;
  if (!context) {
    // For remote models or deletion scenarios, clear engine and state
    const engine = s.engine;
    if (engine || clearActiveModel) {
      // Stop any active remote completion
      if (engine) {
        try {
          await engine.stopCompletion();
        } catch {
          // Ignore errors from stopping remote completion
        }
      }
      runInAction(() => {
        s.engine = undefined;
        s.activeRemoteBinding = undefined;
        if (clearActiveModel) {
          s.activeModelId = undefined;
        }
        s.isMultimodalActive = false;
        s.activeProjectionModelId = undefined;
      });
    }
    if (!s.engine && !clearActiveModel) {
      return 'No context to release';
    }
    return 'Remote engine cleared';
  }

  try {
    // IMPORTANT: Stop-Await-Release Pattern
    // This prevents race condition where completion callback fires after context is freed
    // which causes SIGSEGV in isMultimodalEnabled/createCompletionResult
    if (s.inferencing || s.isStreaming || activeCompletionPromiseBox.get()) {
      logger.debug('Stopping active completion before context release');

      // Step 1: Signal the completion to stop
      try {
        await context.stopCompletion();
      } catch (stopError) {
        console.warn('Error stopping completion:', stopError);
        // Continue with release even if stop fails
      }

      // Step 2: Wait for the completion promise to actually finish
      // This is critical - stopCompletion() only signals, it doesn't wait
      const activePromise = activeCompletionPromiseBox.get();
      if (activePromise) {
        logger.debug('Waiting for completion promise to finish...');
        try {
          // Wait for promise to settle (ignore errors, just wait for it to complete)
          await activePromise.catch(() => {});
        } catch {
          // Ignore any errors, we just need to wait
        }
        clearCompletionPromiseOf();
      }

      // Clear inference flags
      runInAction(() => {
        inferencingBox.set(false);
        isStreamingBox.set(false);
      });
    }

    // Step 3: Now safe to release - First check if multimodal is enabled and release it if needed
    if (s.isMultimodalActive) {
      logger.debug('Releasing multimodal context first');
      try {
        await context.releaseMultimodal();
        // Immediately clear multimodal state after successful release
        runInAction(() => {
          s.isMultimodalActive = false;
          s.activeProjectionModelId = undefined;
        });
        logger.debug('Multimodal context released and state cleared');
      } catch (error) {
        console.error('Error releasing multimodal context:', error);
        // Even if release fails, clear the state to prevent blocking deletion
        runInAction(() => {
          s.isMultimodalActive = false;
          s.activeProjectionModelId = undefined;
        });
      }
    }

    // Then release the main context
    await context.release();
    logger.debug('released');
  } catch (error) {
    console.error('Error during context release:', error);
  } finally {
    runInAction(() => {
      s.context = undefined;
      s.engine = undefined;
      s.activeRemoteBinding = undefined;
      // B22 (§3-أ persist-root boundary): activeContextSettings stays on the
      // god object until the v2 roots exist — barrel write survives (ج13 tail).
      modelStore.activeContextSettings = undefined;
      // Ensure multimodal state is cleared even if something went wrong above
      s.isMultimodalActive = false;
      s.activeProjectionModelId = undefined;
      // Clear active model if requested (for deletion scenarios)
      if (clearActiveModel) {
        s.activeModelId = undefined;
      }
    });

    // Update availableMemoryCeiling after release (clean state)
    try {
      const availableBytes = await NativeHardwareInfo.getAvailableMemory();
      runInAction(() => {
        if (
          s.availableMemoryCeiling === undefined ||
          availableBytes > s.availableMemoryCeiling
        ) {
          modelStore.availableMemoryCeiling = availableBytes;
        }
      });
    } catch (error) {
      console.warn(
        '[ModelStore] Failed to update availableMemoryCeiling:',
        error,
      );
    }
  }
  return 'Context released successfully';
}

// ═══════════ B8 (phase-4 4a): lifecycle-2 — private helpers, moved verbatim ═══════════
// pairedDraftModel + the four pre-flight/initialization helpers leave the god
// object with initContext (batch row B8). They are private members (not part
// of the runtime contract), so they live at module level — the releaseContext-
// Internal pattern. Cross-domain reads/writes that must wait for later batches
// go through the barrel binding with declared deaths in the §8 registry:
//   getModelVisionPreference (ج16 → B14),
//   getModelFullPath (ج17 → B18), updateModelStopTokens (ج18 → B23),
//   updateModelThinkingCapabilities (ج18 → B14),
//   activeContextSettings write (ج19 → B22), largestSuccessfulLoad write
//   (ج20 → B22).
// Died in B10: models reads (ج15), lastUsedModelId write (ج21) — both flip
// to catalogStore, the owner.
const pairedDraftModel = (config?: DraftConfig): Model | undefined =>
  config?.mode === 'paired' ? config.draftModel : undefined;

// ج18 (B8): two still-private god-object members, reached through a narrow
// structural view — same pattern as the ج5 reprobe read. The cast form is
// invisible to the line counter by design; the deaths are the registry's.

async function resolveMultimodalConfig(
  model: Model,
  mmProjPath?: string,
): Promise<{
  isMultimodalInit: boolean;
  resolvedMmProjPath?: string;
  projectionModel?: Model;
}> {
  const visionEnabled = catalogStore.getModelVisionPreference(model);

  // Priority 1: Explicit path provided by caller
  if (mmProjPath && visionEnabled) {
    return {isMultimodalInit: true, resolvedMmProjPath: mmProjPath};
  }

  // Priority 2: Auto-resolve from model's default projection model
  if (
    model.supportsMultimodal &&
    model.defaultProjectionModel &&
    visionEnabled
  ) {
    // B10: the list reads its OWNER (bridge ج15 died — §8 registry).
    const projectionModel = catalogStore.models.find(
      m => m.id === model.defaultProjectionModel,
    );
    if (projectionModel?.isDownloaded) {
      // ج17 died at B18 (file-family re-homed to downloadStore; the
      // implementation now lives there — this line remains a facade dispatch,
      // ج28-family, dies with the facade at 4e).
      const resolvedPath = await modelStore.getModelFullPath(projectionModel);
      return {
        isMultimodalInit: true,
        resolvedMmProjPath: resolvedPath,
        projectionModel,
      };
    }
  }

  // Default: No multimodal support
  return {isMultimodalInit: false};
}

export async function resolveDraftConfig(
  s: RuntimeStore,
  model: Model,
): Promise<DraftConfig> {
  const candidate = resolveDraftCandidate(
    model,
    catalogStore.models, // B10: owner read (ج15 dead — §8 registry)
    s.contextInitParams,
  );
  if (candidate.mode !== 'paired') {
    return candidate;
  }

  // ج17 died at B18 (file-family re-homed to downloadStore; this line
  // remains a facade dispatch, ج28-family, dies with the facade at 4e).
  const resolvedDraftPath = await modelStore.getModelFullPath(
    candidate.draftModel,
  );
  if (resolvedDraftPath) {
    return {
      mode: 'paired',
      resolvedDraftPath,
      draftModel: candidate.draftModel,
    };
  }

  return unpairedDraftCandidate(model);
}

/**
 * Check memory/capability requirements and show warning alert if needed.
 * Returns true if user confirms or no warning needed, false if cancelled.
 */
async function checkMemoryAndConfirm(
  model: Model,
  isMultimodalInit: boolean,
  projectionModel?: Model,
  draftModel?: Model,
): Promise<boolean> {
  let hasMemory = true;
  try {
    hasMemory = await hasEnoughMemory(model, projectionModel, draftModel);
  } catch (error) {
    console.error('Memory check failed:', error);
    return false;
  }

  const isCapable = isMultimodalInit ? await isHighEndDevice() : true;
  const hasMemoryIssue = !hasMemory;
  const hasCapabilityIssue = isMultimodalInit && !isCapable;

  if (!hasMemoryIssue && !hasCapabilityIssue) {
    return true; // No warning needed
  }

  console.warn(
    `Device performance warning for model: ${model.name} - Memory: ${hasMemoryIssue}, Capability: ${hasCapabilityIssue}`,
  );

  let title: string;
  let message: string;

  if (hasMemoryIssue && hasCapabilityIssue) {
    title = uiStore.l10n.memory.alerts.combinedWarningTitle;
    message = uiStore.l10n.memory.alerts.combinedWarningMessage;
  } else if (hasMemoryIssue) {
    title = uiStore.l10n.memory.alerts.memoryWarningTitle;
    message = uiStore.l10n.memory.alerts.memoryWarningMessage;
  } else {
    title = uiStore.l10n.memory.alerts.multimodalWarningTitle;
    message = uiStore.l10n.memory.alerts.multimodalWarningMessage;
  }

  // Show alert and wait for user decision - this happens OUTSIDE the mutex
  return new Promise<boolean>(resolve => {
    Alert.alert(title, message, [
      {
        text: uiStore.l10n.memory.alerts.cancel,
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: uiStore.l10n.memory.alerts.continue,
        onPress: () => resolve(true),
      },
    ]);
  });
}

/**
 * Proceed with the actual model initialization after device capability checks
 */
async function proceedWithInitialization(
  s: RuntimeStore,
  model: Model,
  mmProjPath?: string,
  isMultimodalInit: boolean = false,
  projectionModel?: Model,
  draftConfig?: DraftConfig,
): Promise<LlamaContext> {
  // ج17 died at B18 (file-family re-homed to downloadStore; this line
  // remains a facade dispatch, ج28-family, dies with the facade at 4e).
  const filePath = await modelStore.getModelFullPath(model);
  if (!filePath) {
    throw new Error('Model path is undefined');
  }

  runInAction(() => {
    s.isMultimodalActive = false; // Reset until we confirm it's enabled
    s.activeProjectionModelId = projectionModel?.id;
  });

  // Get all effective initialization settings BEFORE try block
  // so they're available for error reporting if initialization fails
  const effectiveSettings = await s.getEffectiveContextInitParams(
    filePath,
    draftConfig,
  );

  try {
    // Create properly versioned ContextInitParams
    const contextInitParams = createContextInitParams(effectiveSettings);

    const t0 = Date.now();
    const ctx = await initLlama(
      {
        model: filePath,
        ...effectiveSettings, // Use effectiveSettings without version for llama.rn
        use_progress_callback: true,
      },
      (_progress: number) => {
        //logger.debug('progress: ', _progress);
      },
    );
    const t1 = Date.now();
    logger.debug('init time: ', t1 - t0);

    // B23: updateModelStopTokens is module-local HERE — direct call
    // (ج18 died with the move; the GodObjectPrivates cast is deleted).
    await updateModelStopTokens(ctx, model);

    // Check and update thinking capabilities (direct since B14 — the member
    // lives in catalogStore now).
    await catalogUpdateModelThinkingCapabilities(ctx, model);

    // Initialize multimodal support if mmproj path was provided
    if (isMultimodalInit && mmProjPath) {
      try {
        logger.debug('Initializing multimodal support with path:', mmProjPath);

        // Initialize multimodal with the new API format
        // Apply effective value: clamp image_max_tokens to n_ctx
        const success = await ctx.initMultimodal({
          path: mmProjPath,
          use_gpu: !s.contextInitParams.no_gpu_devices,
          image_max_tokens: Math.min(
            s.contextInitParams.image_max_tokens ?? 512,
            s.contextInitParams.n_ctx,
          ),
        });

        if (!success) {
          console.error('Failed to initialize multimodal support');
        } else {
          logger.debug('Multimodal support initialized successfully');
          // Verify that multimodal is now enabled
          const isEnabled = await ctx.isMultimodalEnabled();
          logger.debug('Multimodal enabled status:', isEnabled);

          // Update the multimodal active flag
          runInAction(() => {
            s.isMultimodalActive = isEnabled;
          });
        }
      } catch (error) {
        console.error('Error initializing multimodal support:', error);
        runInAction(() => {
          s.isMultimodalActive = false;
          s.activeProjectionModelId = undefined;
        });
      }
    }

    runInAction(() => {
      s.context = ctx;
      s.engine = new LocalCompletionEngine(ctx);
      s.activeRemoteBinding = undefined;
      // B22 (§3-أ): persist-adjacent settings stay on the god object until
      // the v2 roots exist (ج19).
      modelStore.activeContextSettings = contextInitParams;
      s.setActiveModel(model.id);
      pendingModelId = null;
    });

    // Update largestSuccessfulLoad using GGUF estimator
    try {
      const estimated = getModelMemoryRequirement(
        model,
        projectionModel,
        contextInitParams,
        pairedDraftModel(draftConfig),
      );
      runInAction(() => {
        if (
          s.largestSuccessfulLoad === undefined ||
          estimated > s.largestSuccessfulLoad
        ) {
          // B22 (§3-أ): persist key stays on the god object until the v2
          // roots exist (ج20).
          modelStore.largestSuccessfulLoad = estimated;
        }
      });
    } catch (error) {
      console.warn(
        '[ModelStore] Failed to update largestSuccessfulLoad:',
        error,
      );
    }

    return ctx;
  } catch (error) {
    console.error(
      `Failed to initialize model context for "${model.name}" (${model.id}):`,
      error,
    );

    // Set error state for UI feedback - include model info and context params for error reporting
    const errorState = createErrorState(error, 'modelInit', undefined, {
      modelId: model.id,
      modelName: model.name,
      modelUrl: model.hfUrl,
      modelSize: model.size,
      contextParams: effectiveSettings,
    });
    runInAction(() => {
      s.modelLoadError = errorState;
    });

    throw error;
  } finally {
    runInAction(() => {
      // B10: lastUsedModelId is a catalog persist key — writes go to its
      // owner (bridge ج21 died with the relocation, per the §8 registry).
      catalogStore.lastUsedModelId = model.id;
    });
    try {
      runInAction(() => {
        model.lastUsedAt = Date.now();
      });
    } catch {
      // Non-critical bookkeeping — never fail a model load over it.
    }
  }
}

// ج5 death (B14): reprobeRemoteCapsIfUnknown moved here from the god object
// (verbatim body; activeModel / activeRemoteBinding read through THIS store's
// own getters — runtime state, owner access). handleAppStateChange calls it
// internally now; the god's private member and the barrel cast are gone.
function reprobeRemoteCapsIfUnknown() {
  const model = runtimeStore.activeModel;
  if (
    model?.origin !== ModelOrigin.REMOTE ||
    !model.serverId ||
    !model.remoteModelId ||
    capsMatchBinding(
      serverStore.remoteCaps[model.id],
      runtimeStore.activeRemoteBinding,
      model.id,
    )
  ) {
    return;
  }
  const binding = runtimeStore.activeRemoteBinding;
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
}

/**
 * One-time legacy import (extraction-plan §3, part 2 — runtime half, B22).
 * Reads the god object's legacy `ModelStore` persistence key and seeds the
 * three persisted runtime keys. Leaves the key untouched — cleanup is
 * deferred to 4e. Fail-safe + idempotent: see importLegacyCatalogState (B10)
 * for the full ordering argument (v2 root hydration FIRST, then this
 * import).
 */
export async function importLegacyRuntimeState(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem('ModelStore');
    if (!raw) {
      return; // fresh install, or legacy payload already migrated to v2 keys
    }
    const legacy = JSON.parse(raw) as Record<string, unknown>;
    runInAction(() => {
      if (typeof legacy.contextInitParams !== 'undefined') {
        contextInitParamsBox.set(
          legacy.contextInitParams as ContextInitParams,
        );
      }
      if (typeof legacy.availableMemoryCeiling !== 'undefined') {
        availableMemoryCeilingBox.set(
          legacy.availableMemoryCeiling as number | undefined,
        );
      }
      if (typeof legacy.largestSuccessfulLoad !== 'undefined') {
        largestSuccessfulLoadBox.set(
          legacy.largestSuccessfulLoad as number | undefined,
        );
      }
    });
  } catch {
    // Fail-safe (§3.2): corrupt/unreadable legacy key — retry next launch.
    // Deliberately silent: this must never abort the constructor chain.
  }
}

/**
 * B23 — stop-token updater moved verbatim off the god object's private
 * (ج18 died: the GodObjectPrivates cast is gone). Catalog read is direct
 * (runtimeStore→catalogStore static import, the B14 edge).
 */
async function updateModelStopTokens(ctx: LlamaContext, model: Model) {
  const storeModel = catalogStore.models.find(m => m.id === model.id);
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

export const runtimeStore: RuntimeStore = {
  // ── B3 (phase-4 4a): real implementation (was god-object computed) ──
  // Reads the list through the barrel binding (mocked in suites, the real
  // god object in production) — identical data to the pre-move body; the
  // read flips to catalogStore when B10 relocates the list.
  get activeModel(): Model | undefined {
    // Derivation over the catalog's lists (owner reads — ج1 dead, §8
    // registry). The host-guarded tail is mock-compat (ج22, dies 4e):
    // partial barrel suites stub `activeModel` as DATA with no lists —
    // there (and only there — runtimeLive is false because no constructor
    // ran) this returns exactly what the old pass-through returned; the
    // liveness mark makes the fallback unreachable in production, so it
    // cannot re-enter the god's delegating computed (MobX cycle).
    const derived =
      catalogStore.models?.find(model => model.id === this.activeModelId) ||
      catalogStore.remoteModels?.find(model => model.id === this.activeModelId);
    if (derived || runtimeLive) {
      return derived;
    }
    return modelStore.activeModel;
  },
  // ── B8 (phase-4 4a): real state (boxes above; not persisted) ──
  // ج22 (B8): mock-compat read guard, uniform on all eight relocated state
  // members. With the host injected (production + real-store suites) the box
  // IS the state; in barrel-mocked suites no constructor ever ran, so the
  // mock singleton owns the state and the read goes through the barrel
  // binding — exactly the ج3 shape on activeModel. Dies with it: per-suite
  // as 4b/4c migrate the callers to sub-store mocks, force-killed at 4e.
  get activeModelId() {
    return runtimeLive ? activeModelIdBox.get() : modelStore.activeModelId;
  },
  set activeModelId(value: string | undefined) {
    runInAction(() => {
      activeModelIdBox.set(value);
    });
  },
  get context() {
    return runtimeLive ? contextBox.get() : modelStore.context;
  },
  set context(value: LlamaContext | undefined) {
    runInAction(() => {
      contextBox.set(value);
    });
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
    return runtimeLive ? engineBox.get() : modelStore.engine;
  },
  set engine(value: CompletionEngine | undefined) {
    runInAction(() => {
      engineBox.set(value);
    });
  },
  get isContextLoading() {
    return runtimeLive ? isContextLoadingBox.get() : modelStore.isContextLoading;
  },
  set isContextLoading(value: boolean) {
    runInAction(() => {
      isContextLoadingBox.set(value);
    });
  },
  get loadingModel() {
    return runtimeLive ? loadingModelBox.get() : modelStore.loadingModel;
  },
  set loadingModel(value: Model | undefined) {
    runInAction(() => {
      loadingModelBox.set(value);
    });
  },
  // ── B22 (phase-4 4a): real state (boxes above) — contextInitParams is
  // PERSISTED via the runtimeStore:v2 root (wired from the god constructor
  // chain, ج25 — dies 4e); the barrel reads died with the move (ج19 tail).
  get contextInitParams() {
    return contextInitParamsBox.get();
  },
  set contextInitParams(value: ContextInitParams) {
    runInAction(() => {
      contextInitParamsBox.set(value);
    });
  },
  get activeContextSettings() {
    return activeContextSettingsBox.get();
  },
  set activeContextSettings(value: ContextInitParams | undefined) {
    runInAction(() => {
      activeContextSettingsBox.set(value);
    });
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
    return runtimeLive ? isMultimodalActiveBox.get() : modelStore.isMultimodalActive;
  },
  set isMultimodalActive(value: boolean) {
    runInAction(() => {
      isMultimodalActiveBox.set(value);
    });
  },
  get activeProjectionModelId() {
    return runtimeLive ? activeProjectionModelIdBox.get() : modelStore.activeProjectionModelId;
  },
  set activeProjectionModelId(value: string | undefined) {
    runInAction(() => {
      activeProjectionModelIdBox.set(value);
    });
  },
  // ── B6 (phase-4 4a): real state (boxes above; not persisted) ──
  get inferencing() {
    return inferencingBox.get();
  },
  set inferencing(value: boolean) {
    runInAction(() => {
      inferencingBox.set(value);
    });
  },
  get isStreaming() {
    return isStreamingBox.get();
  },
  set isStreaming(value: boolean) {
    runInAction(() => {
      isStreamingBox.set(value);
    });
  },
  get benchmarkActive() {
    return benchmarkActiveBox.get();
  },
  set benchmarkActive(value: boolean) {
    runInAction(() => {
      benchmarkActiveBox.set(value);
    });
  },
  // ── B7 (phase-4 4a): real state (box above; not persisted) ──
  get modelLoadError() {
    return modelLoadErrorBox.get();
  },
  set modelLoadError(value: ErrorState | null) {
    runInAction(() => {
      modelLoadErrorBox.set(value);
    });
  },
  // ── B22 (phase-4 4a): real state (boxes above; PERSISTED via
  // runtimeStore:v2 — the B9 reassignment lands here). Writable pairs: the
  // ج13-tail / ج20 barrel writes inside this store become native this.-
  // shaped box writes.
  get availableMemoryCeiling() {
    return availableMemoryCeilingBox.get();
  },
  set availableMemoryCeiling(value: number | undefined) {
    runInAction(() => {
      availableMemoryCeilingBox.set(value);
    });
  },
  get largestSuccessfulLoad() {
    return largestSuccessfulLoadBox.get();
  },
  set largestSuccessfulLoad(value: number | undefined) {
    runInAction(() => {
      largestSuccessfulLoadBox.set(value);
    });
  },
  get useAutoRelease() {
    return modelStore.useAutoRelease;
  },
  // ── B4 (phase-4 4a): real implementation (persist-key flag stays on the
  // god object until the v2 roots; disabled-reasons set is module state) ──
  get isAutoReleaseEnabled(): boolean {
    return this.useAutoRelease && autoReleaseDisabledReasons.size === 0;
  },
  get wasAutoReleased() {
    return modelStore.wasAutoReleased;
  },
  get lastAutoReleasedModelId() {
    return modelStore.lastAutoReleasedModelId;
  },
  // ── B4 (phase-4 4a): real state (box above; not persisted) ──
  get appState() {
    return appStateBox.get();
  },
  set appState(value: AppStateStatus) {
    runInAction(() => {
      appStateBox.set(value);
    });
  },
  get activeRemoteBinding() {
    return runtimeLive ? activeRemoteBindingBox.get() : modelStore.activeRemoteBinding;
  },
  set activeRemoteBinding(value: RemoteSessionBinding | undefined) {
    runInAction(() => {
      activeRemoteBindingBox.set(value);
    });
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
  // ── B8 (phase-4 4a): session identity + lifecycle-2 — real implementations.
  // Method shorthand: `this` must bind to this store (an arrow property's
  // lexical `this` is the module scope — it would crash at runtime).
  setActiveModel(modelId: string) {
    runInAction(() => {
      activeModelIdBox.set(modelId);
    });
  },
  selectModel: (...args) => modelStore.selectModel(...args),
  /**
   * Initialize a model context, optionally with multimodal support.
   *
   * Architecture:
   * - Phase 1 (outside mutex): Resolve config, check memory, show alert if needed
   * - Phase 2 (inside mutex): Release old context, load new context
   *
   * The "last-one-wins" pattern uses pendingModelId set at the START, then checked
   * both after the Alert (to skip if superseded) and inside the mutex (final check).
   * Note: "last-one-wins" not always loading the last tapped model, but it's ok, as
   * long as it is not leading the deadlock or mem leak.
   *
   * @param model The main LLM model to initialize
   * @param mmProjPath Optional path to a projection model for multimodal support
   * @returns The initialized LlamaContext, or null if cancelled/skipped
   */
  async initContext(
    model: Model,
    mmProjPath?: string,
  ): Promise<LlamaContext | null> {
    // Benchmark mode owns the native context lifecycle end-to-end.
    // Reject synchronously so any racing caller (ChatView auto-load, header,
    // sheet) fails fast instead of silently shadowing the matrix's per-cell
    // devices / n_gpu_layers via the "already loaded → skip" path.
    if (this.benchmarkActive) {
      throw new Error(
        '[ModelStore] initContext rejected: benchmark mode is active',
      );
    }

    // === Phase 1: Pre-flight checks OUTSIDE mutex ===

    // Mark intent immediately - this is the "last-one-wins" tracking
    // If another model is requested while we're showing an Alert, their
    // pendingModelId will overwrite ours and we'll detect it later
    pendingModelId = model.id;

    // Set loading state immediately for UI feedback
    runInAction(() => {
      this.isContextLoading = true;
      this.loadingModel = model;
    });

    try {
      // Resolve multimodal configuration
      const {isMultimodalInit, resolvedMmProjPath, projectionModel} =
        await resolveMultimodalConfig(model, mmProjPath);

      const draftConfig = await resolveDraftConfig(this, model);

      // Check memory and get user confirmation if needed (no mutex - UI interaction)
      const shouldProceed = await checkMemoryAndConfirm(
        model,
        isMultimodalInit,
        projectionModel,
        pairedDraftModel(draftConfig),
      );

      if (!shouldProceed) {
        throw new Error('Model loading cancelled by user');
      }

      // After Alert (if shown), check if we're still the intended model
      // Another model request might have come in while user was deciding
      if (pendingModelId !== model.id) {
        logger.debug(
          `[ModelStore] Skipping "${model.name}" - user switched to "${pendingModelId}" during confirmation`,
        );
        return null;
      }

      // === Phase 2: Execute context operations WITH mutex ===

      const operationPromise = contextOperationMutex.then(async () => {
        // A benchmark may have started while this load sat in the mutex
        // queue (cold-launch deep-link race). Bail before doing native work
        // — enterBenchmarkMode will release any context we leave behind.
        if (this.benchmarkActive) {
          logger.debug(
            `[ModelStore] Skipping queued load for "${model.name}" - benchmark mode is active`,
          );
          return null;
        }

        // Final check if this request is still current (last-one-wins)
        // This catches race conditions where another request queued while we waited
        if (pendingModelId !== model.id) {
          logger.debug(
            `[ModelStore] Skipping outdated load for "${model.name}" - user now wants model "${pendingModelId}"`,
          );
          return null;
        }

        // Skip if already loaded
        if (this.activeModelId === model.id && this.context) {
          logger.debug(
            `[ModelStore] Model "${model.name}" is already loaded, skipping`,
          );
          return this.context;
        }

        // Release existing context (bridge ج14 died: local module call now)
        await releaseContextInternal(this);

        // Small delay for native cleanup before loading next model
        await new Promise(resolve => setTimeout(resolve, 100));

        // Proceed with actual initialization
        return proceedWithInitialization(
          this,
          model,
          resolvedMmProjPath,
          isMultimodalInit,
          projectionModel,
          draftConfig,
        );
      });

      // Keep mutex chain intact by swallowing errors
      contextOperationMutex = operationPromise.then(() => {}).catch(() => {});

      return await operationPromise;
    } finally {
      runInAction(() => {
        this.isContextLoading = false;
        this.loadingModel = undefined;
      });
    }
  },
  async reinitializeContext() {
    if (this.activeModelId) {
      const model = catalogStore.models.find(m => m.id === this.activeModelId); // B10: owner read (ج15)
      if (model) {
        // Routed through the god-object member on purpose (mock-compat):
        // suites redirect loads by overriding `modelStore.initContext`, and
        // internal callers must honor that override (ModelStore.test.ts).
        // Becomes a local `this.initContext` when the suites split (4d).
        await modelStore.initContext(model);
      }
    }
  },
  // ── B7 (phase-4 4a): lifecycle-1 — real implementations (bridge ج9 died:
  // the mutex + internal release are module state/functions now) ──
  /** Acquires mutex before releasing context. */
  async releaseContext(clearActiveModel: boolean = false) {
    const operationPromise = contextOperationMutex.then(async () => {
      return releaseContextInternal(this, clearActiveModel);
    });

    // Swallow errors to keep mutex chain intact
    contextOperationMutex = operationPromise.then(() => {}).catch(() => {});

    return operationPromise;
  },

  async manualReleaseContext() {
    await this.releaseContext(true); // Clear active model for manual release
  },

  clearModelLoadError() {
    modelLoadErrorBox.set(null);
  },
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
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        n_threads,
      });
    });
  },

  setCacheTypeK: (cache_type: CacheType) => {
    runInAction(() => {
      // Only allow changing cache type if flash attention is enabled
      // Support both old flash_attn and new flash_attn_type
      const flashAttnEnabled =
        contextInitParamsBox.get().flash_attn ||
        (contextInitParamsBox.get().flash_attn_type &&
          contextInitParamsBox.get().flash_attn_type !== 'off');

      if (flashAttnEnabled) {
        contextInitParamsBox.set({
          ...contextInitParamsBox.get(),
          cache_type_k: cache_type,
        });
      }
    });
  },

  setCacheTypeV: (cache_type: CacheType) => {
    runInAction(() => {
      // Only allow changing cache type if flash attention is enabled
      // Support both old flash_attn and new flash_attn_type
      const flashAttnEnabled =
        contextInitParamsBox.get().flash_attn ||
        (contextInitParamsBox.get().flash_attn_type &&
          contextInitParamsBox.get().flash_attn_type !== 'off');

      if (flashAttnEnabled) {
        contextInitParamsBox.set({
          ...contextInitParamsBox.get(),
          cache_type_v: cache_type,
        });
      }
    });
  },

  setNBatch: (n_batch: number) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        n_batch,
      });
    });
  },

  setNUBatch: (n_ubatch: number) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        n_ubatch,
      });
    });
  },

  setNContext: (n_ctx: number) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        n_ctx,
      });
    });
  },

  setNGPULayers: (n_gpu_layers: number) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        n_gpu_layers,
      });
    });
  },

  setImageMaxTokens: (image_max_tokens: number) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        image_max_tokens,
      });
    });
  },

  setUseMlock: (use_mlock: boolean) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        use_mlock,
      });
    });
  },

  setUseMmap: (use_mmap: 'true' | 'false' | 'smart') => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        use_mmap,
      });
    });
  },

  setNoExtraBufts: (no_extra_bufts: boolean) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        no_extra_bufts,
      });
    });
  },

  setSpeculativeEnabled: (speculativeEnabled: boolean) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        speculativeEnabled,
      });
    });
  },

  setSelectedDraftModel: (selectedDraftModelId?: string) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        selectedDraftModelId,
      });
    });
  },

  setSpecDraftNGpuLayers: (spec_draft_n_gpu_layers: number) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        spec_draft_n_gpu_layers,
      });
    });
  },

  setSpecDraftCacheTypeK: (spec_draft_cache_type_k: CacheType) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        spec_draft_cache_type_k,
      });
    });
  },

  setSpecDraftCacheTypeV: (spec_draft_cache_type_v: CacheType) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        spec_draft_cache_type_v,
      });
    });
  },
  // ── B21 (phase-4 4a): real implementations (GPU family — host-write
  // shape, the B1 pattern; the host retires at B22 with runtimeStore:v2).
  setNoGpuDevices: (no_gpu_devices: boolean) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        no_gpu_devices,
      });
    });
  },

  // New v2.0 setters
  setDevices: (devices: string[] | undefined) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        devices,
      });
    });
  },

  setFlashAttnType: (flash_attn_type: 'auto' | 'on' | 'off') => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        flash_attn_type,
        // Reset cache types to F16 if flash attention is disabled
        ...(flash_attn_type !== 'off'
          ? {}
          : {
              cache_type_k: CacheType.F16,
              cache_type_v: CacheType.F16,
            }),
      });
    });
  },

  setKvUnified: (kv_unified: boolean) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        kv_unified,
      });
    });
  },

  setNParallel: (n_parallel: number) => {
    runInAction(() => {
      contextInitParamsBox.set({
        ...contextInitParamsBox.get(),
        n_parallel,
      });
    });
  },
  // ── B6 (phase-4 4a): completion surface — real implementations. Method
  // shorthand: `this` must bind to this store (an arrow property's lexical
  // `this` is the module scope — it would crash at runtime).
  async startImageCompletion(params: {
    prompt: string;
    image_path?: string; // For backward compatibility
    image_paths?: string[]; // New parameter for multiple images
    systemMessage?: string;
    onToken?: (token: string) => void;
    onComplete?: (text: string) => void;
    onError?: (error: Error) => void;
  }): Promise<void> {
    // Hoisted on purpose: TS narrowing does not persist across statements
    // for getter accesses, and the callback below needs the typed context.
    const context = this.context;
    if (!context) {
      throw new Error('No model context available');
    }

    // Check if multimodal is enabled
    if (!this.isMultimodalActive) {
      throw new Error('Multimodal is not enabled for this model');
    }

    runInAction(() => {
      inferencingBox.set(true);
      isStreamingBox.set(false);
    });

    try {
      // Handle both single image_path and multiple image_paths
      let imagePaths: string[] = [];

      if (params.image_paths && params.image_paths.length > 0) {
        // Use the provided image_paths array
        imagePaths = [...params.image_paths];
      } else if (params.image_path) {
        // Backward compatibility: convert single image_path to array
        imagePaths = [params.image_path];
      }

      if (imagePaths.length === 0) {
        throw new Error('No images provided for multimodal completion');
      }

      // Process all image paths to handle file:// prefix
      const processedImagePaths = imagePaths.map(path =>
        path.startsWith('file://')
          ? Platform.OS === 'ios'
            ? path.substring(7) // iOS: remove 'file://'
            : path // Android: keep as is
          : path,
      );

      // Create a system message if provided
      const systemMessage = params.systemMessage?.trim()
        ? {
            role: 'system',
            content: params.systemMessage,
          }
        : undefined;

      // Create a user message with text and all images
      const userMessage = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: params.prompt,
          },
          // Add all images to the content array
          ...processedImagePaths.map(path => ({
            type: 'image_url',
            image_url: {url: path},
          })),
        ],
      };

      // Start the completion
      runInAction(() => {
        isStreamingBox.set(true);
      });

      const completionParams =
        await chatSessionRepository.getGlobalCompletionSettings();
      // Former SELF-REFERENCE (plan B6: official −1): reads the B3-owned
      // real getter instead of the god object — the singleton line dies.
      const stopWords = toJS(this.activeModel?.stopWords);

      // Create completion params with app-specific properties
      const messages = systemMessage
        ? [systemMessage, userMessage]
        : [userMessage];
      const completionParamsWithAppProps = {
        ...completionParams,
        messages: messages,
        stop: stopWords,
      } as CompletionParams;

      // Strip app-specific properties before passing to llama.rn
      const cleanCompletionParams = toApiCompletionParams(
        completionParamsWithAppProps,
      );

      // Create the completion promise and register it for safe context release
      const completionPromise = context.completion(
        cleanCompletionParams,
        data => {
          if (data.token) {
            params.onToken?.(data.token);
          }
        },
      );

      // Register the promise so releaseContext can wait for it
      registerCompletionPromiseOf(completionPromise);

      const result = await completionPromise;

      // Clear the promise after completion finishes
      clearCompletionPromiseOf();

      params.onComplete?.(result.text);
    } catch (error) {
      // Clear the promise on error too
      clearCompletionPromiseOf();
      console.error('Error in multi-image completion:', error);
      params.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      runInAction(() => {
        inferencingBox.set(false);
        isStreamingBox.set(false);
      });
    }
  },
  setInferencing(value: boolean) {
    inferencingBox.set(value);
  },
  setIsStreaming(value: boolean) {
    isStreamingBox.set(value);
  },
  // ── B5 (phase-4 4a): benchmark family — real implementations ──
  /**
   * Take exclusive ownership of the native context for the e2e benchmark
   * runner. Sets `benchmarkActive` synchronously so any new auto-load is
   * gated, then drains the mutex (in case one is already in flight) and
   * releases whatever context exists. After this resolves, the runner can
   * safely call `initLlama` directly without racing the rest of the app.
   *
   * Pairs with `exitBenchmarkMode()`. The runner MUST call exit even on
   * failure paths or chat / header / sheet inits will stay rejected.
   *
   * The mutex and the internal release stay on the god object until B7 —
   * private members, reached through a narrow structural view (bridge ج9,
   * death B7 — see extraction-plan §8 registry).
   */
  async enterBenchmarkMode(): Promise<void> {
    runInAction(() => {
      benchmarkActiveBox.set(true);
    });

    const op = contextOperationMutex.then(async () => {
      // Release any context the rest of the app loaded (e.g. ChatView's
      // auto-load on cold launch). clearActiveModel:true so the queued
      // post-mutex callers see a clean slate if they ever run.
      await releaseContextInternal(this, true);
    });
    contextOperationMutex = op.then(() => {}).catch(() => {});
    await op;
  },

  /**
   * Hand context ownership back to the rest of the app. Intentionally
   * trivial — no native work — so it's safe to call from a `finally` block.
   */
  exitBenchmarkMode(): void {
    runInAction(() => {
      benchmarkActiveBox.set(false);
    });
  },
  // ── B4 (phase-4 4a): auto-release family — real implementations ──
  setupAppStateListener() {
    AppState.addEventListener('change', this.handleAppStateChange);
  },

  disableAutoRelease(reason: string) {
    autoReleaseDisabledReasons.add(reason);
    logger.debug(
      `Auto-release disabled: ${reason}`,
      Array.from(autoReleaseDisabledReasons),
    );
  },

  enableAutoRelease(reason: string) {
    autoReleaseDisabledReasons.delete(reason);
    logger.debug(
      `Auto-release enabled: ${reason}`,
      Array.from(autoReleaseDisabledReasons),
    );
  },

  updateUseAutoRelease(useAutoRelease: boolean) {
    runInAction(() => {
      modelStore.useAutoRelease = useAutoRelease;
    });
  },

  async checkAndReloadAutoReleasedModel() {
    if (this.wasAutoReleased && this.lastAutoReleasedModelId) {
      // Skip if the auto-released model ID refers to a remote model
      if (this.lastAutoReleasedModelId.includes('/')) {
        const remoteModel = modelStore.remoteModels?.find(
          m => m.id === this.lastAutoReleasedModelId,
        );
        if (remoteModel) {
          clearAutoReleaseFlags();
          return;
        }
      }
      const model = modelStore.models?.find(
        m => m.id === this.lastAutoReleasedModelId && m.isDownloaded,
      );
      if (model) {
        logger.debug('Reloading auto-released model:', model.id);
        // Routed through the god-object member on purpose (mock-compat):
        // suites redirect loads by overriding `modelStore.initContext`;
        // internal callers must honor that override. Same bridge as
        // reinitializeContext above — dies when the suites split (4d).
        await modelStore.initContext(model);
      }
      clearAutoReleaseFlags();
    }
  },

  async handleAppStateChange(nextAppState: AppStateStatus) {
    logger.debug(`App state change: ${this.appState} → ${nextAppState}`);

    if (
      this.appState.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // Coming to foreground - check if we need to reload auto-released model
      await this.checkAndReloadAutoReleasedModel();
      // ج5 DIED at B14: reprobeRemoteCapsIfUnknown moved into this module
      // (below) — the call is internal now, the god-cast is gone.
      reprobeRemoteCapsIfUnknown();
    } else if (this.appState === 'active' && nextAppState === 'inactive') {
      // active → inactive: NO action (per requirements)
      logger.debug('Active → Inactive: No auto-release action');
    } else if (this.appState === 'inactive' && nextAppState === 'background') {
      // inactive → background: release if enabled
      // Skip for remote models — no native context to release, and
      // releaseContext() would clear the engine with no reload path.
      if (
        this.isAutoReleaseEnabled &&
        this.activeModelId &&
        this.activeModel?.origin !== ModelOrigin.REMOTE
      ) {
        logger.debug('Inactive → Background: Auto-releasing context');
        markAutoReleased(this, this.activeModelId);
        await this.releaseContext();
      }
    } else if (this.appState === 'active' && nextAppState === 'background') {
      // active → background: release if enabled (direct transition)
      // Skip for remote models — same reason as above.
      if (
        this.isAutoReleaseEnabled &&
        this.activeModelId &&
        this.activeModel?.origin !== ModelOrigin.REMOTE
      ) {
        logger.debug('Active → Background: Auto-releasing context');
        markAutoReleased(this, this.activeModelId);
        await this.releaseContext();
      }
    }

    runInAction(() => {
      appStateBox.set(nextAppState);
    });
  },
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
