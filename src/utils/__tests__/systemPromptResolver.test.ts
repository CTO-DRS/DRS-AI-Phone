import {
  assembleMessages,
  resolveSystemPrompt,
  resolveSystemMessages,
} from '../systemPromptResolver';
import type {Assistant} from '../../types/assistant';
import type {Model} from '../types';

describe('systemPromptResolver', () => {
  describe('resolveSystemPrompt', () => {
    it('should return parametrized assistant system prompt when assistant has parameters', () => {
      const assistant: Partial<Assistant> = {
        systemPrompt: 'You are {{name}}, a {{role}} in {{setting}}.',
        parameters: {
          name: 'Gandalf',
          role: 'wizard',
          setting: 'Middle-earth',
        },
      };

      const result = resolveSystemPrompt({assistant: assistant as Assistant});

      expect(result).toBe('You are Gandalf, a wizard in Middle-earth.');
    });

    it('should return assistant system prompt as-is when assistant has no parameters', () => {
      const assistant: Partial<Assistant> = {
        systemPrompt: 'You are a helpful assistant.',
        parameters: {},
      };

      const result = resolveSystemPrompt({assistant: assistant as Assistant});

      expect(result).toBe('You are a helpful assistant.');
    });

    it('should return assistant system prompt as-is when assistant has undefined parameters', () => {
      const assistant: Partial<Assistant> = {
        systemPrompt: 'You are a helpful assistant.',
        parameters: undefined,
      };

      const result = resolveSystemPrompt({assistant: assistant as Assistant});

      expect(result).toBe('You are a helpful assistant.');
    });

    it('should fallback to model chat template when assistant has no system prompt', () => {
      const assistant: Partial<Assistant> = {
        systemPrompt: undefined,
      };

      const activeModel: Partial<Model> = {
        chatTemplate: {
          systemPrompt: 'Model default system prompt',
          addGenerationPrompt: false,
          name: '',
          bosToken: '',
          eosToken: '',
          chatTemplate: '',
        },
      };

      const result = resolveSystemPrompt({
        assistant: assistant as Assistant,
        model: activeModel as Model,
      });

      expect(result).toBe('Model default system prompt');
    });

    it('should fallback to model chat template when assistant is null', () => {
      const activeModel: Partial<Model> = {
        chatTemplate: {
          systemPrompt: 'Model default system prompt',
          addGenerationPrompt: false,
          name: '',
          bosToken: '',
          eosToken: '',
          chatTemplate: '',
        },
      };

      const result = resolveSystemPrompt({
        assistant: null,
        model: activeModel as Model,
      });

      expect(result).toBe('Model default system prompt');
    });

    it('should return empty string when no assistant and no model system prompt', () => {
      const result = resolveSystemPrompt({
        assistant: null,
        model: null,
      });

      expect(result).toBe('');
    });

    it('should return empty string when model has no chat template', () => {
      const activeModel: Partial<Model> = {
        chatTemplate: undefined,
      };

      const result = resolveSystemPrompt({
        assistant: null,
        model: activeModel as Model,
      });

      expect(result).toBe('');
    });

    it('should prioritize assistant system prompt over model system prompt', () => {
      const assistant: Partial<Assistant> = {
        systemPrompt: 'Assistant system prompt',
        parameters: {},
      };

      const activeModel: Partial<Model> = {
        chatTemplate: {
          systemPrompt: 'Model system prompt',
          addGenerationPrompt: false,
          name: '',
          bosToken: '',
          eosToken: '',
          chatTemplate: '',
        },
      };

      const result = resolveSystemPrompt({
        assistant: assistant as Assistant,
        model: activeModel as Model,
      });

      expect(result).toBe('Assistant system prompt');
    });
  });

  describe('resolveSystemMessages', () => {
    it('should return system message array when system prompt exists', () => {
      const assistant: Partial<Assistant> = {
        systemPrompt: 'You are a helpful assistant.',
        parameters: {},
      };

      const result = resolveSystemMessages({assistant: assistant as Assistant});

      expect(result).toEqual([
        {
          role: 'system',
          content: 'You are a helpful assistant.',
        },
      ]);
    });

    it('should return empty array when system prompt is empty', () => {
      const result = resolveSystemMessages({
        assistant: null,
        model: null,
      });

      expect(result).toEqual([]);
    });

    it('should return empty array when system prompt is whitespace only', () => {
      const activeModel: Partial<Model> = {
        chatTemplate: {
          systemPrompt: '   \n\t  ',
          addGenerationPrompt: false,
          name: '',
          bosToken: '',
          eosToken: '',
          chatTemplate: '',
        },
      };

      const result = resolveSystemMessages({
        assistant: null,
        model: activeModel as Model,
      });

      expect(result).toEqual([]);
    });

    it('should return system message array for parametrized assistant', () => {
      const assistant: Partial<Assistant> = {
        systemPrompt: 'You are {{name}}, a {{role}}.',
        parameters: {
          name: 'Alice',
          role: 'teacher',
        },
      };

      const result = resolveSystemMessages({assistant: assistant as Assistant});

      expect(result).toEqual([
        {
          role: 'system',
          content: 'You are Alice, a teacher.',
        },
      ]);
    });
  });

  describe('assembleMessages', () => {
    const sys = (content: string) => ({role: 'system' as const, content});
    const user = {role: 'user' as const, content: 'hello'};

    it('folds the assistant prompt and every fragment into one leading system message', () => {
      const result = assembleMessages(
        [sys('Assistant prompt')],
        ['FRAGMENT-A', 'FRAGMENT-B'],
        [user],
      );

      expect(result).toEqual([
        {role: 'system', content: 'Assistant prompt\n\nFRAGMENT-A\n\nFRAGMENT-B'},
        user,
      ]);
    });

    it('emits the fragments as the sole system message when the assistant has none', () => {
      const result = assembleMessages([], ['FRAGMENT'], [user]);

      expect(result).toEqual([{role: 'system', content: 'FRAGMENT'}, user]);
    });

    it('leaves the assistant prompt untouched when no talent contributes a fragment', () => {
      const result = assembleMessages([sys('Assistant prompt')], [], [user]);

      expect(result).toEqual([{role: 'system', content: 'Assistant prompt'}, user]);
    });

    it('drops empty and whitespace-only parts', () => {
      const result = assembleMessages([sys('   ')], ['', '  ', 'REAL'], [user]);

      expect(result).toEqual([{role: 'system', content: 'REAL'}, user]);
    });

    it('produces no system message when there is nothing to say', () => {
      expect(assembleMessages([], [], [user])).toEqual([user]);
    });

    it('keeps the single system message leading, ahead of the conversation', () => {
      const history = [
        {role: 'assistant' as const, content: 'earlier reply'},
        user,
      ];
      const result = assembleMessages(
        [sys('Assistant prompt')],
        ['FRAGMENT'],
        history,
      );

      expect(result[0]).toEqual({
        role: 'system',
        content: 'Assistant prompt\n\nFRAGMENT',
      });
      expect(result.slice(1)).toEqual(history);
      expect(result.filter(msg => msg.role === 'system')).toHaveLength(1);
    });
  });
});
