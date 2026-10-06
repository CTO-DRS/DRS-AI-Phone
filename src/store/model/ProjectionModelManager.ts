import {runInAction} from 'mobx';

import {Model, ModelType} from '../../utils/types';
import {downloadManager} from '../../services/downloads';
import {logger} from '../../utils/logger';

// Type-only import: keeps the runtime dependency graph acyclic while the
// manager reads/writes the observable fields of the store it belongs to.
import type {ModelStore} from '../ModelStore';

/**
 * Projection (multimodal mmproj) model management, extracted from
 * ModelStore (audit F-12). Owns every query and mutation that concerns
 * projection models: compatibility, defaults, dependency checks, orphan
 * cleanup and per-model vision preference.
 *
 * Reads and writes go through the host store's observable fields, so MobX
 * tracking/action semantics are unchanged; the store keeps delegating
 * members with the same names and signatures as before the extraction.
 */
export class ProjectionModelManager {
  constructor(private readonly host: ModelStore) {}

  /** Get compatible projection models for a given LLM */
  getCompatibleProjectionModels = (modelId: string): Model[] => {
    const model = this.host.models.find(m => m.id === modelId);
    if (!model || !model.supportsMultimodal) {
      return [];
    }

    // If the model has explicitly defined compatible projection models, use those
    if (
      model.compatibleProjectionModels &&
      model.compatibleProjectionModels.length > 0
    ) {
      return this.host.models.filter(
        m =>
          m.modelType === ModelType.PROJECTION &&
          model.compatibleProjectionModels?.includes(m.id),
      );
    }

    // Otherwise, try to find projection models from the same repository
    const modelIdParts = model.id.split('/');
    if (modelIdParts.length >= 2) {
      const author = modelIdParts[0];
      const repo = modelIdParts[1];

      return this.host.models.filter(
        m =>
          m.modelType === ModelType.PROJECTION &&
          m.id.startsWith(`${author}/${repo}/`),
      );
    }

    return [];
  };

  /**
   * Set default projection model for an LLM
   * @param modelId The ID of the LLM model
   * @param projectionModelId The ID of the projection model to set as default
   */
  setDefaultProjectionModel = (modelId: string, projectionModelId: string) => {
    const model = this.host.models.find(m => m.id === modelId);
    if (model && model.supportsMultimodal) {
      runInAction(() => {
        model.defaultProjectionModel = projectionModelId;
      });
    }
  };

  /**
   * Get the default projection model for an LLM
   * @param modelId The ID of the LLM model
   * @returns The default projection model, or undefined if none is set
   */
  getDefaultProjectionModel = (modelId: string): Model | undefined => {
    const model = this.host.models.find(m => m.id === modelId);
    if (!model || !model.supportsMultimodal || !model.defaultProjectionModel) {
      return undefined;
    }

    return this.host.models.find(m => m.id === model.defaultProjectionModel);
  };

  /**
   * Get all LLM models that use a specific projection model as their default
   * @param projectionModelId The ID of the projection model
   * @returns Array of LLM models that use this projection model as default
   */
  getLLMsUsingProjectionModel = (projectionModelId: string): Model[] => {
    return this.host.models.filter(
      m =>
        m.supportsMultimodal &&
        m.defaultProjectionModel === projectionModelId &&
        m.modelType !== ModelType.PROJECTION,
    );
  };

  /**
   * Get all downloaded LLM models that use a specific projection model as their default
   * @param projectionModelId The ID of the projection model
   * @returns Array of downloaded LLM models that use this projection model as default
   */
  getDownloadedLLMsUsingProjectionModel = (
    projectionModelId: string,
  ): Model[] => {
    return this.getLLMsUsingProjectionModel(projectionModelId).filter(
      m => m.isDownloaded,
    );
  };

  /**
   * Check if a vision model has its required projection model downloaded
   * @param model The vision model to check
   * @returns true if the model doesn't need a projection model or if it has one downloaded
   */
  hasRequiredProjectionModel = (model: Model): boolean => {
    const status = this.getProjectionModelStatus(model);
    return status.isAvailable;
  };

  /**
   * Get detailed status of a vision model's projection model
   * @param model The vision model to check
   * @returns Object with availability status and detailed state information
   */
  getProjectionModelStatus = (
    model: Model,
  ): {
    isAvailable: boolean;
    state: 'not_needed' | 'downloaded' | 'downloading' | 'missing';
    projectionModel?: Model;
  } => {
    // Non-multimodal models don't need projection models
    if (!model.supportsMultimodal || !model.defaultProjectionModel) {
      return {
        isAvailable: true,
        state: 'not_needed',
      };
    }

    // Find the projection model
    const projectionModel = this.host.models.find(
      m => m.id === model.defaultProjectionModel,
    );

    if (!projectionModel) {
      return {
        isAvailable: false,
        state: 'missing',
      };
    }

    // Check if projection model is downloaded
    if (projectionModel.isDownloaded) {
      return {
        isAvailable: true,
        state: 'downloaded',
        projectionModel,
      };
    }

    // Check if projection model is currently downloading
    if (downloadManager.isDownloading(projectionModel.id)) {
      return {
        isAvailable: true, // Consider it available during download
        state: 'downloading',
        projectionModel,
      };
    }

    // Projection model exists but is not downloaded and not downloading
    return {
      isAvailable: false,
      state: 'missing',
      projectionModel,
    };
  };

  /**
   * Check if a projection model can be safely deleted
   * @param projectionModelId The ID of the projection model to check
   * @returns Object with canDelete flag and reason if deletion is blocked
   */
  canDeleteProjectionModel = (
    projectionModelId: string,
  ): {canDelete: boolean; reason?: string; dependentModels?: Model[]} => {
    const projectionModel = this.host.models.find(
      m => m.id === projectionModelId,
    );

    if (
      !projectionModel ||
      projectionModel.modelType !== ModelType.PROJECTION
    ) {
      return {
        canDelete: false,
        reason: 'Model not found or not a projection model',
      };
    }

    // Check if it's currently active - but also verify that we actually have a context
    // This prevents false positives when the context has been released but state hasn't updated
    if (this.host.activeProjectionModelId === projectionModelId) {
      // Double-check: if we don't have an active context, the projection model isn't really active
      if (!this.host.context) {
        logger.debug(
          'Projection model marked as active but no context exists, allowing deletion:',
          projectionModelId,
        );
      } else {
        return {
          canDelete: false,
          reason: 'Projection model is currently active',
        };
      }
    }

    // Get dependent models for warning purposes
    const dependentModels =
      this.getDownloadedLLMsUsingProjectionModel(projectionModelId);

    if (dependentModels.length > 0) {
      logger.debug(
        'Projection model is used by downloaded LLM models:',
        dependentModels.map(m => m.id),
      );

      // Return true to allow manual deletion with warning
      // Automatic cleanup will check dependencies separately
      return {
        canDelete: true,
        reason: 'Projection model is used by downloaded LLM models',
        dependentModels,
      };
    }

    return {canDelete: true, dependentModels};
  };

  /**
   * Automatically cleanup orphaned projection models
   * @param projectionModelId The ID of the projection model to check for cleanup
   */
  cleanupOrphanedProjectionModel = async (projectionModelId: string) => {
    const projectionModel = this.host.models.find(
      m => m.id === projectionModelId,
    );

    if (
      !projectionModel ||
      projectionModel.modelType !== ModelType.PROJECTION
    ) {
      return; // Not a projection model, nothing to cleanup
    }

    if (!projectionModel.isDownloaded) {
      return; // Not downloaded, nothing to cleanup
    }

    // For automatic cleanup, check if there are any dependent models
    const dependentModels =
      this.getDownloadedLLMsUsingProjectionModel(projectionModelId);

    if (dependentModels.length > 0) {
      logger.debug(
        'Skipping auto-cleanup of projection model - still used by downloaded LLMs:',
        dependentModels.map(m => m.id),
      );
      return;
    }

    logger.debug(
      'Auto-cleaning up orphaned projection model:',
      projectionModelId,
    );
    try {
      await this.host.deleteModel(projectionModel);
    } catch (error) {
      logger.error('Failed to auto-cleanup orphaned projection model:', error);
    }
  };

  /**
   * Automatically cleanup multiple orphaned projection models
   * @param projectionModelIds Array of projection model IDs to check for cleanup
   */
  cleanupOrphanedProjectionModels = async (projectionModelIds: string[]) => {
    logger.debug(
      'Checking for orphaned projection models:',
      projectionModelIds,
    );

    // Process each projection model for potential cleanup
    for (const projectionModelId of projectionModelIds) {
      await this.cleanupOrphanedProjectionModel(projectionModelId);
    }
  };

  /**
   * Set vision preference for a model
   * @param modelId The ID of the model
   * @param enabled Whether vision capabilities should be enabled
   */
  setModelVisionEnabled = async (modelId: string, enabled: boolean) => {
    const model = this.host.models.find(m => m.id === modelId);
    if (!model || !model.supportsMultimodal) {
      return;
    }

    // Store the previous vision state to detect changes
    const previousVisionEnabled = this.getModelVisionPreference(model);

    runInAction(() => {
      model.visionEnabled = enabled;
    });

    // Check if this model is currently active and if vision state actually changed
    const isActiveModel = this.host.activeModelId === modelId;
    const visionStateChanged = previousVisionEnabled !== enabled;

    if (isActiveModel && visionStateChanged && this.host.context) {
      logger.debug(
        `Vision ${enabled ? 'enabled' : 'disabled'} for active model, reloading context`,
        {
          modelId,
          previousState: previousVisionEnabled,
          newState: enabled,
          isMultimodalActive: this.host.isMultimodalActive,
        },
      );

      try {
        // Reload the context with the new vision setting
        await this.host.initContext(model);
      } catch (error) {
        logger.error(
          'Failed to reload context after vision state change:',
          error,
        );

        // Revert the vision setting if context reload failed
        runInAction(() => {
          model.visionEnabled = previousVisionEnabled;
        });

        // Re-throw the error so the UI can handle it appropriately
        throw error;
      }
    }
  };

  /**
   * Get vision preference for a model
   * @param model The model to check
   * @returns true if vision should be enabled (defaults to true for backward compatibility)
   */
  getModelVisionPreference = (model: Model): boolean => {
    // For non-multimodal models, always return false
    if (!model.supportsMultimodal) {
      return false;
    }

    // Default to true for backward compatibility if not explicitly set
    return model.visionEnabled !== false;
  };
}
