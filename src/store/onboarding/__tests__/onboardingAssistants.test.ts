import {
  ONBOARDING_ASSISTANTS,
  TOPIC_TO_ASSISTANT,
  entryId,
  resolveAssistantForTopic,
  type OnboardingAssistantDef,
  type OnboardingAssistantModelEntry,
  type OnboardingModelTier,
} from '../onboardingAssistants';
import {TOPIC_KEYS} from '../types';

const ID_PATTERN = /^[^/]+\/[^/]+\/[^/]+\.gguf$/;

const allEntries: Array<
  [string, OnboardingModelTier, OnboardingAssistantModelEntry]
> = ONBOARDING_ASSISTANTS.flatMap(p =>
  p.models.map(
    m =>
      [p.key, m.tier, m] as [
        string,
        OnboardingModelTier,
        OnboardingAssistantModelEntry,
      ],
  ),
);

describe('onboardingAssistants', () => {
  it('exposes five assistants (pip/codie/sage/echo/muse)', () => {
    expect(ONBOARDING_ASSISTANTS.map(p => p.key)).toEqual([
      'pip',
      'codie',
      'sage',
      'echo',
      'muse',
    ]);
  });

  it('maps every topic key to a assistant; else falls back to pip', () => {
    for (const key of TOPIC_KEYS) {
      expect(TOPIC_TO_ASSISTANT[key]).toBeDefined();
    }
    expect(TOPIC_TO_ASSISTANT.else.key).toBe('pip');
    expect(TOPIC_TO_ASSISTANT.smartchat.key).toBe('pip');
  });

  it('resolveAssistantForTopic handles null (treated as else → pip)', () => {
    expect(resolveAssistantForTopic(null).key).toBe('pip');
  });

  it.each<[string, OnboardingAssistantDef]>(
    ONBOARDING_ASSISTANTS.map(p => [p.key, p]),
  )(
    'assistant %s has 3 tiers in quick/balanced/best order with exactly one recommended (balanced)',
    (_key, assistant) => {
      expect(assistant.models).toHaveLength(3);
      expect(assistant.models.map(m => m.tier)).toEqual([
        'quick',
        'balanced',
        'best',
      ]);
      const recommended = assistant.models.filter(m => m.recommended);
      expect(recommended).toHaveLength(1);
      expect(recommended[0].tier).toBe('balanced');
    },
  );

  it.each<[string, OnboardingModelTier, OnboardingAssistantModelEntry]>(
    allEntries,
  )(
    '%s/%s entry has non-empty repo/filename and id matches the canonical shape',
    (_assistantKey, _tier, entry) => {
      expect(entry.repo.length).toBeGreaterThan(0);
      expect(entry.filename.length).toBeGreaterThan(0);
      expect(entryId(entry)).toMatch(ID_PATTERN);
    },
  );

  it.each<[string, OnboardingModelTier, OnboardingAssistantModelEntry]>(
    allEntries,
  )(
    '%s/%s entry downloadUrl equals huggingface.co/<repo>/resolve/main/<filename>',
    (_assistantKey, _tier, entry) => {
      expect(entry.downloadUrl).toBe(
        `https://huggingface.co/${entry.repo}/resolve/main/${entry.filename}`,
      );
    },
  );

  it.each<[string, OnboardingModelTier, OnboardingAssistantModelEntry]>(
    allEntries,
  )(
    '%s/%s entry has populated picker fields (sizeBytes, params, displayName, author)',
    (_assistantKey, _tier, entry) => {
      expect(entry.sizeBytes).toBeGreaterThan(0);
      expect(entry.params).toBeGreaterThan(0);
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.author.length).toBeGreaterThan(0);
    },
  );
});
