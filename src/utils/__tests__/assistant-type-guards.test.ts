import {isLocalAssistant, isDrshubAssistant, handleAssistantByType} from '../assistant-type-guards';
import type {Assistant} from '../../types/assistant';
import type {DrshubAssistant} from '../../types/drshub';

describe('assistant-type-guards', () => {
  const mockLocalAssistant: Assistant = {
    type: 'local',
    id: 'local-assistant-1',
    name: 'Test Local Assistant',
    systemPrompt: 'You are a helpful assistant',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    source: 'local',
  };

  const mockDrshubAssistant: DrshubAssistant = {
    type: 'drshub',
    id: 'drshub-assistant-1',
    title: 'Test Drshub Assistant',
    description: 'A test assistant from Drshub',
    creator: {
      id: 'creator-1',
      full_name: 'Test Creator',
      provider: '',
      created_at: '',
      updated_at: '',
    },
    protection_level: 'public',
    price_cents: 0,
    allow_fork: true,
    review_count: 0,
    is_owned: false,
    categories: [],
    tags: [],
    creator_id: '',
    created_at: '',
    updated_at: '',
  };

  describe('isLocalAssistant', () => {
    it('should return true for local assistants', () => {
      expect(isLocalAssistant(mockLocalAssistant)).toBe(true);
    });

    it('should return false for Drshub assistants', () => {
      expect(isLocalAssistant(mockDrshubAssistant)).toBe(false);
    });
  });

  describe('isDrshubAssistant', () => {
    it('should return true for Drshub assistants', () => {
      expect(isDrshubAssistant(mockDrshubAssistant)).toBe(true);
    });

    it('should return false for local assistants', () => {
      expect(isDrshubAssistant(mockLocalAssistant)).toBe(false);
    });
  });

  describe('handleAssistantByType', () => {
    it('should call onLocalAssistant handler for local assistants', () => {
      const handlers = {
        onLocalAssistant: jest.fn(),
        onDrshubAssistant: jest.fn(),
      };

      handleAssistantByType(mockLocalAssistant, handlers);

      expect(handlers.onLocalAssistant).toHaveBeenCalledWith(mockLocalAssistant);
      expect(handlers.onDrshubAssistant).not.toHaveBeenCalled();
    });

    it('should call onDrshubAssistant handler for Drshub assistants', () => {
      const handlers = {
        onLocalAssistant: jest.fn(),
        onDrshubAssistant: jest.fn(),
      };

      handleAssistantByType(mockDrshubAssistant, handlers);

      expect(handlers.onDrshubAssistant).toHaveBeenCalledWith(mockDrshubAssistant);
      expect(handlers.onLocalAssistant).not.toHaveBeenCalled();
    });

    it('should log warning for unknown assistant types', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const handlers = {
        onLocalAssistant: jest.fn(),
        onDrshubAssistant: jest.fn(),
      };

      // Create a assistant with invalid type
      const invalidAssistant = {...mockLocalAssistant, type: 'invalid'} as any;

      handleAssistantByType(invalidAssistant, handlers);

      expect(consoleSpy).toHaveBeenCalledWith('Unknown assistant type:', invalidAssistant);
      expect(handlers.onLocalAssistant).not.toHaveBeenCalled();
      expect(handlers.onDrshubAssistant).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
