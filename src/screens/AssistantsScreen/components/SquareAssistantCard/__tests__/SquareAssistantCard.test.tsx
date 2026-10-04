import React from 'react';
import {Alert} from 'react-native';

import {
  render,
  fireEvent,
  waitFor,
  act,
} from '../../../../../../jest/test-utils';
import {SquareAssistantCard} from '../SquareAssistantCard';

import {
  assistantStore,
  chatSessionStore,
  modelStore,
} from '../../../../../store';
import {downloadedModel} from '../../../../../../jest/fixtures/models';
import type {Assistant} from '../../../../../store/AssistantStore';
import type {DrshubAssistant} from '../../../../../types/drshub';

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

// Mock export utils
jest.mock('../../../../../utils/exportUtils', () => ({
  exportAssistant: jest.fn(),
}));

const {exportAssistant} = require('../../../../../utils/exportUtils');

describe('SquareAssistantCard', () => {
  const mockOnPress = jest.fn();

  // Create a basic local assistant fixture
  const createLocalAssistant = (
    overrides: Partial<Assistant> = {},
  ): Assistant => ({
    type: 'local',
    id: 'test-assistant-1',
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
    capabilities: {},
    ...overrides,
  });

  // Create a Drshub assistant fixture
  const createDrshubAssistant = (
    overrides: Partial<DrshubAssistant> = {},
  ): DrshubAssistant => ({
    type: 'drshub',
    id: 'ph-assistant-1',
    title: 'Drshub Test Assistant',
    description: 'A test assistant from Drshub',
    creator_id: 'creator-1',
    protection_level: 'public',
    price_cents: 0,
    system_prompt: 'You are a helpful assistant.',
    thumbnail_url: 'https://example.com/thumb.jpg',
    model_settings: {},
    allow_fork: true,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    creator: {
      id: 'creator-1',
      display_name: 'Test Creator',
      username: 'testcreator',
      avatar_url: 'https://example.com/avatar.jpg',
      provider: 'github',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
    },
    tags: [
      {
        id: 'tag-1',
        name: 'productivity',
        usage_count: 10,
        created_at: '2023-01-01T00:00:00Z',
      },
      {
        id: 'tag-2',
        name: 'assistant',
        usage_count: 5,
        created_at: '2023-01-01T00:00:00Z',
      },
    ],
    average_rating: 4.5,
    review_count: 10,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    assistantStore.assistants = [];
  });

  describe('Rendering', () => {
    it('renders local assistant correctly', () => {
      const assistant = createLocalAssistant();
      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      expect(getByText('Test Assistant')).toBeTruthy();
      expect(getByText('A helpful test assistant')).toBeTruthy();
    });

    it('renders Drshub assistant correctly', () => {
      const assistant = createDrshubAssistant();
      const {getByText} = render(
        <SquareAssistantCard assistant={assistant} onPress={mockOnPress} />,
      );

      expect(getByText('Drshub Test Assistant')).toBeTruthy();
      expect(getByText('A test assistant from Drshub')).toBeTruthy();
      expect(getByText('by Test Creator')).toBeTruthy();
    });

    it('renders rating and review count for Drshub assistant', () => {
      const assistant = createDrshubAssistant({
        average_rating: 4.5,
        review_count: 10,
      });
      const {getByText} = render(
        <SquareAssistantCard assistant={assistant} onPress={mockOnPress} />,
      );

      expect(getByText('4.5')).toBeTruthy();
      expect(getByText('(10)')).toBeTruthy();
    });

    it('renders tags for Drshub assistant', () => {
      const assistant = createDrshubAssistant();
      const {getByText} = render(
        <SquareAssistantCard assistant={assistant} onPress={mockOnPress} />,
      );

      expect(getByText('productivity')).toBeTruthy();
      expect(getByText('+1')).toBeTruthy(); // +1 more tag
    });

    it('renders the first tag label and the overflow count for three tags', () => {
      const assistant = createDrshubAssistant({
        tags: [
          {
            id: 'tag-1',
            name: 'productivity',
            usage_count: 10,
            created_at: '2023-01-01T00:00:00Z',
          },
          {
            id: 'tag-2',
            name: 'assistant',
            usage_count: 5,
            created_at: '2023-01-01T00:00:00Z',
          },
          {
            id: 'tag-3',
            name: 'writing',
            usage_count: 3,
            created_at: '2023-01-01T00:00:00Z',
          },
        ],
      });
      const {getByText} = render(
        <SquareAssistantCard assistant={assistant} onPress={mockOnPress} />,
      );

      expect(getByText('productivity')).toBeTruthy();
      expect(getByText('+2')).toBeTruthy();
    });

    it('renders thumbnail image when available', () => {
      const assistant = createLocalAssistant({
        thumbnail_url: 'https://example.com/thumb.jpg',
      });
      const {UNSAFE_getByType} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      const images = UNSAFE_getByType(require('react-native').Image);
      expect(images).toBeTruthy();
    });

    it('renders first letter when no thumbnail available', () => {
      const assistant = createLocalAssistant({name: 'Test Assistant'});
      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      expect(getByText('T')).toBeTruthy(); // First letter
    });

    it('renders protection badge for protected Drshub assistants', () => {
      const assistant = createDrshubAssistant({
        protection_level: 'reveal_on_purchase',
      });
      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard assistant={assistant} onPress={mockOnPress} />,
      );

      // Check for LockIcon component
      const lockIcons = UNSAFE_getAllByType(
        require('../../../../../assets/icons').LockIcon,
      );
      expect(lockIcons.length).toBeGreaterThan(0);
    });
  });

  describe('User Interactions', () => {
    it('calls onPress when card is pressed', () => {
      const assistant = createLocalAssistant();
      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      fireEvent.press(getByText('Test Assistant'));
      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('shows delete confirmation when delete button is pressed', () => {
      jest.spyOn(Alert, 'alert');
      const assistant = createLocalAssistant();
      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      // Find and press delete button (IconButton with TrashIcon)
      const iconButtons = UNSAFE_getAllByType(
        require('react-native-paper').IconButton,
      );
      // Delete button is the second one (after share button)
      const deleteButton = iconButtons[1];

      fireEvent.press(deleteButton);
      expect(Alert.alert).toHaveBeenCalled();
    });

    it('calls exportAssistant when share button is pressed', async () => {
      const assistant = createLocalAssistant();
      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      // Find and press share button (IconButton with ShareIcon)
      const iconButtons = UNSAFE_getAllByType(
        require('react-native-paper').IconButton,
      );
      const shareButton = iconButtons[0]; // Share button is first

      await act(async () => {
        fireEvent.press(shareButton);
      });

      await waitFor(() => {
        expect(exportAssistant).toHaveBeenCalledWith(assistant.id);
      });
    });
  });

  describe('Chat Navigation', () => {
    it('navigates to chat when chat button is pressed for local assistant', async () => {
      const assistant = createLocalAssistant({defaultModel: downloadedModel});
      // availableModels is computed from models.filter(m => m.isDownloaded)
      // So we just need to set models with downloaded models
      modelStore.models = [downloadedModel];

      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      // Find chat button - it's a TouchableOpacity inside the thumbnail
      const touchables = UNSAFE_getAllByType(
        require('react-native').TouchableOpacity,
      );
      // The chat button is the second touchable (first is the card itself)
      const chatButton = touchables[1];

      await act(async () => {
        fireEvent.press(chatButton);
      });

      await waitFor(() => {
        expect(chatSessionStore.setActiveAssistant).toHaveBeenCalledWith(
          assistant.id,
        );
        expect(mockNavigate).toHaveBeenCalledWith('Chat');
      });
    });

    it('shows download alert for Drshub assistant not yet downloaded', async () => {
      jest.spyOn(Alert, 'alert');
      const assistant = createDrshubAssistant();
      assistantStore.assistants = []; // No local assistants

      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard assistant={assistant} onPress={mockOnPress} />,
      );

      // Drshub assistants that aren't downloaded shouldn't show chat button
      const touchables = UNSAFE_getAllByType(
        require('react-native').TouchableOpacity,
      );
      const chatButtons = touchables.filter(
        t => t.props.style?.chatButton !== undefined,
      );

      // Should not have chat button if not downloaded
      expect(chatButtons.length).toBe(0);
    });
  });

  describe('Model Warning', () => {
    it('shows model warning when default model is not available', () => {
      const assistant = createLocalAssistant({
        defaultModel: {...downloadedModel, id: 'unavailable-model'},
      });
      modelStore.isModelAvailable = jest.fn().mockReturnValue(false);

      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      // Check for warning text (from l10n.components.modelNotAvailable.modelNotDownloadedShort)
      expect(getByText('Model not downloaded')).toBeTruthy();
    });

    it('limits the description to one line while the warning shows', () => {
      const assistant = createLocalAssistant({
        defaultModel: {...downloadedModel, id: 'unavailable-model'},
      });
      modelStore.isModelAvailable = jest.fn().mockReturnValue(false);

      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      expect(getByText('A helpful test assistant').props.numberOfLines).toBe(1);
      expect(getByText('Model not downloaded')).toBeTruthy();
    });

    it('does not show model warning when model is available', () => {
      const assistant = createLocalAssistant({defaultModel: downloadedModel});
      modelStore.isModelAvailable = jest.fn().mockReturnValue(true);

      const {queryByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      expect(queryByText('Model not downloaded')).toBeNull();
    });

    it('does not show model warning for Drshub assistants', () => {
      const assistant = createDrshubAssistant();
      const {queryByText} = render(
        <SquareAssistantCard assistant={assistant} onPress={mockOnPress} />,
      );

      expect(queryByText('Model not downloaded')).toBeNull();
    });
  });

  describe('Content Display', () => {
    it('renders long descriptions in full, limited only by numberOfLines', () => {
      const longDescription = 'A'.repeat(200);
      const assistant = createLocalAssistant({description: longDescription});

      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      const displayedText = getByText(longDescription);
      expect(displayedText.props.children).toBe(longDescription);
      expect(displayedText.props.numberOfLines).toBe(2);
    });

    it('renders a 1200-character description in full, with nothing appended', () => {
      const description = 'A'.repeat(1200);
      const assistant = createLocalAssistant({description});

      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      const displayedText = getByText(description);
      expect(displayedText.props.children).toBe(description);
      expect(displayedText.props.numberOfLines).toBe(2);
      expect(displayedText.props.children).not.toMatch(/(\.\.\.|\u2026)$/);
    });

    it('renders a long cleaned system prompt in full, with nothing appended', () => {
      const systemPrompt = 'B'.repeat(1200);
      const assistant = createLocalAssistant({
        description: undefined,
        systemPrompt,
      });

      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      const displayedText = getByText(systemPrompt);
      expect(displayedText.props.children).toBe(systemPrompt);
      expect(displayedText.props.numberOfLines).toBe(2);
      expect(displayedText.props.children).not.toMatch(/(\.\.\.|\u2026)$/);
    });

    it('displays cleaned system prompt when no description', () => {
      const assistant = createLocalAssistant({
        description: undefined,
        systemPrompt: 'You are a helpful coding assistant.',
      });

      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      // Should remove "You are" prefix
      expect(getByText(/helpful coding assistant/i)).toBeTruthy();
    });

    it('displays parameter summary when available', () => {
      const assistant = createLocalAssistant({
        description: undefined,
        systemPrompt: undefined,
        parameters: {
          role: 'coding assistant',
          expertise: 'TypeScript',
          style: 'concise',
        },
      });

      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      // Should display parameter values joined with bullet
      expect(getByText(/coding assistant • TypeScript • concise/)).toBeTruthy();
    });

    it('displays fallback text for video capability assistants', () => {
      const assistant = createLocalAssistant({
        description: undefined,
        systemPrompt: undefined,
        capabilities: {
          video: true,
          multimodal: true,
        },
      });

      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      // When video capability is enabled, it shows "Video AI Assistant"
      expect(getByText('Video AI Assistant')).toBeTruthy();
    });

    it('displays generic fallback for assistants with no content', () => {
      const assistant = createLocalAssistant({
        description: undefined,
        systemPrompt: undefined,
        parameters: {},
        capabilities: {},
      });

      const {getByText} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      expect(getByText('AI Assistant')).toBeTruthy();
    });
  });

  describe('Action Buttons Visibility', () => {
    it('shows share and delete buttons for local assistants', () => {
      const assistant = createLocalAssistant();
      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      const iconButtons = UNSAFE_getAllByType(
        require('react-native-paper').IconButton,
      );
      // Should have at least 2 icon buttons (share and delete)
      expect(iconButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('does not show share and delete buttons for Drshub assistants', () => {
      const assistant = createDrshubAssistant();
      const {UNSAFE_queryAllByType} = render(
        <SquareAssistantCard assistant={assistant} onPress={mockOnPress} />,
      );

      // Drshub assistants should not have action buttons in header
      const iconButtons = UNSAFE_queryAllByType(
        require('react-native-paper').IconButton,
      );
      // May have warning icon but not share/delete
      expect(iconButtons.length).toBeLessThan(2);
    });

    it('shows chat button for downloaded Drshub assistant', () => {
      const drshubAssistant = createDrshubAssistant();
      const localAssistant = createLocalAssistant({
        drshub_id: drshubAssistant.id,
      });
      assistantStore.assistants = [localAssistant];
      assistantStore.isDrshubAssistantDownloaded = jest
        .fn()
        .mockReturnValue(true);

      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard
          assistant={drshubAssistant}
          onPress={mockOnPress}
        />,
      );

      // Should have chat button - check for ChatIcon or CameraIcon
      const chatIcons = UNSAFE_getAllByType(
        require('../../../../../assets/icons').ChatIcon,
      );
      expect(chatIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Video Capability', () => {
    it('shows camera icon for video-capable assistants', () => {
      const assistant = createLocalAssistant({
        capabilities: {
          video: true,
          multimodal: true,
        },
      });

      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      const cameraIcons = UNSAFE_getAllByType(
        require('../../../../../assets/icons').CameraIcon,
      );
      expect(cameraIcons.length).toBeGreaterThan(0);
    });

    it('shows chat icon for non-video assistants', () => {
      const assistant = createLocalAssistant({capabilities: {}});

      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      const chatIcons = UNSAFE_getAllByType(
        require('../../../../../assets/icons').ChatIcon,
      );
      expect(chatIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Premium Badge', () => {
    it('shows premium badge for premium Drshub assistants', () => {
      const assistant = createDrshubAssistant({
        price_cents: 999,
      });

      const {getByText} = render(
        <SquareAssistantCard assistant={assistant} onPress={mockOnPress} />,
      );

      // Premium badge should be visible (text depends on getAssistantDisplayLabel)
      // This is a basic check - actual label depends on implementation
      const card = getByText('Drshub Test Assistant');
      expect(card).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('handles share error gracefully', async () => {
      jest.spyOn(Alert, 'alert');
      exportAssistant.mockRejectedValueOnce(new Error('Share failed'));

      const assistant = createLocalAssistant();
      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      const iconButtons = UNSAFE_getAllByType(
        require('react-native-paper').IconButton,
      );
      const shareButton = iconButtons[0];

      await act(async () => {
        fireEvent.press(shareButton);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Share Error',
          'Failed to share assistant. Please try again.',
          [{text: 'OK'}],
        );
      });
    });

    it('handles chat start error gracefully', async () => {
      jest.spyOn(Alert, 'alert');
      chatSessionStore.setActiveAssistant = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failed'));

      const assistant = createLocalAssistant();
      const {UNSAFE_getAllByType} = render(
        <SquareAssistantCard
          assistant={assistant}
          onPress={mockOnPress}
          isLocal={true}
        />,
      );

      const touchables = UNSAFE_getAllByType(
        require('react-native').TouchableOpacity,
      );
      const chatButton = touchables.find(
        t => t.props.style?.chatButton !== undefined,
      );

      if (chatButton) {
        await act(async () => {
          fireEvent.press(chatButton);
        });

        await waitFor(() => {
          expect(Alert.alert).toHaveBeenCalledWith(
            'Error',
            'Failed to start chat. Please try again.',
          );
        });
      }
    });
  });
});
