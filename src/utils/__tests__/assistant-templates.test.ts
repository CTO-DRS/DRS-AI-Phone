import {
  createNewAssistant,
  createNewRoleplayAssistant,
  createNewVideoAssistant,
  prepareAssistantForEditing,
} from '../assistant-templates';
import {
  ASSISTANT_SCHEMA,
  ROLEPLAY_SCHEMA,
  VIDEO_SCHEMA,
} from '../../types/assistant';
import type {Assistant} from '../../types/assistant';

describe('Assistant Templates', () => {
  describe('createNewAssistant', () => {
    it('should create a new assistant-type assistant with correct defaults', () => {
      const assistant = createNewAssistant();

      expect(assistant).toEqual({
        type: 'local',
        name: '',
        description: '',
        systemPrompt: '',
        originalSystemPrompt: '',
        isSystemPromptChanged: false,
        useAIPrompt: false,
        parameters: {},
        parameterSchema: ASSISTANT_SCHEMA,
        source: 'local',
        capabilities: {},
      });
    });

    it('should not have an id (for new assistant creation)', () => {
      const assistant = createNewAssistant();
      expect(assistant.id).toBeUndefined();
    });
  });

  describe('createNewRoleplayAssistant', () => {
    it('should create a new roleplay assistant with correct defaults', () => {
      const assistant = createNewRoleplayAssistant();

      expect(assistant.type).toBe('local');
      expect(assistant.name).toBe('');
      expect(assistant.parameterSchema).toEqual(ROLEPLAY_SCHEMA);
      expect(assistant.parameters).toEqual({
        world: '',
        location: '',
        aiRole: '',
        userRole: '',
        situation: '',
        toneStyle: '',
      });
      expect(assistant.systemPrompt).toContain('{{world}}'); // Should contain template
    });
  });

  describe('createNewVideoAssistant', () => {
    it('should create a new video assistant with correct defaults', () => {
      const assistant = createNewVideoAssistant();

      expect(assistant.type).toBe('local');
      expect(assistant.name).toBe('');
      expect(assistant.systemPrompt).toBe(
        'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
      );
      expect(assistant.originalSystemPrompt).toBe(
        'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
      );
      expect(assistant.parameterSchema).toEqual(VIDEO_SCHEMA);
      expect(assistant.parameters).toEqual({
        captureInterval: '3000',
      });
      expect(assistant.capabilities?.video).toBe(true);
    });
  });

  describe('prepareAssistantForEditing', () => {
    it('should prepare a assistant for editing with all required fields', () => {
      const existingAssistant: Assistant = {
        type: 'local',
        id: 'test-id',
        name: 'Test Assistant',
        systemPrompt: 'Test prompt',
        isSystemPromptChanged: false,
        useAIPrompt: false,
        parameters: {test: 'value'},
        parameterSchema: [],
        source: 'local',
        capabilities: {},
      };

      const prepared = prepareAssistantForEditing(existingAssistant);

      expect(prepared.id).toBe('test-id');
      expect(prepared.name).toBe('Test Assistant');
      expect(prepared.description).toBe(''); // Should default to empty string
      expect(prepared.originalSystemPrompt).toBe('Test prompt'); // Should default to systemPrompt
    });
  });
});
