import {deriveWidgetState, type WidgetLabels} from '../widgetBridge';

const labels: WidgetLabels = {
  idle: 'No active model',
  ready: 'Ready',
  loading: 'Loading model…',
  generating: 'Generating reply…',
  downloading: (p: number) => `Downloading ${p}%`,
  error: 'Error',
};

const baseInput = {
  hasActiveModel: false,
  activeModelName: '',
  activeModelId: '',
  loadingModelId: undefined,
  inferencing: false,
  downloads: [],
};

describe('deriveWidgetState', () => {
  it('shows idle when nothing is active', () => {
    expect(deriveWidgetState(baseInput, labels)).toEqual({
      modelName: '',
      statusText: 'No active model',
      statusKind: 'idle',
    });
  });

  it('shows the model name with a ready status when a model is loaded', () => {
    expect(
      deriveWidgetState(
        {
          ...baseInput,
          hasActiveModel: true,
          activeModelName: 'Qwen3 8B',
          activeModelId: 'qwen3',
        },
        labels,
      ),
    ).toEqual({
      modelName: 'Qwen3 8B',
      statusText: 'Ready',
      statusKind: 'ready',
    });
  });

  it('shows loading while a model is being initialised', () => {
    expect(
      deriveWidgetState({...baseInput, loadingModelId: 'qwen3'}, labels),
    ).toEqual({
      modelName: '',
      statusText: 'Loading model…',
      statusKind: 'loading',
    });
  });

  it('shows generating while a reply streams', () => {
    expect(
      deriveWidgetState(
        {
          ...baseInput,
          hasActiveModel: true,
          activeModelName: 'Qwen3 8B',
          inferencing: true,
        },
        labels,
      ),
    ).toEqual({
      modelName: 'Qwen3 8B',
      statusText: 'Generating reply…',
      statusKind: 'generating',
    });
  });

  it('shows download progress and takes precedence over everything else', () => {
    const input = {
      hasActiveModel: true,
      activeModelName: 'Qwen3 8B',
      activeModelId: 'qwen3',
      loadingModelId: 'qwen3',
      inferencing: true,
      downloads: [{modelId: 'gemma', progress: 42.4}],
    };
    expect(deriveWidgetState(input, labels)).toEqual({
      modelName: 'gemma',
      statusText: 'Downloading 42%',
      statusKind: 'downloading',
    });
  });

  it('prefers the active model name when the active model is the one downloading', () => {
    const input = {
      hasActiveModel: true,
      activeModelName: 'Qwen3 8B',
      activeModelId: 'qwen3',
      loadingModelId: undefined,
      inferencing: false,
      downloads: [{modelId: 'qwen3', progress: 7}],
    };
    const state = deriveWidgetState(input, labels);
    expect(state.modelName).toBe('Qwen3 8B');
    expect(state.statusKind).toBe('downloading');
  });
});
