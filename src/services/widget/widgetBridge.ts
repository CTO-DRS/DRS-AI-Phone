/**
 * widgetBridge — pushes the active-model snapshot into the Android
 * home-screen widget (v1.40.0).
 *
 * The bridge observes the stores via a MobX `autorun`; a widget repaint
 * is fired only when the derived snapshot (model name / status / status
 * kind) actually changes, so streaming tokens or per-second download
 * ticks don't spam the launcher unless the visible state moved.
 */

import {Platform} from 'react-native';
import {autorun} from 'mobx';

import NativeWidgetBridge from '../../specs/NativeWidgetBridge';
import {logger} from '../../utils/logger';

export type WidgetStatusKind =
  | 'idle'
  | 'ready'
  | 'loading'
  | 'generating'
  | 'downloading'
  | 'error';

export interface WidgetLabels {
  idle: string;
  ready: string;
  loading: string;
  generating: string;
  downloading: (progress: number) => string;
  error: string;
}

export interface WidgetSnapshot {
  modelName: string;
  statusText: string;
  statusKind: WidgetStatusKind;
}

export interface WidgetModelSnapshotInput {
  hasActiveModel: boolean;
  activeModelName: string;
  activeModelId: string;
  loadingModelId: string | undefined;
  inferencing: boolean;
  downloads: Array<{modelId: string; progress: number}>;
}

/**
 * Pure derivation from store state → widget snapshot. Exported for tests.
 * Precedence: downloading > loading > generating > ready > idle.
 */
export const deriveWidgetState = (
  input: WidgetModelSnapshotInput,
  labels: WidgetLabels,
): WidgetSnapshot => {
  if (input.downloads.length > 0) {
    const download = input.downloads[0];
    const name =
      input.hasActiveModel && input.activeModelId === download.modelId
        ? input.activeModelName
        : download.modelId;
    return {
      modelName: name,
      statusText: labels.downloading(Math.round(download.progress)),
      statusKind: 'downloading',
    };
  }
  if (input.loadingModelId) {
    return {
      modelName: input.hasActiveModel ? input.activeModelName : '',
      statusText: labels.loading,
      statusKind: 'loading',
    };
  }
  if (input.inferencing) {
    return {
      modelName: input.hasActiveModel ? input.activeModelName : '',
      statusText: labels.generating,
      statusKind: 'generating',
    };
  }
  if (input.hasActiveModel) {
    return {
      modelName: input.activeModelName,
      statusText: labels.ready,
      statusKind: 'ready',
    };
  }
  return {
    modelName: '',
    statusText: labels.idle,
    statusKind: 'idle',
  };
};

let started = false;
let lastSignature = '';
let disposeAutorun: (() => void) | undefined;

/** Begin mirroring store state into the widget (Android only). */
export const startWidgetBridge = (): void => {
  if (started || Platform.OS !== 'android' || !NativeWidgetBridge) {
    return;
  }
  started = true;
  const bridge = NativeWidgetBridge;

  // Lazy require avoids a hard store cycle at module-eval time.

  const {modelStore, uiStore} = require('../../store');

  disposeAutorun = autorun(() => {
    try {
      const downloads = modelStore.activeDownloads.map(
        (d: {modelId: string; progress: number}) => ({
          modelId: d.modelId,
          progress: d.progress,
        }),
      );
      const activeModel = modelStore.activeModel;
      const labels: WidgetLabels = {
        idle: uiStore.l10n.widgets.idle,
        ready: uiStore.l10n.widgets.ready,
        loading: uiStore.l10n.widgets.loading,
        generating: uiStore.l10n.widgets.generating,
        downloading: (p: number) =>
          uiStore.l10n.widgets.downloadingProgress.replace(
            '{{progress}}',
            String(p),
          ),
        error: uiStore.l10n.widgets.error,
      };
      const snapshot = deriveWidgetState(
        {
          hasActiveModel: !!activeModel,
          activeModelName: activeModel?.name ?? '',
          activeModelId: activeModel?.id ?? '',
          loadingModelId: modelStore.loadingModel?.id,
          inferencing: modelStore.inferencing,
          downloads,
        },
        labels,
      );
      const signature = `${snapshot.modelName}~${snapshot.statusText}~${snapshot.statusKind}`;
      if (signature === lastSignature) {
        return;
      }
      lastSignature = signature;
      bridge
        .updateWidget(
          snapshot.modelName,
          snapshot.statusText,
          snapshot.statusKind,
        )
        .catch((error: unknown) => {
          logger.debug('widgetBridge: updateWidget failed', error);
        });
    } catch (error) {
      logger.debug('widgetBridge: autorun tick failed', error);
    }
  });
};

export const stopWidgetBridge = (): void => {
  disposeAutorun?.();
  disposeAutorun = undefined;
  started = false;
  lastSignature = '';
};
