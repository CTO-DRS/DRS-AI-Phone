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

import {catalogStore} from './catalogStore';
import {runtimeStore} from './runtimeStore';
import {runInAction} from 'mobx';
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
