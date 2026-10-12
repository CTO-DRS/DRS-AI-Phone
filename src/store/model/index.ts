/**
 * Facade — Phase-1 scaffold (fix 4, stage 1 of 4).
 * See docs/audit-worklog.md.
 *
 * ZERO-LOGIC pass-through barrel: re-exports the three domain stores, each a
 * verbatim delegate of the modelStore singleton (contracts documented inside
 * each file). No behavior, no state, no re-export of the god object itself —
 * legacy call sites keep importing `modelStore` from the `store` barrel
 * until their domain phase migrates them.
 *
 * ═══════════════════════════ NEW-CODE RULE ═══════════════════════════
 * New code MUST import domain stores from their files directly:
 *   import {downloadStore} from '<...>/store/model/downloadStore';
 * NOT through this barrel — Phase 2 adds @deprecated tags + an ESLint
 * warning for facade imports of download functions.
 * ═════════════════════════════════════════════════════════════════════
 *
 * DISSOLUTION (Phase 4): this barrel dies together with the pass-through
 * delegates once every call site imports its domain store directly and the
 * god object's internals are physically relocated. `initializeStore` and
 * the remaining cross-cutting bootstrap surface are deliberately NOT
 * re-exported here — they dissolve with the god object.
 */

export {downloadStore} from './downloadStore';
export {catalogStore} from './catalogStore';
export {runtimeStore} from './runtimeStore';
