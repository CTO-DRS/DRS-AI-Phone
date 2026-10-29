/**
 * Central registry for llama.rn native error-message patterns
 * (audit: AI-05 / CODE-03).
 *
 * llama.rn — and llama.cpp underneath it — reports failures as plain
 * `Error.message` strings; there is no typed error code to switch on yet.
 * The chat pipeline branches on the TEXT of three of those messages to
 * surface friendly UI (context-full banner, truncation hint,
 * speculative-init notice) instead of a multi-KB raw error dump.
 *
 * String-matching native throws is fragile: an upstream reword silently
 * disables detection. Centralizing the patterns here gives that coupling
 * exactly one home:
 *
 * - `__tests__/llamaErrorPatterns.test.ts` pins each pattern to the
 *   native string it was extracted from. When bumping llama.rn, re-check
 *   the throws below against the new sources and update THIS FILE ONLY.
 * - A reword upstream turns these tests red instead of silently killing
 *   the banner in chat.
 * - Preferred long-term fix: a typed flag on CompletionResult upstream.
 *   Until that exists, this file is the LLAMARN-DEP marker.
 */

/** Which known llama.rn native failure shapes a message matches. */
export interface LlamaErrorSignals {
  /**
   * The native tool-call parser threw on malformed/truncated JSON in
   * tool_calls arguments — almost always because the model ran out of
   * context mid-args (most often `render_html` with a long string).
   * Upstream throw (llama.rn tool-call parsing):
   *   "Failed to parse tool call arguments as JSON: ..."
   */
  isToolArgsParseError: boolean;
  /**
   * Prompt-processing overflow: the prompt itself exceeds n_ctx
   * (ctx_shift is off — the llama.rn default), and the native layer
   * throws before any token is generated, so run_finished never fires.
   * Upstream throw (RNLlamaJSI.cpp): "Context is full".
   */
  isContextFullError: boolean;
  /**
   * Low-RAM devices can fail to allocate the speculative (MTP) draft
   * context at first completion — the load-time memory check has no
   * term for it. Upstream throw (rn-completion.cpp):
   *   "Failed to create MTP draft context".
   */
  isSpeculativeInitError: boolean;
}

// LLAMARN-DEP: patterns below are coupled to the native throw sites
// named in the interface docs above. Keep the /i flag: observed native
// messages arrive with varying capitalization depending on the throw
// path, and the tests pin the exact known-good forms.
const TOOL_CALL_ARGS_PARSE_RE = /Failed to parse tool call arguments as JSON/i;
const CONTEXT_FULL_RE = /context is full/i;
const SPECULATIVE_INIT_RE = /failed to create MTP draft context/i;

/**
 * Classify a native completion error message into the known llama.rn
 * failure shapes this app reacts to. Empty/undefined input classifies
 * as "none of the above" so callers can pass raw `error?.message`
 * without pre-validation.
 */
export function classifyLlamaError(
  errorMessage: string | undefined | null,
): LlamaErrorSignals {
  const message = errorMessage ?? '';
  return {
    isToolArgsParseError: TOOL_CALL_ARGS_PARSE_RE.test(message),
    isContextFullError: CONTEXT_FULL_RE.test(message),
    isSpeculativeInitError: SPECULATIVE_INIT_RE.test(message),
  };
}
