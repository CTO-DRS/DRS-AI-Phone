import {act, renderHook} from '@testing-library/react-hooks';

import {chatSessionStore, modelStore} from '../../store';
import {registerDefaultTalents} from '../../services/talents';
import type {Assistant} from '../../types/assistant';

import {useAssistantLoadHint} from '../useAssistantLoadHint';

// talentRegistry (src/services/talents) is the real singleton in Jest — only
// src/services/index is centrally mocked. Register the built-in engines so
// render_html (recommendedContextTokens=4096) and the light engines
// (datetime/calculate, no field) are available.
registerDefaultTalents();

const setNCtx = (n: number | undefined) => {
  (modelStore as any).activeContextSettings =
    n === undefined ? undefined : {n_ctx: n};
};

const assistantWith = (talentNames: string[]): Assistant =>
  ({
    id: 'assistant-1',
    pact: {
      talents: talentNames.map(name => ({name, required: true})),
    },
  }) as unknown as Assistant;

describe('useAssistantLoadHint', () => {
  beforeEach(() => {
    chatSessionStore.assistantLoadHintSeen = new Set();
    (
      chatSessionStore.markAssistantLoadHintSeen as jest.Mock
    ).mockImplementation((sig: string) => {
      chatSessionStore.assistantLoadHintSeen.add(sig);
    });
    setNCtx(2048);
  });

  afterEach(() => {
    setNCtx(undefined);
    (chatSessionStore.markAssistantLoadHintSeen as jest.Mock).mockReset();
  });

  it('fires once when a heavy-talent assistant loads below its recommended context', () => {
    const {result} = renderHook(() =>
      useAssistantLoadHint({
        activeAssistant: assistantWith(['render_html']),
        isFocused: true,
      }),
    );
    expect(result.current.hintVisible).toBe(true);
    expect(chatSessionStore.markAssistantLoadHintSeen).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire for the same assistant-load signature on re-render', () => {
    const {result, rerender} = renderHook(
      ({focused}) =>
        useAssistantLoadHint({
          activeAssistant: assistantWith(['render_html']),
          isFocused: focused,
        }),
      {initialProps: {focused: true}},
    );
    expect(result.current.hintVisible).toBe(true);
    act(() => result.current.dismiss());
    rerender({focused: true});
    // Signature already seen → predicate short-circuits; only the first emit.
    expect(chatSessionStore.markAssistantLoadHintSeen).toHaveBeenCalledTimes(1);
  });

  it('does not fire when loaded n_ctx meets or exceeds the recommendation', () => {
    setNCtx(4096);
    const {result} = renderHook(() =>
      useAssistantLoadHint({
        activeAssistant: assistantWith(['render_html']),
        isFocused: true,
      }),
    );
    expect(result.current.hintVisible).toBe(false);
    expect(chatSessionStore.markAssistantLoadHintSeen).not.toHaveBeenCalled();
  });

  it('does not fire for light talents with no recommendedContextTokens field', () => {
    const {result} = renderHook(() =>
      useAssistantLoadHint({
        activeAssistant: assistantWith(['datetime', 'calculate']),
        isFocused: true,
      }),
    );
    expect(result.current.hintVisible).toBe(false);
    expect(chatSessionStore.markAssistantLoadHintSeen).not.toHaveBeenCalled();
  });

  it('does not fire while the chat surface is not focused', () => {
    const {result} = renderHook(() =>
      useAssistantLoadHint({
        activeAssistant: assistantWith(['render_html']),
        isFocused: false,
      }),
    );
    expect(result.current.hintVisible).toBe(false);
    expect(chatSessionStore.markAssistantLoadHintSeen).not.toHaveBeenCalled();
  });

  it('does not fire when no assistant is active', () => {
    const {result} = renderHook(() =>
      useAssistantLoadHint({activeAssistant: undefined, isFocused: true}),
    );
    expect(result.current.hintVisible).toBe(false);
    expect(chatSessionStore.markAssistantLoadHintSeen).not.toHaveBeenCalled();
  });

  it('does not fire when no model is loaded (n_ctx undefined)', () => {
    setNCtx(undefined);
    const {result} = renderHook(() =>
      useAssistantLoadHint({
        activeAssistant: assistantWith(['render_html']),
        isFocused: true,
      }),
    );
    expect(result.current.hintVisible).toBe(false);
    expect(chatSessionStore.markAssistantLoadHintSeen).not.toHaveBeenCalled();
  });

  it('dismiss() clears the hint', () => {
    const {result} = renderHook(() =>
      useAssistantLoadHint({
        activeAssistant: assistantWith(['render_html']),
        isFocused: true,
      }),
    );
    expect(result.current.hintVisible).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.hintVisible).toBe(false);
  });
});
