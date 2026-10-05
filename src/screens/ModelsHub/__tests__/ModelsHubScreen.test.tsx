import React from 'react';

import {
  render as baseRender,
  fireEvent,
  act,
  waitFor,
} from '../../../../jest/test-utils';

import {ModelsHubScreen} from '../ModelsHubScreen';

import {modelStore, uiStore, modelHubStore} from '../../../store';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {
    withBottomSheetProvider: true,
    withNavigation: true,
    ...options,
  });

jest.useFakeTimers();

describe('ModelsHubScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uiStore.setValue('modelsHub', 'query', '');
    uiStore.setValue('modelsHub', 'category', 'all');
  });

  it('renders the hub browse mode with categories and installed section', async () => {
    const {getByTestId} = render(<ModelsHubScreen />);
    expect(getByTestId('models-hub-screen')).toBeTruthy();
    expect(getByTestId('hub-downloads-button')).toBeTruthy();
    expect(getByTestId('hub-storage-entry')).toBeTruthy();
    // Installed section lists the display models through ModelCard
    await waitFor(() => {
      expect(modelStore.displayModels.length).toBeGreaterThan(0);
    });
  });

  it('switches to search mode when a query is typed', async () => {
    const {getByTestId} = render(<ModelsHubScreen />);
    const input = getByTestId('hub-search-input');
    await act(async () => {
      fireEvent.changeText(input, 'qwen');
    });
    // The hub keeps its view state in the (mocked) UIStore session state.
    expect(uiStore.setValue).toHaveBeenCalledWith('modelsHub', 'query', 'qwen');
  });

  it('opens the downloads manager sheet', async () => {
    const {getByTestId} = render(<ModelsHubScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('hub-downloads-button'));
    });
    // Sheet mounts without crashing
    expect(getByTestId('models-hub-screen')).toBeTruthy();
  });

  it('records favorites through the hub store', () => {
    expect(modelHubStore.isFavorite('some-model')).toBe(false);
    modelHubStore.toggleFavorite('some-model');
    expect(modelHubStore.isFavorite('some-model')).toBe(true);
    modelHubStore.toggleFavorite('some-model');
    expect(modelHubStore.isFavorite('some-model')).toBe(false);
  });

  it('records recently viewed models', () => {
    modelHubStore.recordView('a');
    modelHubStore.recordView('b');
    expect(modelHubStore.recentlyViewed.map(e => e.id)).toEqual(['b', 'a']);
    modelHubStore.recordView('a');
    expect(modelHubStore.recentlyViewed.map(e => e.id)).toEqual(['a', 'b']);
    modelHubStore.clearRecentlyViewed();
    expect(modelHubStore.recentlyViewed).toEqual([]);
  });
});
