import {buildPipGreeting} from '../onboardingAssistants';
import {l10n} from '../../../locales';

describe('buildPipGreeting', () => {
  it('builds the localized greeting from the en bundle', () => {
    const g = buildPipGreeting(l10n.en);
    const block = l10n.en.onboarding.screen6.assistant.pip.greeting;

    expect(g.text).toBe(block.text);
    expect(g.suggestedPrompts).toEqual([
      block.prompt1,
      block.prompt2,
      block.prompt3,
      block.prompt4,
    ]);
  });

  it('resolves a distinct Arabic greeting with the same shape', () => {
    const en = buildPipGreeting(l10n.en);
    const ar = buildPipGreeting(l10n.ar);
    const arBlock = l10n.ar.onboarding.screen6.assistant.pip.greeting;

    expect(ar.text).toBe(arBlock.text);
    expect(ar.text).not.toBe(en.text);
    expect(ar.suggestedPrompts).toHaveLength(4);
    // Mutable array — the Assistant.greeting contract is not readonly.
    expect(Array.isArray(ar.suggestedPrompts)).toBe(true);
  });
});
