/**
 * AI-04 / PERF-05: approximate context-window budgeting for local inference.
 *
 * The app has no JS-side tokenizer (llama.rn tokenizes natively), so token
 * counts are estimated from character counts before every send. When the
 * assembled history exceeds the budget derived from the active context
 * window, the OLDEST turns are dropped — the leading system message and the
 * current user turn are always kept. Trimming early also keeps the prefill
 * time (and memory) bounded on long conversations.
 *
 * The heuristic deliberately OVER-estimates: llama.cpp BPE vocabularies spend
 * roughly 3–4 characters per token on English and ~2–3 on Arabic; counting
 * one token per CHARS_PER_TOKEN characters errs on the high side for both,
 * which only makes trimming happen a little earlier — always safe.
 */

/** Conservative characters-per-token ratio (EN+AR mixed content). */
export const CHARS_PER_TOKEN = 3;

/** Wrapper cost per message (role, newline, chat-template markers). */
export const MESSAGE_OVERHEAD_TOKENS = 4;

/** Fallback context window when the model/settings do not provide one. */
export const DEFAULT_CONTEXT_SIZE = 4096;

/** Tokens reserved for the assistant's reply when n_predict is unlimited. */
export const DEFAULT_GENERATION_RESERVE = 1024;

/** Newest non-system messages always kept, even when still over budget. */
export const MIN_RECENT_MESSAGES_TO_KEEP = 2;

/**
 * Approximate token count of a string (never negative, never NaN).
 */
export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Approximate token count of one chat message. Non-string content (multimodal
 * parts) is conservatively charged via JSON serialization length.
 */
export function estimateMessageTokens(message: {
  role: string;
  content?: unknown;
}): number {
  const {content} = message;
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (content != null) {
    try {
      text = JSON.stringify(content);
    } catch {
      text = String(content);
    }
  }
  return estimateTokens(text) + MESSAGE_OVERHEAD_TOKENS;
}

/**
 * Total approximate token count of a message array.
 */
export function estimateConversationTokens(
  messages: Array<{role: string; content?: unknown}>,
): number {
  return messages.reduce(
    (sum, message) => sum + estimateMessageTokens(message),
    0,
  );
}

export interface ContextBudgetOptions {
  /** Active context window (n_ctx). Falls back to DEFAULT_CONTEXT_SIZE. */
  contextSize?: number;
  /** Tokens to keep for generation. Falls back to DEFAULT_GENERATION_RESERVE. */
  generationReserve?: number;
  /**
   * Newest non-system messages that survive even when the total still
   * exceeds the budget (the request must remain answerable). Default
   * MIN_RECENT_MESSAGES_TO_KEEP.
   */
  minRecentToKeep?: number;
}

export interface ContextBudgetResult<T> {
  /** The (possibly trimmed) message array — same order, same objects. */
  messages: T[];
  /** How many messages were dropped from the middle of the history. */
  droppedMessages: number;
  /** Estimated tokens dropped. */
  droppedTokens: number;
  /** Estimated tokens of the returned array. */
  usedTokens: number;
  /** The budget the result was trimmed to. */
  budgetTokens: number;
}

export function contextBudgetTokens(options: ContextBudgetOptions): number {
  const contextSize =
    options.contextSize && options.contextSize > 0
      ? options.contextSize
      : DEFAULT_CONTEXT_SIZE;
  const reserve =
    options.generationReserve && options.generationReserve > 0
      ? options.generationReserve
      : DEFAULT_GENERATION_RESERVE;
  const budget = Math.floor(contextSize) - Math.ceil(reserve);
  return Math.max(budget, Math.floor(contextSize / 4));
}

/**
 * Trim an assembled message list down to the estimated context budget.
 *
 * Rules:
 *  - A leading system message (index 0, role 'system') is always kept.
 *  - The final message (the current user turn) is always kept.
 *  - The oldest remaining messages are dropped one by one until the total
 *    fits the budget, but never below `minRecentToKeep` + the system message.
 *  - When nothing is dropped the input array is returned unchanged.
 */
export function trimMessagesToContextBudget<
  T extends {role: string; content?: unknown},
>(messages: T[], options: ContextBudgetOptions = {}): ContextBudgetResult<T> {
  const budget = contextBudgetTokens(options);
  const total = estimateConversationTokens(messages);
  if (total <= budget || messages.length <= 2) {
    return {
      messages,
      droppedMessages: 0,
      droppedTokens: 0,
      usedTokens: total,
      budgetTokens: budget,
    };
  }

  const minRecentToKeep = Math.max(
    options.minRecentToKeep ?? MIN_RECENT_MESSAGES_TO_KEEP,
    1,
  );
  const hasLeadingSystem = messages[0].role === 'system';

  // Drop oldest-first, starting after the leading system message.
  const protectedHead = hasLeadingSystem ? 1 : 0;
  const floor = Math.min(
    messages.length,
    protectedHead + minRecentToKeep + 1, // +1 for the final message
  );
  // Index of the first survivor; everything in [protectedHead, firstKept) is dropped.
  let firstKept = protectedHead;
  let used = total;
  let dropped = 0;
  let droppedTokens = 0;

  while (used > budget && messages.length - firstKept > floor - protectedHead) {
    const removed = messages[firstKept];
    used -= estimateMessageTokens(removed);
    droppedTokens += estimateMessageTokens(removed);
    dropped += 1;
    firstKept += 1;
  }

  // The leading system message (index 0) is NEVER dropped: the slice below
  // re-attaches it in front of the survivors when one exists.
  const trimmed = hasLeadingSystem
    ? [messages[0], ...messages.slice(firstKept)]
    : messages.slice(firstKept);
  if (trimmed.length === 0) {
    // Cannot happen (floor keeps at least one non-system message + the last),
    // but never return an empty context.
    return {
      messages,
      droppedMessages: 0,
      droppedTokens: 0,
      usedTokens: total,
      budgetTokens: budget,
    };
  }

  return {
    messages: trimmed,
    droppedMessages: dropped,
    droppedTokens,
    usedTokens: estimateConversationTokens(trimmed),
    budgetTokens: budget,
  };
}
