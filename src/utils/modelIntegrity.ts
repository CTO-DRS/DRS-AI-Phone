import * as RNFS from '@dr.pogodin/react-native-fs';

import {l10n} from '../locales';
import {modelStore} from '../store';
import {formatBytes, formatNumber} from './formatters';
import {getVisionModelSizeBreakdown} from './multimodalHelpers';
import {Model, ModelOrigin} from './types';

// Store-touching model helpers live in their own module so that
// utils/index.ts stays free of store imports: store/ModelStore imports
// utils, so re-importing the store here (and only here) keeps the
// dependency graph acyclic (audit F-12 hygiene).

export const getModelSizeString = (
  model: Model,
  isActiveModel: boolean,
  l10nData = l10n.en,
): string => {
  // Get size from context if the model is active.
  // This is relevant only for local models (when we don't know size upfront),
  // otherwise the values should be the same.
  const size =
    isActiveModel && modelStore.context?.model
      ? modelStore.context.model.size
      : model.size;

  const notAvailable = l10nData.models.modelDescription.notAvailable;
  let sizeString = size > 0 ? formatBytes(size) : notAvailable;

  // For vision models, show combined size if projection model is available
  if (model.supportsMultimodal && model.hfModelFile && model.hfModel) {
    const sizeBreakdown = getVisionModelSizeBreakdown(
      model.hfModelFile,
      model.hfModel,
    );
    if (sizeBreakdown.hasProjection) {
      sizeString = `${formatBytes(sizeBreakdown.totalSize)}`;
    }
  }

  return sizeString;
};

export const getModelDescription = (
  model: Model,
  isActiveModel: boolean,
  l10nData = l10n.en,
): string => {
  // Get size and params from context if the model is active.
  // This is relevant only for local models (when we don't know size/params upfront),
  // otherwise the values should be the same.
  const {size, params} =
    isActiveModel && modelStore.context?.model
      ? {
          size: modelStore.context.model.size,
          params: modelStore.context.model.nParams,
        }
      : {
          size: model.size,
          params: model.params,
        };

  const notAvailable = l10nData.models.modelDescription.notAvailable;
  let sizeString = size > 0 ? formatBytes(size) : notAvailable;

  // For vision models, show combined size if projection model is available
  if (model.supportsMultimodal && model.hfModelFile && model.hfModel) {
    const sizeBreakdown = getVisionModelSizeBreakdown(
      model.hfModelFile,
      model.hfModel,
    );
    if (sizeBreakdown.hasProjection) {
      sizeString = `${formatBytes(sizeBreakdown.totalSize)}`;
    }
  }

  const paramsString =
    params > 0 ? formatNumber(params, 2, true, false) : notAvailable;

  return `${l10nData.models.modelDescription.size}${sizeString}${l10nData.models.modelDescription.separator}${l10nData.models.modelDescription.parameters}${paramsString}`;
};

/**
 * Checks if a model's file integrity is valid by comparing  file size. Hash doesn't seem to be reliable, and expensive.
 * see: https://github.com/birdofpreyru/react-native-fs/issues/99
 * @param model - The model to check integrity for
 * @returns An object containing the integrity check result and any error message
 */
export const checkModelFileIntegrity = async (
  model: Model,
): Promise<{
  isValid: boolean;
  errorMessage: string | null;
}> => {
  try {
    // For HF models, if we don't have lfs details, fetch them
    if (model.origin === ModelOrigin.HF && !model.hfModelFile?.lfs?.size) {
      await modelStore.fetchAndUpdateModelFileDetails(model);
    }

    const filePath = await modelStore.getModelFullPath(model);
    const fileStats = await RNFS.stat(filePath);

    // If we have expected file size from HF, compare it
    if (model.hfModelFile?.lfs?.size) {
      const expectedSize = model.hfModelFile.lfs.size;
      const actualSize = fileStats.size;

      // Calculate size difference ratio
      const sizeDiffPercentage =
        Math.abs(actualSize - expectedSize) / expectedSize;

      // If size difference is more than 0.1% and hash doesn't match, consider it corrupted
      if (sizeDiffPercentage > 0.001) {
        modelStore.updateModelHash(model.id, false);

        // If hash matches, consider it valid
        if (model.hash && model.hfModelFile?.lfs?.oid) {
          if (model.hash === model.hfModelFile.lfs.oid) {
            return {
              isValid: true,
              errorMessage: null,
            };
          }
        }

        // If hash doesn't match and file size doesn't match, consider it corrupted
        return {
          isValid: false,
          errorMessage: `Model file size mismatch (${formatBytes(
            actualSize,
          )} vs ${formatBytes(expectedSize)}). Please delete and redownload.`,
        };
      }

      // File size matches within tolerance, consider it valid
      return {
        isValid: true,
        errorMessage: null,
      };
    }

    // If we reach here, either:
    // 1. We don't have size/hash info to verify against
    // 2. The file passed all available integrity checks
    return {
      isValid: true,
      errorMessage: null,
    };
  } catch (error) {
    console.error('Error checking file integrity:', error);
    return {
      isValid: false,
      errorMessage: 'Error checking file integrity. Please try again.',
    };
  }
};
