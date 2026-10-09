import React from 'react';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {modelStore, assistantStore, chatSessionStore} from '../../../store';

import {ChatEmptyPlaceholder} from '../ChatEmptyPlaceholder';

// The shared chatSessionStore mock exposes `activeAssistantId` as a
// getter-only defineProperty — redefine it per-test (configurable: true).
const originalActiveAssistantId = Object.getOwnPropertyDescriptor(
  chatSessionStore,
  'activeAssistantId',
);

const setActiveAssistantId = (value: string | null) => {
  Object.defineProperty(chatSessionStore, 'activeAssistantId', {
    get: () => value,
    configurable: true,
  });
};

const renderPlaceholder = (props?: {
  bottomComponentHeight?: number;
  onSelectModel?: () => void;
}) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <ChatEmptyPlaceholder
        onSelectModel={props?.onSelectModel ?? jest.fn()}
        bottomComponentHeight={props?.bottomComponentHeight ?? 0}
      />
    </L10nContext.Provider>,
    {withNavigation: true},
  );

describe('ChatEmptyPlaceholder', () => {
  afterEach(() => {
    modelStore.activeModelId = undefined;
    modelStore.isContextLoading = false;
    assistantStore.assistants = [];
    if (originalActiveAssistantId) {
      Object.defineProperty(
        chatSessionStore,
        'activeAssistantId',
        originalActiveAssistantId,
      );
    }
    jest.clearAllMocks();
  });

  it('shows the activate-model state when no model is active', () => {
    const {getByText} = renderPlaceholder();
    expect(
      getByText(l10n.en.components.chatEmptyPlaceholder.activateModelTitle),
    ).toBeDefined();
    expect(
      getByText(l10n.en.components.chatEmptyPlaceholder.activateModelButton),
    ).toBeDefined();
  });

  it('shows the ready state with the assistant name once a model is active', () => {
    modelStore.activeModelId = 'model-1';
    setActiveAssistantId('assistant-pip');
    assistantStore.assistants = [{id: 'assistant-pip', name: 'Pip'} as any];

    const {getByText, queryByText} = renderPlaceholder();
    expect(
      getByText(
        l10n.en.components.chatEmptyPlaceholder.readyTitle.replace(
          '{{name}}',
          'Pip',
        ),
      ),
    ).toBeDefined();
    expect(
      getByText(l10n.en.components.chatEmptyPlaceholder.readyDescription),
    ).toBeDefined();
    // No activation CTA once the model is running.
    expect(
      queryByText(l10n.en.components.chatEmptyPlaceholder.activateModelButton),
    ).toBeNull();
  });

  it('falls back to the app name when the active assistant is missing', () => {
    modelStore.activeModelId = 'model-1';
    setActiveAssistantId('assistant-unknown');

    const {getByText} = renderPlaceholder();
    expect(
      getByText(
        l10n.en.components.chatEmptyPlaceholder.readyTitle.replace(
          '{{name}}',
          'DRS AI',
        ),
      ),
    ).toBeDefined();
  });

  it('fires the model picker from the activate CTA in the no-model state', () => {
    const onSelectModel = jest.fn();
    const {getByText} = renderPlaceholder({onSelectModel});
    fireEvent.press(
      getByText(l10n.en.components.chatEmptyPlaceholder.activateModelButton),
    );
    expect(onSelectModel).toHaveBeenCalledTimes(1);
  });
});
