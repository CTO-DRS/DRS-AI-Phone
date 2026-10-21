/**
 * bootstrap — Phase-4 R0 scaffold (docs/extraction-plan.md, condition 4).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * R0 CONTRACT (owner-approved): scaffolding + dependency-injected wiring ONLY.
 * Zero member moves, zero new behavior, zero modelStore references — the
 * counters (official/real/raw) must not move by a single line.
 *
 * What this file IS:
 *   • The composition type (ModelSystemDeps) naming the three domain slots
 *     plus the two injected initializers.
 *   • initializeModelSystem(deps): calls the INJECTED initializers, verbatim
 *     mirroring the persist.then body it replaces
 *     (await initializeThreadCount → initializeStore).
 *
 * What this file is NOT (yet — that is 4a):
 *   • No imports at all — not even type-only. The store/model pass-through
 *     files import the store barrel, which re-exports ModelStore; any static
 *     edge out of this module would close a madge cycle (R0 gate: zero new
 *     cycles, pinned at 42). Domain slot types are therefore generic and get
 *     inferred from the injected values at the call site.
 *   • No body moved out of ModelStore.ts, no bridge logic, no domain logic.
 *
 * Deviation note (owner protocol: deviations are explained, never silent):
 * the plan sketched `ModelSystemDeps = {catalog; download; runtime}` typed by
 * the three pass-through stores. Building it that way measurably adds 6
 * madge cycles (42 → 48): the pass-through stores import the store barrel →
 * ModelStore, so any static import chain reaching them closes a loop. R0
 * therefore injects the god object itself (`this`) into the three domain
 * slots — it IS the sole domain implementation until 4a physically
 * relocates members, after which the pass-through files stop referencing
 * modelStore, the cycles dissolve, and the slots tighten to the real
 * CatalogStore/DownloadStore/RuntimeStore types with no further change to
 * this module's shape.
 *
 * Callers (bootstrap.test.ts, condition 1) arrive at 4d when the six facade
 * tests transform here. R0 adds no suite.
 *
 * B22 deviation (announced, §8 row "بعد B22"): the zero-import promise was
 * R0-scoped. B22 exports initializeThreadCount FROM this module per the
 * plan — it writes runtimeStore.max_threads + contextInitParams.n_threads
 * natively (the host retired in the same batch) and reads
 * catalogStore.version for the first-launch heuristic (the god's `version`
 * field is catalogStore state since B10). The two direct file imports close
 * a bounded madge step — measured and announced per batch (A/B protocol).
 * ══════════════════════════════════════════════════════════════════════════
 */

import {
  catalogStore,
  MODEL_LIST_VERSION,
  catalogResolvePresets,
  catalogUpgradeToFetchedRules,
  catalogLoadMissingGGUFMetadata,
} from './catalogStore';
import {runtimeStore, initializeGpuSettings} from './runtimeStore';
import {downloadStore} from './downloadStore';
import {runInAction} from 'mobx';
import {InteractionManager} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import NativeHardwareInfo from '../../specs/NativeHardwareInfo';
import {downloadManager} from '../../services/downloads';
import {
  getCpuCoreCount,
  getRecommendedThreadCount,
} from '../../utils/deviceCapabilities';

/**
 * B22 — device thread-count initialization (moved verbatim off the god
 * object's private). Writes runtimeStore state natively; the first-launch
 * heuristic reads catalogStore.version (catalog state since B10).
 */
export async function initializeThreadCount() {
  try {
    const cores = await getCpuCoreCount();
    runInAction(() => {
      runtimeStore.max_threads = cores;
    });

    // Only set recommended thread count on first launch.
    // After hydration, catalogStore.version is set if the store was
    // previously persisted. On fresh install it is undefined (default).
    const isFirstLaunch = catalogStore.version === undefined;
    if (isFirstLaunch) {
      const threads = await getRecommendedThreadCount();
      runInAction(() => {
        runtimeStore.contextInitParams = {
          ...runtimeStore.contextInitParams,
          n_threads: threads,
        };
      });
    }
  } catch (error) {
    console.error('Failed to initialize thread count:', error);
    runInAction(() => {
      runtimeStore.max_threads = 4;
    });
  }
}

export interface ModelSystemDeps<Catalog, Download, Runtime> {
  /** Catalog domain slot (model list, search/filter, HF discovery, metadata). */
  catalog: Catalog;
  /** Download domain slot (download lifecycle, files/storage, projection status). */
  download: Download;
  /** Runtime domain slot (context lifecycle, inference params, app-state). */
  runtime: Runtime;
  /** Injected: ModelStore#initializeStore (async, rehydrates runtime state). */
  initializeStore: () => Promise<void>;
  /** Injected: ModelStore#initializeThreadCount (async, device thread count). */
  initializeThreadCount: () => Promise<void>;
}

/**
 * Composition root for the model system. Verbatim behavioral mirror of the
 * persist.then block it is called from (ModelStore constructor): thread
 * count first, then store initialization. Both initializers are injected —
 * never imported — so this module has zero dependencies of any kind.
 */
export async function initializeModelSystem<C, D, R>(
  deps: ModelSystemDeps<C, D, R>,
): Promise<void> {
  await deps.initializeThreadCount();
  deps.initializeStore();
}

/**
 * B23 — store initialization dissolved verbatim off the god object.
 * Dispatches: catalog family through catalogStore (the B11 module functions
 * + the version gate), the download family through downloadStore, GPU +
 * memory through runtimeStore. The one-time version migration reads
 * MODEL_LIST_VERSION from catalogStore (B23 move). The god object keeps a
 * public reverse delegate (B1 shape) for the external surface; the DI
 * wiring passes THIS export directly.
 */
export async function initializeStore() {
  const storedVersion = catalogStore.version || 0;

  catalogStore.healDraftVisionClassification();

  // Sync download manager with active downloads
  await downloadManager.syncWithActiveDownloads(catalogStore.models);

  // After the sync so an in-flight mmproj download is visible and waits. A
  // failure retries next launch; it must not abort the rest of init.
  try {
    await downloadStore.drainPendingProjectionCleanup();
  } catch (error) {
    console.warn('[ModelStore] projection cleanup drain failed:', error);
  }

  // Apply the bundled offline floor immediately (no network) so the list is
  // never empty while a slow rules fetch is in flight, then merge/reconcile.
  const presets = await catalogResolvePresets();

  if (storedVersion < MODEL_LIST_VERSION) {
    await catalogStore.mergeModelLists(presets);
    // mergeModelLists awaits the download-status checks (which re-anchor
    // stale container paths), so pruning here — as the non-migration branch
    // does — is now safe: a recoverable local model has already been
    // settled and will not be dropped as missing.
    downloadStore.removeInvalidLocalModels();
    // Only finalize the one-time migration once presets actually resolved.
    // An empty result signals a transient resolve failure (e.g. the RAM
    // read rejected); leave the version unbumped so the migration retries
    // next launch instead of locking in an empty default list.
    if (presets.length > 0) {
      runInAction(() => {
        catalogStore.version = MODEL_LIST_VERSION;
      });
    }
  } else {
    catalogStore.reconcilePresets(presets);
    await downloadStore.initializeDownloadStatus();
    downloadStore.removeInvalidLocalModels();
  }

  // Upgrade past the bundled floor to the online rules override in the
  // background; reconcile (id-keyed, dedup) folds in any newer set.
  // v1.36.0: pushed off the launch window — this performs a network fetch
  // (10s timeout) plus rules parsing on EVERY startup, while the bundled
  // floor already resolved above keeps presets usable in the meantime.
  InteractionManager.runAfterInteractions(() => {
    catalogUpgradeToFetchedRules();
  });

  await initializeGpuSettings(); // Should be awaited to ensure GPU settings are applied before initializing context

  // Initialize available memory ceiling at app startup if not set
  if (runtimeStore.availableMemoryCeiling === undefined) {
    try {
      const availableBytes = await NativeHardwareInfo.getAvailableMemory();
      runInAction(() => {
        runtimeStore.availableMemoryCeiling = availableBytes;
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
        runtimeStore.availableMemoryCeiling = Math.max(fallbackCeiling, 0); // Ensure non-negative
      });
    }
  }

  // Load missing GGUF metadata for downloaded models (background,
  // non-blocking)
  catalogLoadMissingGGUFMetadata();

  // Check if we need to reload an auto-released model (for app restarts)
  runtimeStore.checkAndReloadAutoReleasedModel();
}
