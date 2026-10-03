import {
  hasVideoCapability,
  hasMultimodalCapability,
  hasRealtimeCapability,
  hasAudioCapability,
  hasWebCapability,
  hasCodeCapability,
  hasMemoryCapability,
  hasToolsCapability,
  getActiveCapabilities,
  hasAnyCapabilities,
  createCapabilitiesFromLegacyType,
} from '../assistant-capabilities';
import type {Assistant} from '../../types/assistant';

describe('assistant-capabilities', () => {
  const createMockAssistant = (capabilities = {}): Assistant => ({
    type: 'local',
    id: 'test-assistant',
    name: 'Test Assistant',
    systemPrompt: 'Test prompt',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    capabilities,
    source: 'local',
  });

  describe('capability check functions', () => {
    it('should detect video capability', () => {
      const assistantWithVideo = createMockAssistant({video: true});
      const assistantWithoutVideo = createMockAssistant({video: false});
      const assistantNoCapabilities = createMockAssistant();

      expect(hasVideoCapability(assistantWithVideo)).toBe(true);
      expect(hasVideoCapability(assistantWithoutVideo)).toBe(false);
      expect(hasVideoCapability(assistantNoCapabilities)).toBe(false);
    });

    it('should detect multimodal capability', () => {
      const assistantWithMultimodal = createMockAssistant({multimodal: true});
      const assistantWithoutMultimodal = createMockAssistant({multimodal: false});

      expect(hasMultimodalCapability(assistantWithMultimodal)).toBe(true);
      expect(hasMultimodalCapability(assistantWithoutMultimodal)).toBe(false);
    });

    it('should detect realtime capability', () => {
      const assistantWithRealtime = createMockAssistant({realtime: true});
      const assistantWithoutRealtime = createMockAssistant({realtime: false});

      expect(hasRealtimeCapability(assistantWithRealtime)).toBe(true);
      expect(hasRealtimeCapability(assistantWithoutRealtime)).toBe(false);
    });

    it('should detect audio capability', () => {
      const assistantWithAudio = createMockAssistant({audio: true});
      const assistantWithoutAudio = createMockAssistant({audio: false});

      expect(hasAudioCapability(assistantWithAudio)).toBe(true);
      expect(hasAudioCapability(assistantWithoutAudio)).toBe(false);
    });

    it('should detect web capability', () => {
      const assistantWithWeb = createMockAssistant({web: true});
      const assistantWithoutWeb = createMockAssistant({web: false});

      expect(hasWebCapability(assistantWithWeb)).toBe(true);
      expect(hasWebCapability(assistantWithoutWeb)).toBe(false);
    });

    it('should detect code capability', () => {
      const assistantWithCode = createMockAssistant({code: true});
      const assistantWithoutCode = createMockAssistant({code: false});

      expect(hasCodeCapability(assistantWithCode)).toBe(true);
      expect(hasCodeCapability(assistantWithoutCode)).toBe(false);
    });

    it('should detect memory capability', () => {
      const assistantWithMemory = createMockAssistant({memory: true});
      const assistantWithoutMemory = createMockAssistant({memory: false});

      expect(hasMemoryCapability(assistantWithMemory)).toBe(true);
      expect(hasMemoryCapability(assistantWithoutMemory)).toBe(false);
    });

    it('should detect tools capability', () => {
      const assistantWithTools = createMockAssistant({tools: true});
      const assistantWithoutTools = createMockAssistant({tools: false});

      expect(hasToolsCapability(assistantWithTools)).toBe(true);
      expect(hasToolsCapability(assistantWithoutTools)).toBe(false);
    });
  });

  describe('getActiveCapabilities', () => {
    it('should return all active capabilities', () => {
      const assistant = createMockAssistant({
        video: true,
        multimodal: true,
        code: true,
        web: false,
      });

      const active = getActiveCapabilities(assistant);

      expect(active).toContain('video');
      expect(active).toContain('multimodal');
      expect(active).toContain('code');
      expect(active).not.toContain('web');
      expect(active.length).toBe(3);
    });

    it('should return empty array when no capabilities', () => {
      const assistant = createMockAssistant();

      expect(getActiveCapabilities(assistant)).toEqual([]);
    });

    it('should return empty array when all capabilities are false', () => {
      const assistant = createMockAssistant({
        video: false,
        multimodal: false,
        code: false,
      });

      expect(getActiveCapabilities(assistant)).toEqual([]);
    });
  });

  describe('hasAnyCapabilities', () => {
    it('should return true when assistant has at least one capability', () => {
      const assistant = createMockAssistant({video: true});

      expect(hasAnyCapabilities(assistant)).toBe(true);
    });

    it('should return false when assistant has no capabilities', () => {
      const assistant = createMockAssistant();

      expect(hasAnyCapabilities(assistant)).toBe(false);
    });

    it('should return false when all capabilities are false', () => {
      const assistant = createMockAssistant({
        video: false,
        multimodal: false,
      });

      expect(hasAnyCapabilities(assistant)).toBe(false);
    });
  });

  describe('createCapabilitiesFromLegacyType', () => {
    it('should create video capabilities for video type', () => {
      const capabilities = createCapabilitiesFromLegacyType('video');

      expect(capabilities).toEqual({
        video: true,
        multimodal: true,
      });
    });

    it('should create empty capabilities for assistant type', () => {
      const capabilities = createCapabilitiesFromLegacyType('assistant');

      expect(capabilities).toEqual({});
    });

    it('should create empty capabilities for roleplay type', () => {
      const capabilities = createCapabilitiesFromLegacyType('roleplay');

      expect(capabilities).toEqual({});
    });
  });
});
