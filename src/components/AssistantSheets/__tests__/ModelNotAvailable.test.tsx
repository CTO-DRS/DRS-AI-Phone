import React from 'react';
import {render, fireEvent} from '../../../../jest/test-utils';
import {ModelNotAvailable} from '../ModelNotAvailable';
import {
  modelsList,
  hfModel1,
  basicModel,
  downloadingModel,
} from '../../../../jest/fixtures/models';
import {catalogStore} from '../../../store/model/catalogStore';
import {downloadStore} from '../../../store/model/downloadStore';

jest.mock('../../../store/model/catalogStore', () => {
  const state: {models: Array<{id?: string; isDownloaded?: boolean}>} = {
    models: [],
  };
  const catalogBase = {
    get models() {
      return state.models;
    },
    set models(v: Array<{id?: string; isDownloaded?: boolean}>) {
      state.models = v;
    },
    get availableModels() {
      return state.models.filter(m => m.isDownloaded);
    },
    isModelAvailable(modelId: string) {
      return state.models
        .filter(m => m.isDownloaded)
        .some(m => m.id === modelId);
    },
  };
  return {catalogStore: catalogBase};
});

jest.mock('../../../store/model/downloadStore', () => {
  const real = jest.requireActual('../../../store/model/downloadStore');
  return {
    downloadStore: Object.assign(Object.create(real.downloadStore), {
      cancelDownload: jest.fn(),
      checkSpaceAndDownload: jest.fn(),
      downloadHFModel: jest.fn(),
    }),
  };
});

describe('ModelNotAvailable', () => {
  const mockCloseSheet = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    catalogStore.models = modelsList;
  });

  it('should show message when no models are downloaded', () => {
    catalogStore.models = [];
    const {getByText} = render(
      <ModelNotAvailable
        model={undefined}
        currentlySelectedModel={undefined}
        closeSheet={mockCloseSheet}
      />,
      {withNavigation: true},
    );

    expect(
      getByText(
        'You do not have any models downloaded yet. Please download a model first.',
      ),
    ).toBeTruthy();
    expect(getByText('Download a model')).toBeTruthy();
  });

  it('should show download button when specific model is not downloaded', () => {
    const {getByText} = render(
      <ModelNotAvailable
        model={basicModel}
        currentlySelectedModel={undefined}
        closeSheet={mockCloseSheet}
      />,
      {withNavigation: true},
    );

    expect(
      getByText(
        'This assistant recommends a specific model that needs to be downloaded, or you can select a different model.',
      ),
    ).toBeTruthy();
    expect(getByText('Download')).toBeTruthy();
  });

  it('should show progress bar when model is being downloaded', () => {
    const {getByTestId, getByText} = render(
      <ModelNotAvailable
        model={downloadingModel}
        currentlySelectedModel={undefined}
        closeSheet={mockCloseSheet}
      />,
      {withNavigation: true},
    );

    expect(getByTestId('download-progress-bar')).toBeTruthy();
    expect(getByText('Cancel download')).toBeTruthy();
  });

  it('should call cancelDownload when cancel button is pressed', () => {
    const {getByText} = render(
      <ModelNotAvailable
        model={downloadingModel}
        currentlySelectedModel={undefined}
        closeSheet={mockCloseSheet}
      />,
      {withNavigation: true},
    );

    fireEvent.press(getByText('Cancel download'));
    expect(downloadStore.cancelDownload).toHaveBeenCalledWith(
      downloadingModel.id,
    );
  });

  it('should call checkSpaceAndDownload when download button is pressed', () => {
    const {getByText} = render(
      <ModelNotAvailable
        model={basicModel}
        currentlySelectedModel={undefined}
        closeSheet={mockCloseSheet}
      />,
      {withNavigation: true},
    );

    fireEvent.press(getByText('Download'));
    expect(downloadStore.checkSpaceAndDownload).toHaveBeenCalledWith(
      basicModel.id,
    );
  });

  it('should handle HF model download when model has hfModel property', () => {
    const {getByText} = render(
      <ModelNotAvailable
        model={hfModel1}
        currentlySelectedModel={undefined}
        closeSheet={mockCloseSheet}
      />,
      {withNavigation: true},
    );

    fireEvent.press(getByText('Download'));
    expect(downloadStore.downloadHFModel).toHaveBeenCalledWith(
      hfModel1.hfModel,
      hfModel1.hfModelFile,
      {enableVision: true},
    );
  });

  it('should hide warning when a downloaded model is currently selected', () => {
    // Mock that the currently selected model is downloaded
    const downloadedModel = {...basicModel, isDownloaded: true};
    catalogStore.isModelAvailable = jest.fn().mockImplementation(id => {
      if (id === downloadedModel.id) {
        return true;
      }
      if (id === basicModel.id) {
        return false;
      } // Default model is not downloaded
      return false;
    });

    const {queryByText} = render(
      <ModelNotAvailable
        model={basicModel} // Default model is not downloaded
        currentlySelectedModel={downloadedModel} // But currently selected model is downloaded
        closeSheet={mockCloseSheet}
      />,
      {withNavigation: true},
    );

    // Should not show the warning since a downloaded model is selected
    expect(
      queryByText(
        'Default model "basic model" is not downloaded yet. Please download it first.',
      ),
    ).toBeNull();
  });
});
