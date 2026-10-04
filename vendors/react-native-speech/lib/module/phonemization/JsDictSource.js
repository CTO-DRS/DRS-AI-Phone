'use strict';

/**
 * JsDictSource — in-memory dict backed by a plain object.
 *
 * Used as a fallback / for tests / for non-RN environments. Production
 * (React Native) uses NativeDictSource which mmap's the binary dict file
 * via the Turbo Module.
 */

export class JsDictSource {
  constructor(dict) {
    this.dict = dict;
  }
  lookup(word) {
    return this.dict[word] ?? null;
  }
  size() {
    return Object.keys(this.dict).length;
  }
}
//# sourceMappingURL=JsDictSource.js.map
