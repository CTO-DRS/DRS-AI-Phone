import {classifyLlamaError} from '../llamaErrorPatterns';

/**
 * AI-05/CODE-03: these tests pin the exact native strings the app is
 * string-coupled to. They are the llama.rn upgrade checklist: if a bump
 * rewords a throw, these fail LOUDLY here instead of silently disabling
 * the context-full banner / truncation hint in chat.
 *
 * Sources of truth (llama.rn 0.13.0-rc.5):
 * - "Failed to parse tool call arguments as JSON: ..." — native tool-call
 *   parser (seen in CI-pinned real message with the
 *   [json.exception.parse_error.101] suffix).
 * - "Context is full" — RNLlamaJSI.cpp prompt-overflow throw.
 * - "Failed to create MTP draft context" — rn-completion.cpp.
 */
describe('classifyLlamaError', () => {
  describe('tool-call arguments parse error', () => {
    it('matches the pinned native string with its json.exception suffix', () => {
      const signals = classifyLlamaError(
        'Failed to parse tool call arguments as JSON: [json.exception.parse_error.101] parse error',
      );
      expect(signals.isToolArgsParseError).toBe(true);
    });

    it('matches case-insensitively (lowercased native reword)', () => {
      const signals = classifyLlamaError(
        'failed to parse tool call arguments as json',
      );
      expect(signals.isToolArgsParseError).toBe(true);
    });

    it('matches when embedded in a longer wrapper message', () => {
      const signals = classifyLlamaError(
        'Completion failed: Failed to parse tool call arguments as JSON: unexpected EOF',
      );
      expect(signals.isToolArgsParseError).toBe(true);
    });
  });

  describe('context full error', () => {
    it('matches the pinned native throw from RNLlamaJSI.cpp', () => {
      const signals = classifyLlamaError(
        'Error: Context is full. Try to increase the context size or enable context shift',
      );
      expect(signals.isContextFullError).toBe(true);
    });

    it('matches the lowercase variant seen on some throw paths', () => {
      const signals = classifyLlamaError(
        'llama.cpp error: context is full at position 512',
      );
      expect(signals.isContextFullError).toBe(true);
    });
  });

  describe('speculative (MTP) draft context init error', () => {
    it('matches the pinned native throw from rn-completion.cpp', () => {
      const signals = classifyLlamaError(
        'Failed to create MTP draft context: no memory',
      );
      expect(signals.isSpeculativeInitError).toBe(true);
    });

    it('matches case-insensitively', () => {
      const signals = classifyLlamaError(
        'runtime error: failed to create mtp draft context (ggml_alloc)',
      );
      expect(signals.isSpeculativeInitError).toBe(true);
    });
  });

  describe('signals are independent', () => {
    it('a tool-args parse error is not flagged as context-full on its own', () => {
      const signals = classifyLlamaError(
        'Failed to parse tool call arguments as JSON: bad escape',
      );
      expect(signals.isToolArgsParseError).toBe(true);
      expect(signals.isContextFullError).toBe(false);
      expect(signals.isSpeculativeInitError).toBe(false);
    });

    it('unrelated native errors classify as none-of-the-above', () => {
      const unrelated = [
        'network request failed',
        'Model file does not exist',
        'load_model: failed to load model',
        'Failed to open file',
        '',
      ];
      for (const message of unrelated) {
        const signals = classifyLlamaError(message);
        expect(signals.isToolArgsParseError).toBe(false);
        expect(signals.isContextFullError).toBe(false);
        expect(signals.isSpeculativeInitError).toBe(false);
      }
    });
  });

  describe('defensive input handling', () => {
    it('undefined message classifies as no signals (no throw)', () => {
      const signals = classifyLlamaError(undefined);
      expect(signals).toEqual({
        isToolArgsParseError: false,
        isContextFullError: false,
        isSpeculativeInitError: false,
      });
    });

    it('null message classifies as no signals (no throw)', () => {
      const signals = classifyLlamaError(null);
      expect(signals.isContextFullError).toBe(false);
    });
  });
});
