"use strict";

/**
 * Kokoro TTS specific types
 */

/**
 * CoreML EP flag bits — bit-OR these into `coreMlFlags`. Mirrors
 * `coreml_provider_factory.h` in onnxruntime.
 *
 * IMPORTANT: The high-level option fields (`useCPUOnly`, `useCPUAndGPU`,
 * `enableOnSubgraph`, `onlyEnableDeviceWithANE`) defined in
 * `onnxruntime-common`'s `CoreMLExecutionProviderOption` are NOT honored
 * by the `onnxruntime-react-native` native bridge. The bridge only reads
 * `coreMlFlags` (numeric). Use these constants instead.
 */
export const CoreMlFlag = {
  USE_CPU_ONLY: 0x001,
  ENABLE_ON_SUBGRAPH: 0x002,
  ONLY_ENABLE_DEVICE_WITH_ANE: 0x004,
  ONLY_ALLOW_STATIC_INPUT_SHAPES: 0x008,
  CREATE_MLPROGRAM: 0x010,
  USE_CPU_AND_GPU: 0x020
};

/**
 * Sensible defaults for CoreML — enable on subgraphs (broader op
 * coverage) and use CPU+GPU (lets Metal accelerate where possible).
 * Excludes ANE-only and CPU-only since those force narrower behavior
 * that hurts most models.
 */
export const DEFAULT_COREML_FLAGS =
// eslint-disable-next-line no-bitwise
CoreMlFlag.ENABLE_ON_SUBGRAPH | CoreMlFlag.USE_CPU_AND_GPU;

/**
 * CoreML execution provider options for iOS.
 *
 * Only `coreMlFlags` is wired through the React Native bridge. The
 * high-level booleans (`useCPUOnly`, etc.) are TypeScript-only and have
 * no runtime effect.
 */

/**
 * XNNPACK execution provider options.
 * Optimized CPU kernels — works on both iOS and Android.
 */

/**
 * CPU execution provider options.
 */

/**
 * Union type for supported execution providers.
 *
 * NOTE: NNAPI was removed from this union — Android's NNAPI OS API was
 * deprecated in Android 15 (no longer developed by Google). XNNPACK
 * provides optimized ARM CPU kernels and is the preferred Android EP
 * for `onnxruntime-react-native`. Consumers needing GPU/NPU on Android
 * should rebuild the package with QNN enabled (Qualcomm-only).
 */
//# sourceMappingURL=Kokoro.js.map