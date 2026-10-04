'use strict';

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

import {loadAssetAsText} from '../utils/AssetLoader.js';
import {JsDictSource} from './JsDictSource.js';
import {openNativeDict} from './NativeDictSource.js';
const cache = new Map();

/**
 * Load a TSV dict (`word<TAB>ipa` per line) into memory and return a
 * JsDictSource. Cached by path.
 */
export async function loadDict(path) {
  const cached = cache.get(path);
  if (cached) return cached;
  const text = await loadAssetAsText(path);
  const dict = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab > 0) {
      dict[line.slice(0, tab)] = line.slice(tab + 1);
    }
  }
  const src = new JsDictSource(dict);
  cache.set(path, src);
  return src;
}

/**
 * Open a binary EPD1 dict via the Turbo Module. The native side mmaps
 * the file; the returned DictSource performs sync lookups via JSI.
 *
 * Strips the file:// prefix if present (native side wants a real path).
 */
export async function loadNativeDict(path) {
  const fsPath = path.startsWith('file://')
    ? path.slice('file://'.length)
    : path;
  return openNativeDict(fsPath);
}
export function clearDictCache() {
  cache.clear();
}
//# sourceMappingURL=dict.js.map
