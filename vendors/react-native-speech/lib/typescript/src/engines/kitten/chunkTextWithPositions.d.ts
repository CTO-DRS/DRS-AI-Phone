/**
 * Split text into per-sentence chunks, preserving original-text positions
 * for ChunkProgressEvent so HighlightedText stays in sync with the input.
 * Matches the behavior of the upstream kittentts chunker (split on .!? and
 * ensure trailing punctuation), but tracks the start/end of each sentence
 * within the unmodified input string. Oversize sentences fall back to
 * whitespace splitting, still in original-text space.
 */
export declare function chunkTextWithPositions(text: string, maxLen: number): Array<{
    text: string;
    startIndex: number;
    endIndex: number;
}>;
//# sourceMappingURL=chunkTextWithPositions.d.ts.map