import {
  CHARS_PER_TOKEN,
  DEFAULT_CONTEXT_SIZE,
  DEFAULT_GENERATION_RESERVE,
  MESSAGE_OVERHEAD_TOKENS,
  contextBudgetTokens,
  estimateConversationTokens,
  estimateMessageTokens,
  estimateTokens,
  trimMessagesToContextBudget,
} from '../contextBudget';

describe('estimateTokens', () => {
  it('returns 0 for empty input', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('is strictly positive for any non-empty text', () => {
    expect(estimateTokens('a')).toBe(1);
  });

  it('scales with length at CHARS_PER_TOKEN characters per token', () => {
    const text = 'a'.repeat(CHARS_PER_TOKEN * 10 + 1);
    expect(estimateTokens(text)).toBe(11);
  });
});

describe('estimateMessageTokens', () => {
  it('adds the per-message wrapper overhead', () => {
    const body = 'a'.repeat(30);
    expect(estimateMessageTokens({role: 'user', content: body})).toBe(
      Math.ceil(30 / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD_TOKENS,
    );
  });

  it('charges non-string content via serialization', () => {
    const nonString = estimateMessageTokens({
      role: 'user',
      content: [{type: 'text', text: 'a'.repeat(CHARS_PER_TOKEN * 5)}],
    });
    expect(nonString).toBeGreaterThan(MESSAGE_OVERHEAD_TOKENS);
  });
});

describe('contextBudgetTokens', () => {
  it('subtracts the generation reserve from the context size', () => {
    expect(
      contextBudgetTokens({contextSize: 8192, generationReserve: 1024}),
    ).toBe(8192 - 1024);
  });

  it('falls back to defaults when nothing is provided', () => {
    expect(contextBudgetTokens({})).toBe(
      DEFAULT_CONTEXT_SIZE - DEFAULT_GENERATION_RESERVE,
    );
  });

  it('never collapses to a degenerate budget', () => {
    // reserve larger than context still leaves a quarter of the window
    expect(
      contextBudgetTokens({contextSize: 400, generationReserve: 5000}),
    ).toBe(100);
  });
});

describe('trimMessagesToContextBudget', () => {
  const sys = {role: 'system', content: 's'.repeat(300)};
  const turn = (n: number) => [
    {role: 'user', content: `u${n} `.repeat(200)}, // ~200 tokens
    {role: 'assistant', content: `a${n} `.repeat(200)},
  ];

  it('keeps everything when the conversation fits', () => {
    const messages = [sys, ...turn(1), {role: 'user', content: 'hello'}];
    const result = trimMessagesToContextBudget(messages, {
      contextSize: 1_000_000,
    });
    expect(result.droppedMessages).toBe(0);
    expect(result.messages).toBe(messages); // identity: untouched
  });

  it('drops oldest turns first and keeps system + current turn', () => {
    const messages = [
      sys,
      ...turn(1),
      ...turn(2),
      ...turn(3),
      ...turn(4),
      {role: 'user', content: 'the question'},
    ];
    const result = trimMessagesToContextBudget(messages, {
      contextSize: 1400,
      generationReserve: 100,
    });
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[result.messages.length - 1]).toEqual({
      role: 'user',
      content: 'the question',
    });
    expect(result.droppedMessages).toBeGreaterThan(0);
    // oldest dropped => turn 1 user message must be gone
    const joined = result.messages.map(m => String(m.content)).join('');
    expect(joined).not.toContain('u1 ');
  });

  it('never returns an empty or single-message context', () => {
    const messages = [
      sys,
      ...turn(1),
      {role: 'user', content: 'q'.repeat(50_000)},
    ];
    const result = trimMessagesToContextBudget(messages, {
      contextSize: 1000,
    });
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[result.messages.length - 1].content).toContain('q');
  });

  it('handles a conversation without a leading system message', () => {
    const messages = [...turn(1), ...turn(2), {role: 'user', content: 'hi'}];
    const result = trimMessagesToContextBudget(messages, {
      contextSize: 800,
      generationReserve: 100,
    });
    expect(result.messages[result.messages.length - 1]).toEqual({
      role: 'user',
      content: 'hi',
    });
    expect(result.messages.length).toBeLessThan(messages.length);
  });

  it('short inputs are returned unchanged', () => {
    const messages = [sys, {role: 'user', content: 'hi'}];
    const result = trimMessagesToContextBudget(messages, {
      contextSize: 10,
    });
    expect(result.messages).toBe(messages);
    expect(result.droppedMessages).toBe(0);
  });

  it('accounts: used + dropped equals the original total', () => {
    const messages = [
      sys,
      ...turn(1),
      ...turn(2),
      ...turn(3),
      {role: 'user', content: 'final'},
    ];
    const before = estimateConversationTokens(messages);
    const result = trimMessagesToContextBudget(messages, {
      contextSize: 1600,
      generationReserve: 100,
    });
    if (result.droppedMessages > 0) {
      expect(result.usedTokens + result.droppedTokens).toBe(before);
    }
  });
});
