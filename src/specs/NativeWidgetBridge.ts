import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

/**
 * JS → widget state pump (v1.40.0).
 *
 * Pushes the active-model snapshot into the v1.39 home-screen widget:
 * the card title becomes the model name and the subtitle becomes the
 * live status. The native side writes the snapshot to SharedPreferences
 * and repaints every placed instance; `statusKind` tints the subtitle.
 *
 * statusKind: 'idle' | 'ready' | 'loading' | 'generating' | 'downloading'
 * | 'error'. `statusText` is already localized by JS.
 */
export interface Spec extends TurboModule {
  updateWidget(
    modelName: string,
    statusText: string,
    statusKind: string,
  ): Promise<void>;
  clearWidget(): Promise<void>;
}

// Optional, Android-only: null on iOS and when the module is not registered.
export default TurboModuleRegistry.get<Spec>('WidgetBridgeModule');
