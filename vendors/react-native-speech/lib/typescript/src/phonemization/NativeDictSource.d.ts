import type { DictSource } from './DictSource';
export declare class NativeDictSource implements DictSource {
    /** Path the dict was opened from. Informational only. */
    readonly path: string;
    constructor(path: string);
    lookup(word: string): string | null;
    size(): undefined;
    toString(): string;
}
/**
 * Open a dict file via the Turbo Module and return a NativeDictSource bound
 * to it. Throws if the open call fails.
 */
export declare function openNativeDict(path: string): Promise<NativeDictSource>;
//# sourceMappingURL=NativeDictSource.d.ts.map