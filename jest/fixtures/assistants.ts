import type {Assistant} from '../../src/types/assistant';
import type {DrshubAssistant} from '../../src/types/drshub';
import {downloadedModel, basicModel} from './models';

// Basic local assistant
export const mockLocalAssistant: Assistant = {
  type: 'local',
  id: 'local-assistant-1',
  name: 'Test Assistant',
  description: 'A helpful test assistant',
  systemPrompt: 'You are a helpful assistant.',
  originalSystemPrompt: 'You are a helpful assistant.',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: [],
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local assistant with model
export const mockLocalAssistantWithModel: Assistant = {
  ...mockLocalAssistant,
  id: 'local-assistant-2',
  name: 'Test Assistant with Model',
  defaultModel: downloadedModel,
};

// Local assistant with parameters (roleplay)
export const mockRoleplayAssistant: Assistant = {
  type: 'local',
  id: 'roleplay-assistant-1',
  name: 'Fantasy Roleplay',
  description: 'A fantasy roleplay character',
  systemPrompt: 'You are a {{aiRole}} in {{world}} at {{location}}.',
  originalSystemPrompt: 'You are a {{aiRole}} in {{world}} at {{location}}.',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    world: 'Medieval Kingdom',
    location: 'Castle Throne Room',
    aiRole: 'Wise Wizard',
  },
  parameterSchema: [
    {
      key: 'world',
      type: 'text',
      label: 'World',
      required: true,
      placeholder: 'e.g., Medieval fantasy kingdom',
    },
    {
      key: 'location',
      type: 'text',
      label: 'Location',
      required: true,
      placeholder: 'e.g., Royal castle throne room',
    },
    {
      key: 'aiRole',
      type: 'text',
      label: 'AI Role',
      required: true,
      placeholder: 'e.g., Wise wizard advisor',
    },
  ],
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local assistant with video capability
export const mockVideoAssistant: Assistant = {
  type: 'local',
  id: 'video-assistant-1',
  name: 'Video Assistant',
  description: 'A video-enabled assistant',
  systemPrompt: 'You are a video assistant.',
  originalSystemPrompt: 'You are a video assistant.',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    captureInterval: '3000',
  },
  parameterSchema: [
    {
      key: 'captureInterval',
      type: 'text',
      label: 'Capture Interval (ms)',
      required: true,
      placeholder: '3000',
    },
  ],
  capabilities: {
    video: true,
    multimodal: true,
  },
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local assistant with AI-generated prompt
export const mockAIAssistant: Assistant = {
  type: 'local',
  id: 'ai-assistant-1',
  name: 'AI Generated Assistant',
  description: 'A assistant with AI-generated system prompt',
  systemPrompt: 'You are a helpful coding assistant.',
  originalSystemPrompt: 'You are a helpful coding assistant.',
  isSystemPromptChanged: false,
  useAIPrompt: true,
  generatingPrompt: 'Create a coding assistant',
  promptGenerationModel: basicModel,
  parameters: {},
  parameterSchema: [],
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local assistant with custom color
export const mockColoredAssistant: Assistant = {
  ...mockLocalAssistant,
  id: 'colored-assistant-1',
  name: 'Colored Assistant',
  color: ['#FF5733', '#C70039'],
};

// Local assistant with completion settings
export const mockAssistantWithSettings: Assistant = {
  ...mockLocalAssistant,
  id: 'assistant-with-settings-1',
  name: 'Assistant with Settings',
  completionSettings: {
    temperature: 0.8,
    top_p: 0.9,
    max_tokens: 2048,
  },
};

// Drshub assistant (free, public)
export const mockDrshubAssistant: DrshubAssistant = {
  type: 'drshub',
  id: 'drshub-assistant-1',
  title: 'Drshub Test Assistant',
  description: 'A test assistant from Drshub',
  creator_id: 'creator-1',
  protection_level: 'public',
  price_cents: 0,
  system_prompt: 'You are a helpful assistant from Drshub.',
  thumbnail_url: 'https://example.com/thumb.jpg',
  model_settings: {},
  allow_fork: true,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  creator: {
    id: 'creator-1',
    full_name: 'Test Creator',
    display_name: 'TestCreator',
    provider: 'google',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  },
  categories: [
    {
      id: 'cat-1',
      name: 'Productivity',
      sort_order: 1,
      created_at: '2023-01-01T00:00:00Z',
    },
  ],
  tags: [
    {
      id: 'tag-1',
      name: 'assistant',
      usage_count: 10,
      created_at: '2023-01-01T00:00:00Z',
    },
  ],
  average_rating: 4.5,
  review_count: 10,
  is_owned: false,
};

// Drshub assistant (premium, not owned)
export const mockPremiumDrshubAssistant: DrshubAssistant = {
  ...mockDrshubAssistant,
  id: 'drshub-assistant-2',
  title: 'Premium Drshub Assistant',
  protection_level: 'reveal_on_purchase',
  price_cents: 999,
  is_owned: false,
};

// Drshub assistant (premium, owned)
export const mockOwnedPremiumAssistant: DrshubAssistant = {
  ...mockPremiumDrshubAssistant,
  id: 'drshub-assistant-3',
  title: 'Owned Premium Assistant',
  is_owned: true,
};

// Drshub assistant (private)
export const mockPrivateDrshubAssistant: DrshubAssistant = {
  ...mockDrshubAssistant,
  id: 'drshub-assistant-4',
  title: 'Private Drshub Assistant',
  protection_level: 'private',
  is_owned: true,
};

// Partial assistant for creation
export const mockNewAssistantData: Partial<Assistant> = {
  type: 'local',
  name: '',
  description: '',
  systemPrompt: '',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: [],
  source: 'local',
};

// Factory function for creating custom assistants
export const createAssistant = (overrides: Partial<Assistant> = {}): Assistant => ({
  ...mockLocalAssistant,
  ...overrides,
});

// Factory function for creating custom Drshub assistants
export const createDrshubAssistant = (
  overrides: Partial<DrshubAssistant> = {},
): DrshubAssistant => ({
  ...mockDrshubAssistant,
  ...overrides,
});

export const assistantsList: Assistant[] = [
  mockLocalAssistant,
  mockLocalAssistantWithModel,
  mockRoleplayAssistant,
  mockVideoAssistant,
  mockAIAssistant,
  mockColoredAssistant,
  mockAssistantWithSettings,
];

export const drshubAssistantsList: DrshubAssistant[] = [
  mockDrshubAssistant,
  mockPremiumDrshubAssistant,
  mockOwnedPremiumAssistant,
  mockPrivateDrshubAssistant,
];
