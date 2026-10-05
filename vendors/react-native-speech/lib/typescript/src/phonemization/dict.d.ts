/**
 * Dictionary loaders for the GPL-free phonemizer.
 *
 *   loadDict(path)        — TSV path → in-memory JsDictSource (web / tests / fallback)
 *   loadNativeDict(path)  — EPD1 .bin → mmap'd NativeDictSource via Turbo Module
 *
 * Both return a `DictSource`. Callers should pick based on environment;
 * production React Native uses loadNativeDict for the ~100MB → <1MB
 * heap win.
 */
import type { DictSource } from './DictSource';
import { JsDictSource } from './JsDictSource';
import { type NativeDictSource } from './NativeDictSource';
/**
 * Load a TSV dict (`word<TAB>ipa` per line) into memory and return a
 * JsDictSource. Cached by path.
 */
export declare function loadDict(path: string): Promise<JsDictSource>;
/**
 * Open a binary EPD1 dict via the Turbo Module. The native side mmaps
 * the file; the returned DictSource performs sync lookups via JSI.
 *
 * Strips the file:// prefix if present (native side wants a real path).
 */
export declare function loadNativeDict(path: string): Promise<NativeDictSource>;
export declare function clearDictCache(): void;
export type { DictSource };
