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
 * All three facade re-exports below carry @deprecated tags (downloadStore
 * since Phase 2; catalogStore/runtimeStore since the Phase-3 expansion),
 * and .eslintrc.js no-restricted-syntax fires on new imports through this
 * facade path.
 * ═════════════════════════════════════════════════════════════════════
 *
 * DISSOLUTION (Phase 4): this barrel dies together with the pass-through
 * delegates once every call site imports its domain store directly and the
 * god object's internals are physically relocated. `initializeStore` and
 * the remaining cross-cutting bootstrap surface are deliberately NOT
 * re-exported here — they dissolve with the god object.
 */

/**
 * @deprecated استخدم downloadStore من './downloadStore' مباشرة — ممنوع في الكود الجديد (مرحلة 2)
 *
 * The store itself is the blessed migration target; what is deprecated is
 * importing it THROUGH this facade. This tag exists so IDEs and the ESLint
 * no-restricted-syntax rule flag new facade-path imports while the Phase-3
 * deferred categories finish their own migration.
 */
export {downloadStore} from './downloadStore';
/**
 * @deprecated استخدم catalogStore من './catalogStore' مباشرة — ممنوع في الكود الجديد (مرحلة 3)
 *
 * Same contract as downloadStore above: the store itself is the blessed
 * migration target; what is deprecated is importing it THROUGH this facade.
 */
export {catalogStore} from './catalogStore';

/**
 * @deprecated استخدم runtimeStore من './runtimeStore' مباشرة — ممنوع في الكود الجديد (مرحلة 3)
 *
 * Same contract as downloadStore above: the store itself is the blessed
 * migration target; what is deprecated is importing it THROUGH this facade.
 */
export {runtimeStore} from './runtimeStore';
