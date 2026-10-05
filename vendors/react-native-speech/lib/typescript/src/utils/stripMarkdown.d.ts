/**
 * Strip markdown formatting so the output reads cleanly through a TTS
 * phonemizer that only knows prose.
 *
 * Design goals:
 *   - Remove inline markers (`**`, `*`, `_`, `~~`, backticks) — content stays.
 *   - Turn block-level structure (headers, horizontal rules, list items,
 *     blockquotes, table rows) into plain sentences separated by `.` so the
 *     downstream sentence chunker (`[.!?]+` splitter) picks up natural
 *     breaks. Without this, an entire markdown section lands in one chunk
 *     with no pauses and garbled symbol pronunciations.
 *   - Drop link URLs, keep link text. Same for images (alt text only).
 *   - Drop fenced + inline code wrapping; keep the content. Code pronounced
 *     as prose is imperfect but better than literal backticks.
 *
 * This runs BEFORE the engine's existing text normalization / chunking so
 * the chunker benefits from the structural breaks we inject.
 *
 * Not a CommonMark parser — regex-based, pragmatic. Handles the shapes LLMs
 * actually emit. Order of operations matters: fenced code first (so its
 * contents aren't mis-parsed), then block structure, then inline.
 */
/**
 * Options for markdown stripping. All default to sensible TTS behavior.
 */
export interface StripMarkdownOptions {
    /**
     * If true (default), fenced code blocks (``` ... ```) are dropped
     * entirely. If false, their contents are kept (fences removed). Most
     * code is unreadable out loud, so dropping is usually better.
     */
    dropCodeBlocks?: boolean;
}
/**
 * Strip markdown syntax from text, producing TTS-friendly prose.
 *
 * Idempotent: re-applying to already-stripped text is a no-op (no markdown
 * tokens to strip).
 */
export declare function stripMarkdown(text: string, options?: StripMarkdownOptions): string;
/**
 * Line-buffered markdown stripper for streaming input.
 *
 * Engines' streaming paths hand text to `StreamingChunker` which splits on
 * `[.!?]+\s+`. Without this buffer, inline markers (`**`, backticks, pipes)
 * survive the chunker, and structural markers (`---`, `###`) never produce
 * chunk breaks because the chunker doesn't recognize them.
 *
 * Callers push incremental text via `push()`. The buffer emits cleaned
 * text whenever it can do so safely:
 *
 *   1. Complete-line flush. Whenever the buffer contains a newline,
 *      everything up through the last newline is run through
 *      `stripMarkdown`. Block-level constructs (headers, hrules, table
 *      rows) need the whole line, so this is the primary safe boundary.
 *
 *   2. Sentence-level flush from the partial (newline-less) tail. If the
 *      tail is not inside a fenced code block AND doesn't start with a
 *      block-level marker (header, list item, blockquote, table, fence),
 *      we look for `[.!?]+\s+` and emit the prefix. This is what
 *      progressive playback for ordinary prose without paragraph breaks
 *      depends on — without it, a single LLM paragraph would buffer
 *      until `finalize()` and time-to-first-audio would balloon.
 *
 *   3. End-of-stream `flush()`. Any remaining tail is stripped and
 *      emitted (unless we're still inside an unclosed fenced code block,
 *      in which case the partial code is discarded — consistent with
 *      `dropCodeBlocks`).
 *
 * Fenced code blocks (` ``` ` / ` ~~~ `) are tracked across pushes when
 * `dropCodeBlocks` is true (default): an opening fence at line start
 * enters drop mode, a closing fence exits it. Lines between are silently
 * discarded so the TTS doesn't read code aloud.
 */
export interface MarkdownStreamBuffer {
    push(text: string): string;
    flush(): string;
}
export declare function createMarkdownStreamBuffer(options?: StripMarkdownOptions): MarkdownStreamBuffer;
