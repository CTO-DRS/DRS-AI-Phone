import {chatSessionStore} from '../ChatSessionStore';
import {assistantStore} from '../LegacyStore';
import {defaultCompletionSettings} from '../ChatSessionStore';
import {CompletionParams} from '../../utils/completionTypes';
import type {Assistant} from '../LegacyStore';
import {buildReasoningPayload} from '../../api/openai';

describe('ChatSessionStore - Assistant Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    chatSessionStore.sessions = [];
    chatSessionStore.activeSessionId = null;
    chatSessionStore.newChatAssistantId = undefined;
    chatSessionStore.newChatCompletionSettings = {...defaultCompletionSettings};
    chatSessionStore.newChatThinkingOverride = undefined;
    // Reset assistantStore
    assistantStore.assistants = [];
  });

  describe('resolveCompletionSettings', () => {
    it('should return system defaults when no other settings are available', async () => {
      const result = await chatSessionStore.resolveCompletionSettings();

      expect(result).toEqual(defaultCompletionSettings);
    });

    it('should apply global settings over system defaults', async () => {
      const globalSettings: Partial<CompletionParams> = {
        temperature: 0.8,
        top_p: 0.9,
      };

      chatSessionStore.newChatCompletionSettings = {
        ...defaultCompletionSettings,
        ...globalSettings,
      };

      const result = await chatSessionStore.resolveCompletionSettings();

      expect(result.temperature).toBe(0.8);
      expect(result.top_p).toBe(0.9);
    });

    it('should apply assistant settings over global settings', async () => {
      const globalSettings: Partial<CompletionParams> = {
        temperature: 0.8,
        top_p: 0.9,
      };

      const assistantSettings: Partial<CompletionParams> = {
        temperature: 0.5,
        top_k: 30,
      };

      chatSessionStore.newChatCompletionSettings = {
        ...defaultCompletionSettings,
        ...globalSettings,
      };

      // Set up a assistant in the assistantStore with completion settings
      const testAssistant: Assistant = {
        type: 'local',
        id: 'test-assistant-id',
        name: 'Test Assistant',
        description: 'Test assistant for settings',
        systemPrompt: 'Test prompt',
        isSystemPromptChanged: false,
        useAIPrompt: false,
        parameters: {},
        parameterSchema: [],
        completionSettings: assistantSettings as CompletionParams,
        source: 'local',
      };
      assistantStore.assistants.push(testAssistant);

      const result = await chatSessionStore.resolveCompletionSettings(
        undefined,
        'test-assistant-id',
      );

      expect(result.temperature).toBe(0.5); // From assistant settings
      expect(result.top_p).toBe(0.9); // From global settings
      expect(result.top_k).toBe(30); // From assistant settings
    });

    it('should apply session settings over all other settings', async () => {
      const globalSettings: Partial<CompletionParams> = {
        temperature: 0.8,
        top_p: 0.9,
      };

      const assistantSettings: Partial<CompletionParams> = {
        temperature: 0.5,
        top_k: 30,
      };

      const sessionSettings: CompletionParams = {
        ...defaultCompletionSettings,
        temperature: 0.3,
        n_predict: 200,
      };

      chatSessionStore.newChatCompletionSettings = {
        ...defaultCompletionSettings,
        ...globalSettings,
      };

      chatSessionStore.sessions = [
        {
          id: 'test-session',
          title: 'Test Session',
          date: '2024-01-01',
          messages: [],
          completionSettings: sessionSettings,
          activeAssistantId: 'test-assistant-id',
          settingsSource: 'custom',
        },
      ];

      // Set up a assistant in the assistantStore with completion settings
      const testAssistant: Assistant = {
        type: 'local',
        id: 'test-assistant-id',
        name: 'Test Assistant',
        description: 'Test assistant for settings',
        systemPrompt: 'Test prompt',
        isSystemPromptChanged: false,
        useAIPrompt: false,
        parameters: {},
        parameterSchema: [],
        completionSettings: assistantSettings as CompletionParams,
        source: 'local',
      };
      assistantStore.assistants.push(testAssistant);

      const result = await chatSessionStore.resolveCompletionSettings(
        'test-session',
        'test-assistant-id',
      );

      expect(result.temperature).toBe(0.3); // From session settings
      expect(result.top_p).toBe(0.95); // From session settings (default value)
      expect(result.top_k).toBe(40); // From session settings (default value)
      expect(result.n_predict).toBe(200); // From session settings
    });
  });

  describe('getCurrentCompletionSettings', () => {
    it('should resolve settings for new chat with assistant', async () => {
      const assistantSettings: Partial<CompletionParams> = {
        temperature: 0.7,
      };

      chatSessionStore.newChatAssistantId = 'test-assistant-id';

      // Set up a assistant in the assistantStore with completion settings
      const testAssistant: Assistant = {
        type: 'local',
        id: 'test-assistant-id',
        name: 'Test Assistant',
        description: 'Test assistant for settings',
        systemPrompt: 'Test prompt',
        isSystemPromptChanged: false,
        useAIPrompt: false,
        parameters: {},
        parameterSchema: [],
        completionSettings: assistantSettings as CompletionParams,
        source: 'local',
      };
      assistantStore.assistants.push(testAssistant);

      const result = await chatSessionStore.getCurrentCompletionSettings();

      expect(result.temperature).toBe(0.7);
    });

    it('should resolve settings for active session', async () => {
      const sessionSettings: CompletionParams = {
        ...defaultCompletionSettings,
        temperature: 0.9,
      };

      chatSessionStore.activeSessionId = 'test-session';
      chatSessionStore.sessions = [
        {
          id: 'test-session',
          title: 'Test Session',
          date: '2024-01-01',
          messages: [],
          completionSettings: sessionSettings,
          activeAssistantId: 'test-assistant-id',
          settingsSource: 'custom',
        },
      ];

      const result = await chatSessionStore.getCurrentCompletionSettings();

      expect(result.temperature).toBe(0.9);
    });
  });

  describe('newChatThinkingOverride', () => {
    const makeThinkingAssistant = (
      id: string,
      enableThinking: boolean,
      extra: Partial<CompletionParams> = {},
    ): Assistant => ({
      type: 'local',
      id,
      name: `Assistant ${id}`,
      description: '',
      systemPrompt: '',
      isSystemPromptChanged: false,
      useAIPrompt: false,
      parameters: {},
      parameterSchema: [],
      completionSettings: {
        ...defaultCompletionSettings,
        enable_thinking: enableThinking,
        ...extra,
      } as CompletionParams,
      source: 'local',
    });

    it('override wins over assistant in no-session resolve (default assistant flips OFF)', async () => {
      assistantStore.assistants.push(makeThinkingAssistant('assistantX', true, {temperature: 0.5}));
      chatSessionStore.newChatAssistantId = 'assistantX';
      chatSessionStore.newChatThinkingOverride = false;

      const result = await chatSessionStore.resolveCompletionSettings(
        undefined,
        'assistantX',
      );

      // Override wins for enable_thinking.
      expect(result.enable_thinking).toBe(false);
      // Reasoning carrier mirrors the override so the remote wire path honors
      // the OFF intent for the first message of the new chat (not local-only).
      expect(result.reasoning).toEqual({enabled: false});
      // Assistant's other completion settings survive — override is single-key.
      expect(result.temperature).toBe(0.5);
    });

    it('override wins over assistant in no-session resolve (authored assistant flips ON)', async () => {
      // Assistant has enable_thinking: false; user flips to true via override.
      assistantStore.assistants.push(makeThinkingAssistant('assistantX', false));
      chatSessionStore.newChatAssistantId = 'assistantX';
      chatSessionStore.newChatThinkingOverride = true;

      const result = await chatSessionStore.resolveCompletionSettings(
        undefined,
        'assistantX',
      );

      expect(result.enable_thinking).toBe(true);
      expect(result.reasoning).toEqual({enabled: true});
    });

    it('no-session OFF override carrier yields per-serverType OFF payload', async () => {
      // The whole point of carrying the override on `reasoning`: a brand-new
      // remote chat opened with thinking OFF must produce a real OFF wire
      // payload, not an empty object.
      assistantStore.assistants.push(makeThinkingAssistant('assistantRemote', true));
      chatSessionStore.newChatAssistantId = 'assistantRemote';
      chatSessionStore.newChatThinkingOverride = false;

      const result = await chatSessionStore.resolveCompletionSettings(
        undefined,
        'assistantRemote',
      );

      expect(result.reasoning?.enabled).toBe(false);
      expect(buildReasoningPayload('llama.cpp', result.reasoning)).toEqual({
        reasoning_format: 'auto',
        chat_template_kwargs: {enable_thinking: false},
      });
      expect(buildReasoningPayload('Ollama', result.reasoning)).toEqual({
        reasoning_effort: 'none',
      });
    });

    it('override is ignored on session-branch resolution (settingsSource assistant)', async () => {
      assistantStore.assistants.push(makeThinkingAssistant('assistantX', true));
      // Active session with settingsSource='assistant' — resolver should
      // return assistant's enable_thinking, NOT the no-session override.
      chatSessionStore.sessions = [
        {
          id: 'session-1',
          title: 'Session 1',
          date: '2024-01-01',
          messages: [],
          completionSettings: {
            ...defaultCompletionSettings,
            enable_thinking: true,
          },
          activeAssistantId: 'assistantX',
          settingsSource: 'assistant',
        },
      ];
      chatSessionStore.newChatThinkingOverride = false;

      const result = await chatSessionStore.resolveCompletionSettings(
        'session-1',
        'assistantX',
      );

      // Assistant's value wins; override is not applied on the session branch.
      expect(result.enable_thinking).toBe(true);
    });

    it('override does NOT strip PACT-derived tools', async () => {
      // Assistant advertises a registered talent — resolver should inject
      // tools AND still let the override flip enable_thinking last.
      const assistantWithTalent: Assistant = {
        ...makeThinkingAssistant('assistantToolful', true),
        pact: {
          talents: [{name: 'calculate', necessity: 'required'}],
        },
      };
      assistantStore.assistants.push(assistantWithTalent);
      chatSessionStore.newChatAssistantId = 'assistantToolful';
      chatSessionStore.newChatThinkingOverride = false;

      const result = await chatSessionStore.resolveCompletionSettings(
        undefined,
        'assistantToolful',
      );

      expect(result.enable_thinking).toBe(false);
      const tools = (result.tools ?? []) as any[];
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      // Tools came from the requested talent.
      const toolNames = tools.map((t: any) => t?.function?.name ?? t?.name);
      expect(toolNames).toContain('calculate');
    });
  });
});
