/**
 * JsDictSource — in-memory dict backed by a plain object.
 *
 * Used as a fallback / for tests / for non-RN environments. Production
 * (React Native) uses NativeDictSource which mmap's the binary dict file
 * via the Turbo Module.
 */
import type { DictSource } from './DictSource';
export declare class JsDictSource implements DictSource {
    private readonly dict;
    constructor(dict: Record<string, string>);
    lookup(word: string): string | null;
    size(): number;
}
//# sourceMappingURL=JsDictSource.d.ts.map