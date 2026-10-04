import React from 'react';
import {act, fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {AssistantSheet} from '../AssistantSheet';
import {l10n} from '../../../locales';
import {L10nContext} from '../../../utils';
import type {Assistant} from '../../../types/assistant';
import {modelsList} from '../../../../jest/fixtures/models';
import type {ParameterDefinition} from '../../../types/assistant';

// Mock the Sheet component
jest.mock('../../Sheet/Sheet', () => {
  const {View, Button, ScrollView} = require('react-native');
  const MockSheet = ({children, isVisible, onClose, title}) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        <Button title="Close" onPress={onClose} testID="sheet-close-button" />
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children}) => (
    <ScrollView testID="sheet-scroll-view">{children}</ScrollView>
  );
  MockSheet.Actions = ({children}) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

// Mock AssistantGenerationSettingsSheet
jest.mock('../../AssistantGenerationSettingsSheet', () => ({
  AssistantGenerationSettingsSheet: ({isVisible, onClose}) => {
    const {View, Button} = require('react-native');
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="assistant-generation-settings-sheet">
        <Button
          title="Close Settings"
          onPress={onClose}
          testID="close-settings-button"
        />
      </View>
    );
  },
}));

// Mock useStructuredOutput hook
jest.mock('../../../hooks/useStructuredOutput', () => ({
  useStructuredOutput: jest.fn(() => ({
    generate: jest.fn(),
    isGenerating: false,
  })),
}));

// Import the mocked assistantStore (already mocked globally in jest/setup.ts)
import {assistantStore} from '../../../store';

import {
  talentRegistry,
  registerDefaultTalents,
  resetRegisteredFlag,
} from '../../../services/talents';

describe('AssistantSheet', () => {
  const mockOnClose = jest.fn();

  const createBasicAssistant = (
    overrides: Partial<Assistant> = {},
  ): Partial<Assistant> => ({
    name: '',
    description: '',
    systemPrompt: '',
    useAIPrompt: false,
    isSystemPromptChanged: false,
    parameters: {},
    parameterSchema: [],
    type: 'local',
    source: 'local',
    capabilities: {},
    ...overrides,
  });

  const createExistingAssistant = (
    overrides: Partial<Assistant> = {},
  ): Partial<Assistant> => ({
    id: 'test-assistant-id',
    name: 'Test Assistant',
    description: 'Test Description',
    systemPrompt: 'You are a helpful assistant',
    useAIPrompt: false,
    isSystemPromptChanged: false,
    defaultModel: modelsList[0],
    color: ['#FF5733', '#C70039'] as [string, string],
    parameters: {},
    parameterSchema: [],
    type: 'local',
    source: 'local',
    capabilities: {},
    ...overrides,
  });

  // Helper function to render AssistantSheet with required providers
  const renderAssistantSheet = (
    assistant: Partial<Assistant>,
    isVisible = true,
  ) => {
    return render(
      <L10nContext.Provider value={l10n.en}>
        <AssistantSheet
          isVisible={isVisible}
          onClose={mockOnClose}
          assistant={assistant}
        />
      </L10nContext.Provider>,
      {withNavigation: true, withBottomSheetProvider: true},
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders correctly when visible for new assistant', () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      expect(getByTestId('sheet')).toBeTruthy();
      // Title is rendered in the mocked Sheet component
      expect(getByTestId('sheet-title')).toBeTruthy();
    });

    it('does not render when not visible', () => {
      const {queryByTestId} = renderAssistantSheet(
        createBasicAssistant(),
        false,
      );

      expect(queryByTestId('sheet')).toBeNull();
    });

    it('renders with correct title for editing existing assistant', () => {
      const {getByTestId} = renderAssistantSheet(createExistingAssistant());

      expect(getByTestId('sheet-title')).toBeTruthy();
    });

    it('renders with correct title for new video assistant', () => {
      const {getByTestId} = renderAssistantSheet(
        createBasicAssistant({capabilities: {video: true}}),
      );

      expect(getByTestId('sheet-title')).toBeTruthy();
    });

    it('renders all basic form fields', () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      expect(getByTestId('form-field-name')).toBeTruthy();
      expect(getByTestId('form-field-description')).toBeTruthy();
    });

    it('renders model selector', () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      expect(getByTestId('assistant-default-model-selector')).toBeTruthy();
    });

    it('renders action buttons', () => {
      const {getByText} = renderAssistantSheet(createBasicAssistant());

      expect(getByText('Cancel')).toBeTruthy();
      expect(getByText('Create')).toBeTruthy();
    });

    it('shows Save button for editing existing assistant', () => {
      const {getByText} = renderAssistantSheet(createExistingAssistant());

      expect(getByText('Save')).toBeTruthy();
    });

    it('renders generation settings section only for existing assistants', () => {
      const {getByText} = renderAssistantSheet(createExistingAssistant());

      expect(getByText('Generation Settings')).toBeTruthy();
      expect(getByText('Configure Generation Settings')).toBeTruthy();
    });

    it('does not render generation settings for new assistants', () => {
      const {queryByText} = renderAssistantSheet(createBasicAssistant());

      expect(queryByText('Generation Settings')).toBeNull();
    });

    it('renders dynamic parameters section when schema is provided', () => {
      const parameterSchema: ParameterDefinition[] = [
        {
          key: 'world',
          type: 'text',
          label: 'World',
          required: true,
        },
      ];

      const {getByText} = renderAssistantSheet(
        createBasicAssistant({parameterSchema}),
      );

      expect(getByText('Parameters')).toBeTruthy();
    });

    it('does not render parameters section when schema is empty', () => {
      const {queryByText} = renderAssistantSheet(
        createBasicAssistant({parameterSchema: []}),
      );

      expect(queryByText('Parameters')).toBeNull();
    });
  });

  describe('Form Initialization', () => {
    it('initializes form with empty values for new assistant', () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      const nameInput = getByTestId('form-field-name');
      const descriptionInput = getByTestId('form-field-description');

      expect(nameInput.props.value).toBe('');
      expect(descriptionInput.props.value).toBe('');
    });

    it('initializes form with existing assistant data', () => {
      const {getByTestId} = renderAssistantSheet(createExistingAssistant());

      const nameInput = getByTestId('form-field-name');
      const descriptionInput = getByTestId('form-field-description');

      expect(nameInput.props.value).toBe('Test Assistant');
      expect(descriptionInput.props.value).toBe('Test Description');
    });

    it('initializes form with dynamic parameter values', () => {
      const parameterSchema: ParameterDefinition[] = [
        {
          key: 'world',
          type: 'text',
          label: 'World',
          required: true,
        },
      ];

      const {getByTestId} = renderAssistantSheet(
        createExistingAssistant({
          parameterSchema,
          parameters: {world: 'Fantasy Kingdom'},
        }),
      );

      const worldInput = getByTestId('dynamic-field-world');
      expect(worldInput.props.value).toBe('Fantasy Kingdom');
    });
  });

  describe('User Interactions', () => {
    it('calls onClose when Cancel button is pressed', () => {
      const {getByText} = renderAssistantSheet(createBasicAssistant());

      fireEvent.press(getByText('Cancel'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('updates form values when user types', () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'My New Assistant');

      expect(nameInput.props.value).toBe('My New Assistant');
    });

    it('opens generation settings sheet when button is pressed', () => {
      const {getByText, getByTestId} = renderAssistantSheet(
        createExistingAssistant(),
      );

      fireEvent.press(getByText('Configure Generation Settings'));
      expect(getByTestId('assistant-generation-settings-sheet')).toBeTruthy();
    });

    it('closes generation settings sheet when close button is pressed', () => {
      const {getByText, getByTestId, queryByTestId} = renderAssistantSheet(
        createExistingAssistant(),
      );

      // Open the settings sheet
      fireEvent.press(getByText('Configure Generation Settings'));
      expect(getByTestId('assistant-generation-settings-sheet')).toBeTruthy();

      // Close the settings sheet
      fireEvent.press(getByTestId('close-settings-button'));
      expect(queryByTestId('assistant-generation-settings-sheet')).toBeNull();
    });
  });

  describe('Form Validation', () => {
    it('shows validation error when name is empty', async () => {
      const {getByText} = renderAssistantSheet(createBasicAssistant());

      // Try to submit without entering a name
      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(getByText('Name is required')).toBeTruthy();
      });
    });

    it('does not show validation error when name is provided', async () => {
      const {getByText, getByTestId, queryByText} = renderAssistantSheet(
        createBasicAssistant(),
      );

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'My New Assistant');

      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(queryByText('Name is required')).toBeNull();
      });
    });
  });

  describe('Form Submission - Create New Assistant', () => {
    it('creates a new assistant with basic information', async () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      // Wait for form to be initialized
      await waitFor(() => {
        const nameInput = getByTestId('form-field-name');
        expect(nameInput.props.value).toBe('');
      });

      const nameInput = getByTestId('form-field-name');
      const descriptionInput = getByTestId('form-field-description');

      await act(async () => {
        fireEvent.changeText(nameInput, 'My New Assistant');
        fireEvent.changeText(descriptionInput, 'A helpful assistant');
      });

      // Wait for form state to update
      await waitFor(() => {
        expect(nameInput.props.value).toBe('My New Assistant');
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(assistantStore.createAssistant).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'My New Assistant',
            description: 'A helpful assistant',
          }),
        );
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('creates a new assistant with all fields filled', async () => {
      const {getByText, getByTestId} = renderAssistantSheet(
        createBasicAssistant(),
      );

      const nameInput = getByTestId('form-field-name');
      const descriptionInput = getByTestId('form-field-description');

      fireEvent.changeText(nameInput, 'Complete Assistant');
      fireEvent.changeText(
        descriptionInput,
        'A complete assistant with all fields',
      );

      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(assistantStore.createAssistant).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('creates a new assistant with dynamic parameters', async () => {
      const parameterSchema: ParameterDefinition[] = [
        {
          key: 'world',
          type: 'text',
          label: 'World',
          required: true,
        },
      ];

      const {getByText, getByTestId} = renderAssistantSheet(
        createBasicAssistant({parameterSchema}),
      );

      const nameInput = getByTestId('form-field-name');
      const worldInput = getByTestId('dynamic-field-world');

      fireEvent.changeText(nameInput, 'Story Assistant');
      fireEvent.changeText(worldInput, 'Fantasy Kingdom');

      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(assistantStore.createAssistant).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Story Assistant',
            parameters: {world: 'Fantasy Kingdom'},
          }),
        );
      });
    });
  });

  describe('Form Submission - Update Existing Assistant', () => {
    it('updates an existing assistant with modified data', async () => {
      const {getByText, getByTestId} = renderAssistantSheet(
        createExistingAssistant(),
      );

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Updated Assistant Name');

      fireEvent.press(getByText('Save'));

      await waitFor(() => {
        expect(assistantStore.updateAssistant).toHaveBeenCalledWith(
          'test-assistant-id',
          expect.objectContaining({
            name: 'Updated Assistant Name',
          }),
        );
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('preserves existing properties when updating', async () => {
      const {getByText, getByTestId} = renderAssistantSheet(
        createExistingAssistant(),
      );

      const descriptionInput = getByTestId('form-field-description');
      fireEvent.changeText(descriptionInput, 'Updated Description');

      fireEvent.press(getByText('Save'));

      await waitFor(() => {
        expect(assistantStore.updateAssistant).toHaveBeenCalledWith(
          'test-assistant-id',
          expect.objectContaining({
            name: 'Test Assistant',
            description: 'Updated Description',
          }),
        );
      });
    });

    it('updates dynamic parameters', async () => {
      const parameterSchema: ParameterDefinition[] = [
        {
          key: 'world',
          type: 'text',
          label: 'World',
          required: true,
        },
      ];

      const {getByText, getByTestId} = renderAssistantSheet(
        createExistingAssistant({
          parameterSchema,
          parameters: {world: 'Old World'},
        }),
      );

      const worldInput = getByTestId('dynamic-field-world');
      fireEvent.changeText(worldInput, 'New World');

      fireEvent.press(getByText('Save'));

      await waitFor(() => {
        expect(assistantStore.updateAssistant).toHaveBeenCalledWith(
          'test-assistant-id',
          expect.objectContaining({
            parameters: {world: 'New World'},
          }),
        );
      });
    });
  });

  describe('Loading and Saving States', () => {
    it('disables submit button while saving', async () => {
      // Mock createAssistant to return a promise that we can control
      let resolveCreate: (value: any) => void;
      const createPromise = new Promise(resolve => {
        resolveCreate = resolve;
      });
      (assistantStore.createAssistant as jest.Mock).mockReturnValue(
        createPromise,
      );

      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Test Assistant');

      const createButton = getByTestId('submit-button');
      fireEvent.press(createButton);

      // Button should be disabled while saving
      await waitFor(() => {
        expect(createButton.props.accessibilityState?.disabled).toBe(true);
      });

      // Resolve the promise
      resolveCreate!({id: 'new-assistant-id'});

      // Button should be enabled again after saving
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('handles failed save gracefully', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (assistantStore.createAssistant as jest.Mock).mockRejectedValue(
        new Error('Save failed'),
      );

      const {getByText, getByTestId} = renderAssistantSheet(
        createBasicAssistant(),
      );

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Test Assistant');

      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error saving assistant:',
          expect.any(Error),
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('logs error when update fails', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (assistantStore.updateAssistant as jest.Mock).mockRejectedValue(
        new Error('Update failed'),
      );

      const {getByText, getByTestId} = renderAssistantSheet(
        createExistingAssistant(),
      );

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Updated Name');

      fireEvent.press(getByText('Save'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error saving assistant:',
          expect.any(Error),
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Form Reset', () => {
    it('resets form when sheet is closed and reopened', () => {
      const {getByTestId, rerender} = renderAssistantSheet(
        createBasicAssistant(),
      );

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Temporary Name');

      expect(nameInput.props.value).toBe('Temporary Name');

      // Close the sheet
      rerender(
        <L10nContext.Provider value={l10n.en}>
          <AssistantSheet
            isVisible={false}
            onClose={mockOnClose}
            assistant={createBasicAssistant()}
          />
        </L10nContext.Provider>,
      );

      // Reopen the sheet
      rerender(
        <L10nContext.Provider value={l10n.en}>
          <AssistantSheet
            isVisible={true}
            onClose={mockOnClose}
            assistant={createBasicAssistant()}
          />
        </L10nContext.Provider>,
      );

      const newNameInput = getByTestId('form-field-name');
      expect(newNameInput.props.value).toBe('');
    });
  });

  describe('Different Assistant Types', () => {
    it('handles video assistant creation', async () => {
      const {getByText, getByTestId} = renderAssistantSheet(
        createBasicAssistant({capabilities: {video: true}}),
      );

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Video Assistant');

      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(assistantStore.createAssistant).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Video Assistant',
            capabilities: {video: true},
          }),
        );
      });
    });

    it('handles drshub assistant editing', async () => {
      const {getByText, getByTestId} = renderAssistantSheet(
        createExistingAssistant({
          source: 'drshub',
          drshub_id: 'drshub-123',
        }),
      );

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Updated Drshub Assistant');

      fireEvent.press(getByText('Save'));

      await waitFor(() => {
        expect(assistantStore.updateAssistant).toHaveBeenCalledWith(
          'test-assistant-id',
          expect.objectContaining({
            name: 'Updated Drshub Assistant',
            source: 'drshub',
          }),
        );
      });
    });
  });

  describe('Completion Settings', () => {
    it('includes completion settings when updating existing assistant', async () => {
      const completionSettings = {
        temperature: 0.8,
        top_p: 0.95,
        max_tokens: 1024,
      };

      const {getByText, getByTestId} = renderAssistantSheet(
        createExistingAssistant({completionSettings}),
      );

      // Wait for form to be initialized with the assistant's data
      await waitFor(() => {
        const nameInput = getByTestId('form-field-name');
        expect(nameInput.props.value).toBe('Test Assistant');
      });

      const nameInput = getByTestId('form-field-name');

      await act(async () => {
        fireEvent.changeText(nameInput, 'Updated Assistant');
      });

      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      await waitFor(() => {
        expect(assistantStore.updateAssistant).toHaveBeenCalledWith(
          'test-assistant-id',
          expect.objectContaining({
            completionSettings,
          }),
        );
      });
    });
  });

  describe('Talent Integration', () => {
    beforeEach(() => {
      // Ensure talents are registered for integration tests
      talentRegistry.reset();
      resetRegisteredFlag();
      registerDefaultTalents();
    });

    afterAll(() => {
      talentRegistry.reset();
      resetRegisteredFlag();
    });

    it('renders talent section in AssistantSheet', () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      expect(getByTestId('talent-section')).toBeTruthy();
    });

    it('creates a assistant with talents selected and correct pact', async () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      // Fill required name field
      const nameInput = getByTestId('form-field-name');
      await act(async () => {
        fireEvent.changeText(nameInput, 'Assistant With Talents');
      });

      // Toggle calculate and datetime talents on
      await act(async () => {
        fireEvent(getByTestId('talent-switch-calculate'), 'valueChange', true);
      });
      await act(async () => {
        fireEvent(getByTestId('talent-switch-datetime'), 'valueChange', true);
      });

      // Submit the form
      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(assistantStore.createAssistant).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Assistant With Talents',
            pact: {
              talents: expect.arrayContaining([
                {name: 'calculate', necessity: 'required'},
                {name: 'datetime', necessity: 'required'},
              ]),
            },
          }),
        );
      });
    });

    it('edits a assistant with existing pact.talents and pre-selects switches', () => {
      const {getByTestId} = renderAssistantSheet(
        createExistingAssistant({
          pact: {
            talents: [
              {name: 'render_html', necessity: 'required'},
              {name: 'calculate', necessity: 'required'},
            ],
          },
        }),
      );

      // render_html and calculate should be on
      expect(getByTestId('talent-switch-render_html').props.value).toBe(true);
      expect(getByTestId('talent-switch-calculate').props.value).toBe(true);

      // datetime should be off
      expect(getByTestId('talent-switch-datetime').props.value).toBe(false);
    });

    it('removing all talents results in pact with empty talents array', async () => {
      const {getByTestId, getByText} = renderAssistantSheet(
        createExistingAssistant({
          pact: {
            talents: [{name: 'calculate', necessity: 'required'}],
          },
        }),
      );

      // Verify calculate is initially on
      expect(getByTestId('talent-switch-calculate').props.value).toBe(true);

      // Toggle calculate off
      await act(async () => {
        fireEvent(getByTestId('talent-switch-calculate'), 'valueChange', false);
      });

      // Submit the form
      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      await waitFor(() => {
        expect(assistantStore.updateAssistant).toHaveBeenCalledWith(
          'test-assistant-id',
          expect.objectContaining({
            pact: {talents: []},
          }),
        );
      });
    });

    it('creates a assistant with no talents selected and pact has empty talents', async () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      const nameInput = getByTestId('form-field-name');
      await act(async () => {
        fireEvent.changeText(nameInput, 'No Talents Assistant');
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(assistantStore.createAssistant).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'No Talents Assistant',
            pact: {talents: []},
          }),
        );
      });
    });
  });

  describe('Greeting save predicate', () => {
    it('creates a assistant with greeting text and two suggested prompts', async () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      const nameInput = getByTestId('form-field-name');
      await act(async () => {
        fireEvent.changeText(nameInput, 'Friendly Greeter');
      });

      const greetingInput = getByTestId('form-field-greetingText');
      await act(async () => {
        fireEvent.changeText(greetingInput, 'Hi! What can I help with today?');
      });

      // Add two prompt rows and fill each.
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(
          getByTestId('suggested-prompt-input-0'),
          'Summarize a webpage',
        );
      });
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(
          getByTestId('suggested-prompt-input-1'),
          'Brainstorm a name',
        );
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(assistantStore.createAssistant).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Friendly Greeter',
            greeting: {
              text: 'Hi! What can I help with today?',
              suggestedPrompts: ['Summarize a webpage', 'Brainstorm a name'],
            },
          }),
        );
      });
    });

    it('clears greeting on save by writing the empty-object sentinel', async () => {
      const {getByTestId, getByText} = renderAssistantSheet(
        createExistingAssistant({
          greeting: {
            text: 'Old greeting',
            suggestedPrompts: ['Old prompt'],
          },
        }),
      );

      // Form seeds with existing values.
      await waitFor(() => {
        expect(getByTestId('form-field-greetingText').props.value).toBe(
          'Old greeting',
        );
        expect(getByTestId('suggested-prompt-input-0').props.value).toBe(
          'Old prompt',
        );
      });

      // Clear the greeting text.
      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-greetingText'), '');
      });

      // Remove the only prompt row.
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-remove-0'));
      });

      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      await waitFor(() => {
        expect(assistantStore.updateAssistant).toHaveBeenCalledWith(
          'test-assistant-id',
          expect.objectContaining({
            greeting: {text: '', suggestedPrompts: []},
          }),
        );
      });
    });

    it('emits greeting with raw whitespace text when prompts are present', async () => {
      // Whitespace-only text has length > 0, so the predicate is true and the
      // text is saved verbatim (no trim) — mirror of the Drshub wire-side
      // predicate.
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      await act(async () => {
        fireEvent.changeText(
          getByTestId('form-field-name'),
          'Whitespace Assistant',
        );
      });

      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-greetingText'), '   ');
      });

      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(
          getByTestId('suggested-prompt-input-0'),
          'Tell me a joke',
        );
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(assistantStore.createAssistant).toHaveBeenCalledWith(
          expect.objectContaining({
            greeting: {
              text: '   ',
              suggestedPrompts: ['Tell me a joke'],
            },
          }),
        );
      });
    });

    it('emits greeting with empty text when only prompts are filled', async () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-name'), 'Prompts Only');
      });

      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(getByTestId('suggested-prompt-input-0'), 'Hello');
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(assistantStore.createAssistant).toHaveBeenCalledWith(
          expect.objectContaining({
            greeting: {
              text: '',
              suggestedPrompts: ['Hello'],
            },
          }),
        );
      });
    });

    it('writes the sentinel when editing a greetingless assistant and leaving fields blank', async () => {
      // No-op symmetry case: a assistant with no greeting today, no greeting edits
      // made, still saves with the sentinel. Observable behaviour: nothing.
      const {getByTestId, getByText} = renderAssistantSheet(
        createExistingAssistant(),
      );

      await act(async () => {
        fireEvent.changeText(
          getByTestId('form-field-description'),
          'Updated description only',
        );
      });

      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      await waitFor(() => {
        expect(assistantStore.updateAssistant).toHaveBeenCalledWith(
          'test-assistant-id',
          expect.objectContaining({
            description: 'Updated description only',
            greeting: {text: '', suggestedPrompts: []},
          }),
        );
      });
    });

    it('seeds editor fields from an existing assistant greeting on open', () => {
      const {getByTestId} = renderAssistantSheet(
        createExistingAssistant({
          greeting: {
            text: 'Hello',
            suggestedPrompts: ['x', 'y'],
          },
        }),
      );

      expect(getByTestId('form-field-greetingText').props.value).toBe('Hello');
      expect(getByTestId('suggested-prompt-input-0').props.value).toBe('x');
      expect(getByTestId('suggested-prompt-input-1').props.value).toBe('y');
    });

    it('trims each prompt and drops empty rows before saving', async () => {
      const {getByTestId} = renderAssistantSheet(createBasicAssistant());

      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-name'), 'Trim Assistant');
      });

      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-greetingText'), 'Hi');
      });

      // Row 0: '  a  ' (whitespace around content — should be trimmed to 'a')
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(getByTestId('suggested-prompt-input-0'), '  a  ');
      });

      // Row 1: '' (empty — should be dropped)
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });

      // Row 2: '   ' (whitespace-only — should be dropped)
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(getByTestId('suggested-prompt-input-2'), '   ');
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(assistantStore.createAssistant).toHaveBeenCalledWith(
          expect.objectContaining({
            greeting: {
              text: 'Hi',
              suggestedPrompts: ['a'],
            },
          }),
        );
      });
    });
  });
});
