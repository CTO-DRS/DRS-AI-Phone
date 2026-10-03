/**
 * Audio conversion utilities for neural TTS engines
 * Converts Float32Array PCM to Int16 PCM and encodes to base64 for native bridge transfer
 */
/**
 * Convert Float32Array PCM samples to Int16 PCM
 * @param float32Samples - Audio samples in Float32 format (range -1.0 to 1.0)
 * @returns Int16Array PCM samples (range -32768 to 32767)
 */
export declare function float32ToInt16(float32Samples: Float32Array): Int16Array;
/**
 * Convert Int16Array to base64-encoded string for native bridge transfer
 * @param int16Samples - Audio samples in Int16 format
 * @returns Base64-encoded string
 */
export declare function int16ToBase64(int16Samples: Int16Array): string;
/**
 * Convert Float32Array PCM to base64-encoded Int16 PCM
 * This is the main conversion function used by neural engines
 * @param float32Samples - Audio samples in Float32 format (range -1.0 to 1.0)
 * @returns Base64-encoded Int16 PCM string
 */
export declare function float32ToBase64Int16(float32Samples: Float32Array): string;
/**
 * Estimate the size of base64-encoded audio data
 * Useful for logging and debugging
 * @param sampleCount - Number of audio samples
 * @returns Estimated size in bytes
 */
export declare function estimateBase64Size(sampleCount: number): number;
/**
 * Calculate audio duration from sample count and sample rate
 * @param sampleCount - Number of audio samples
 * @param sampleRate - Sample rate in Hz
 * @returns Duration in seconds
 */
export declare function calculateDuration(sampleCount: number, sampleRate: number): number;
//# sourceMappingURL=AudioConverter.d.ts.map