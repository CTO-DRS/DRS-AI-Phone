import {isLocalPal, isDrshubPal, handlePalByType} from '../pal-type-guards';
import type {Pal} from '../../types/pal';
import type {DrshubPal} from '../../types/drshub';

describe('pal-type-guards', () => {
  const mockLocalPal: Pal = {
    type: 'local',
    id: 'local-pal-1',
    name: 'Test Local Pal',
    systemPrompt: 'You are a helpful assistant',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    source: 'local',
  };

  const mockDrshubPal: DrshubPal = {
    type: 'drshub',
    id: 'drshub-pal-1',
    title: 'Test Drshub Pal',
    description: 'A test pal from Drshub',
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

  describe('isLocalPal', () => {
    it('should return true for local pals', () => {
      expect(isLocalPal(mockLocalPal)).toBe(true);
    });

    it('should return false for Drshub pals', () => {
      expect(isLocalPal(mockDrshubPal)).toBe(false);
    });
  });

  describe('isDrshubPal', () => {
    it('should return true for Drshub pals', () => {
      expect(isDrshubPal(mockDrshubPal)).toBe(true);
    });

    it('should return false for local pals', () => {
      expect(isDrshubPal(mockLocalPal)).toBe(false);
    });
  });

  describe('handlePalByType', () => {
    it('should call onLocalPal handler for local pals', () => {
      const handlers = {
        onLocalPal: jest.fn(),
        onDrshubPal: jest.fn(),
      };

      handlePalByType(mockLocalPal, handlers);

      expect(handlers.onLocalPal).toHaveBeenCalledWith(mockLocalPal);
      expect(handlers.onDrshubPal).not.toHaveBeenCalled();
    });

    it('should call onDrshubPal handler for Drshub pals', () => {
      const handlers = {
        onLocalPal: jest.fn(),
        onDrshubPal: jest.fn(),
      };

      handlePalByType(mockDrshubPal, handlers);

      expect(handlers.onDrshubPal).toHaveBeenCalledWith(mockDrshubPal);
      expect(handlers.onLocalPal).not.toHaveBeenCalled();
    });

    it('should log warning for unknown pal types', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const handlers = {
        onLocalPal: jest.fn(),
        onDrshubPal: jest.fn(),
      };

      // Create a pal with invalid type
      const invalidPal = {...mockLocalPal, type: 'invalid'} as any;

      handlePalByType(invalidPal, handlers);

      expect(consoleSpy).toHaveBeenCalledWith('Unknown pal type:', invalidPal);
      expect(handlers.onLocalPal).not.toHaveBeenCalled();
      expect(handlers.onDrshubPal).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
