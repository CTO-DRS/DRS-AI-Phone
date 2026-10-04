import React from 'react';
import {Alert} from 'react-native';

import {runInAction} from 'mobx';

import {
  render as baseRender,
  fireEvent,
  waitFor,
} from '../../../../jest/test-utils';

import {VideoAssistantScreen} from '../VideoAssistantScreen';
import {assistantStore, chatSessionStore, modelStore} from '../../../store';
import type {Assistant} from '../../../types/assistant';
import {LlamaContext} from 'llama.rn';
import {ModelOrigin} from '../../../utils/types';
import {mockLlamaContextParams} from '../../../../jest/fixtures/models';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {
    withNavigation: true,
    withSafeArea: true,
    withBottomSheetProvider: true,
    ...options,
  });

function makeVideoAssistant(overrides: Partial<Assistant> = {}): Assistant {
  return {
    type: 'local',
    id: 'assistant-video-1',
    name: 'Video Assistant',
    description: 'Test video assistant',
    systemPrompt: '',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameterSchema: [],
    parameters: {captureInterval: 1500},
    source: 'local',
    capabilities: {video: true, multimodal: true},
    ...overrides,
  } as Assistant;
}

describe('VideoAssistantScreen', () => {
  let originalActiveAssistantId: PropertyDescriptor | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset assistants
    (assistantStore as any).assistants = [];
    // Save and reset activeAssistantId getter
    originalActiveAssistantId = Object.getOwnPropertyDescriptor(
      chatSessionStore,
      'activeAssistantId',
    );
  });

  afterEach(() => {
    runInAction(() => {
      modelStore.isMultimodalActive = false;
      modelStore.activeModelId = undefined;
      modelStore.models = [];
    });
    // Restore original activeAssistantId getter if it existed
    if (originalActiveAssistantId) {
      Object.defineProperty(
        chatSessionStore,
        'activeAssistantId',
        originalActiveAssistantId,
      );
    }
  });

  it('renders chat view with start-video button and default prompt for a video assistant', () => {
    const videoAssistant = makeVideoAssistant();
    (assistantStore as any).assistants.push(videoAssistant);
    Object.defineProperty(chatSessionStore, 'activeAssistantId', {
      get: jest.fn(() => videoAssistant.id),
      configurable: true,
    });

    const {getByLabelText, getByDisplayValue} = render(
      <VideoAssistantScreen activeAssistant={videoAssistant} />,
    );

    // Start-video button should be visible (compact button in ChatInput)
    expect(getByLabelText('Start video analysis')).toBeTruthy();

    // Prompt text is controlled by VideoAssistantScreen and shown in the input
    expect(getByDisplayValue('What do you see?')).toBeTruthy();
  });

  it('shows an alert when model is not loaded and start is pressed', async () => {
    const videoAssistant = makeVideoAssistant();
    (assistantStore as any).assistants.push(videoAssistant);
    Object.defineProperty(chatSessionStore, 'activeAssistantId', {
      get: jest.fn(() => videoAssistant.id),
      configurable: true,
    });

    const alertSpy = jest.spyOn(Alert, 'alert');

    const {getByLabelText} = render(
      <VideoAssistantScreen activeAssistant={videoAssistant} />,
    );

    fireEvent.press(getByLabelText('Start video analysis'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    // Title should be localized "Model not loaded" string
    const call = (alertSpy.mock.calls[0] || []) as any[];
    expect(call[0]).toContain('Model not loaded');
  });

  it('alerts when multimodal is not enabled even if a model is loaded', async () => {
    const videoAssistant = makeVideoAssistant();
    (assistantStore as any).assistants.push(videoAssistant);
    Object.defineProperty(chatSessionStore, 'activeAssistantId', {
      get: jest.fn(() => videoAssistant.id),
      configurable: true,
    });

    // Provide a context so we pass the first guard
    modelStore.context = new LlamaContext(mockLlamaContextParams);

    // Multimodal is not active on the loaded model
    runInAction(() => {
      modelStore.isMultimodalActive = false;
    });

    const alertSpy = jest.spyOn(Alert, 'alert');

    const {getByLabelText} = render(
      <VideoAssistantScreen activeAssistant={videoAssistant} />,
    );

    fireEvent.press(getByLabelText('Start video analysis'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    // Check the call arguments
    const callArgs = alertSpy.mock.calls[0];
    expect(callArgs[0]).toBe('Multimodal Not Enabled');
    expect(callArgs[1]).toBe(
      'This model does not support image analysis. Please load a multimodal model.',
    );
    expect(callArgs[2]).toEqual(expect.any(Array));
  });

  it('starts camera when multimodal is enabled, allows interval change, and closes back to chat', async () => {
    const videoAssistant = makeVideoAssistant();
    (assistantStore as any).assistants.push(videoAssistant);
    Object.defineProperty(chatSessionStore, 'activeAssistantId', {
      get: jest.fn(() => videoAssistant.id),
      configurable: true,
    });

    // Provide a loaded context
    modelStore.context = new LlamaContext(mockLlamaContextParams);

    // Allow multimodal
    runInAction(() => {
      modelStore.models = [
        {id: 'model-1', origin: ModelOrigin.PRESET, supportsMultimodal: true},
      ] as any;
      modelStore.activeModelId = 'model-1';
      modelStore.isMultimodalActive = true;
    });

    const {getByLabelText, getByTestId, queryByTestId} = render(
      <VideoAssistantScreen activeAssistant={videoAssistant} />,
    );

    // Start camera
    fireEvent.press(getByLabelText('Start video analysis'));

    // EmbeddedVideoView visible (close button present)
    await waitFor(() => expect(getByTestId('close-button')).toBeTruthy());

    // Increase interval -> assistantStore.updateAssistant called with new interval
    fireEvent.press(getByTestId('increase-interval-button'));
    await waitFor(() => {
      expect(assistantStore.updateAssistant).toHaveBeenCalledWith(
        videoAssistant.id,
        expect.objectContaining({
          parameters: expect.objectContaining({captureInterval: 2000}),
        }),
      );
    });

    // Close camera
    fireEvent.press(getByTestId('close-button'));

    await waitFor(() => {
      expect(queryByTestId('close-button')).toBeNull();
      expect(getByLabelText('Start video analysis')).toBeTruthy();
    });
  });
});
