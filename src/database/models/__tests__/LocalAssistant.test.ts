import LocalAssistant from '../LocalAssistant';

/**
 * LocalAssistant is a WatermelonDB model, but its `pact` / `greeting` round-trip
 * logic is pure JSON-stringify/parse via getters. Under the jest mock for
 * watermelondb decorators (see __mocks__/external/@nozbe/watermelondb/
 * decorators.js) fields are just plain instance properties, so we can set
 * them directly and exercise toAssistant() / getters without a real DB.
 */
function makeAssistant(raw: Record<string, any> = {}): LocalAssistant {
  // WatermelonDB decorators are no-ops in the jest mock, so a plain object
  // with LocalAssistant.prototype is enough to exercise the pure-JS round-trip.
  const base: Record<string, any> = {
    name: 'Test',
    systemPrompt: '',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    source: 'local',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...raw,
  };
  const instance = Object.create(LocalAssistant.prototype);
  for (const [k, v] of Object.entries(base)) {
    Object.defineProperty(instance, k, {
      value: v,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  return instance as LocalAssistant;
}

describe('LocalAssistant.toAssistant - pact / greeting round-trip', () => {
  it('serializes pact via safeStringify and parses via getter', () => {
    const pactData = {
      talents: [
        {name: 'render_html', necessity: 'required'},
        {name: 'calculate', necessity: 'optional'},
      ],
    };
    const stringified = LocalAssistant.safeStringify(pactData);
    expect(stringified).toBe(
      '{"talents":[{"name":"render_html","necessity":"required"},{"name":"calculate","necessity":"optional"}]}',
    );

    const assistant = makeAssistant({pact: stringified});
    expect(assistant.pactObject).toEqual(pactData);
    const view = assistant.toAssistant();
    expect(view.pact).toEqual(pactData);
  });

  it('serializes greeting via safeStringify and parses via getter', () => {
    const stringified = LocalAssistant.safeStringify({text: 'hi there'});
    expect(stringified).toBe('{"text":"hi there"}');

    const assistant = makeAssistant({greeting: stringified});
    expect(assistant.greetingObject).toEqual({text: 'hi there'});
    expect(assistant.toAssistant().greeting).toEqual({text: 'hi there'});
  });

  it('round-trips greeting.suggestedPrompts alongside text', () => {
    const full = {
      text: 'hi there',
      suggestedPrompts: ['Tell me a joke', 'Summarize this'],
    };
    const assistant = makeAssistant({
      greeting: LocalAssistant.safeStringify(full),
    });
    expect(assistant.greetingObject).toEqual(full);
    expect(assistant.toAssistant().greeting).toEqual(full);
  });

  it('returns undefined when pact/greeting are unset', () => {
    const assistant = makeAssistant({});
    expect(assistant.pactObject).toBeUndefined();
    expect(assistant.greetingObject).toBeUndefined();
    const view = assistant.toAssistant();
    expect(view.pact).toBeUndefined();
    expect(view.greeting).toBeUndefined();
  });

  it('safeStringify returns undefined for null/undefined (preserves absence)', () => {
    expect(LocalAssistant.safeStringify(undefined)).toBeUndefined();
    expect(LocalAssistant.safeStringify(null)).toBeUndefined();
  });

  it('getters are defensive against malformed JSON', () => {
    const assistant = makeAssistant({pact: 'not json', greeting: '{bad'});
    expect(assistant.pactObject).toBeUndefined();
    expect(assistant.greetingObject).toBeUndefined();
  });

  it('safeStringifyArray always returns a string (never undefined)', () => {
    expect(LocalAssistant.safeStringifyArray([])).toBe('[]');
    expect(LocalAssistant.safeStringifyArray(['a', 'b'])).toBe('["a","b"]');
  });
});
