/**
 * Supertonic Inference Pipeline
 *
 * Implements the 4-model ONNX pipeline for Supertonic TTS:
 * 1. Duration Predictor - predicts phoneme durations from text
 * 2. Text Encoder - encodes text into embeddings
 * 3. Vector Estimator - iterative diffusion to generate mel-spectrogram
 * 4. Vocoder - converts mel-spectrogram to audio waveform
 *
 * Based on: https://huggingface.co/Supertone/supertonic
 */
import type { SupertonicConfig, SupertonicVoiceStyle, AudioBuffer } from '../../types';
import { UnicodeProcessor } from './UnicodeProcessor';
export declare class SupertonicInference {
    private durationPredictorSession;
    private textEncoderSession;
    private vectorEstimatorSession;
    private vocoderSession;
    private sampleRate;
    private latentDim;
    private isInitialized;
    private unicodeProcessor;
    /**
     * Set the Unicode processor instance
     */
    setUnicodeProcessor(processor: UnicodeProcessor): void;
    /**
     * Initialize the inference pipeline by loading all 4 ONNX models
     */
    initialize(config: SupertonicConfig): Promise<void>;
    /**
     * Run the full synthesis pipeline
     *
     * Based on official Supertonic implementation:
     * 1. Duration predictor outputs a SCALAR (total audio duration in seconds)
     * 2. Text encoder outputs embeddings at [batch, emb_dim, seq_len]
     * 3. Vector estimator uses cross-attention (no manual embedding expansion)
     * 4. Vocoder converts latent to waveform
     *
     * @param text - Input text to synthesize
     * @param voiceStyle - Voice style embeddings
     * @param inferenceSteps - Number of diffusion steps (default: 5)
     * @param speed - Speech speed multiplier (default: 1.0)
     * @returns AudioBuffer with synthesized audio
     */
    synthesize(text: string, voiceStyle: SupertonicVoiceStyle, inferenceSteps?: number, speed?: number): Promise<AudioBuffer>;
    /**
     * Convert speed to duration factor (matches official implementation)
     * Formula: durationFactor = 1 / (speed + offset)
     *
     * The offset of 0.05 ensures:
     * - Speed 1.0x → factor 0.952 (slightly faster baseline)
     * - Speed 2.0x → factor 0.488 (much faster)
     *
     * @param speed - Speech speed multiplier (1.0 = normal)
     * @param offset - Small offset to prevent division by zero and tune baseline
     */
    private speedToDurationFactor;
    /**
     * Step 1: Predict total audio duration (in seconds)
     *
     * The duration predictor outputs a SCALAR value representing
     * the total audio duration in seconds, NOT per-character durations.
     *
     * Reference shapes from official implementation:
     * - text_ids: [batch_size, seq_len] int64
     * - style_dp: [batch_size, 8, 16] float32 (from voice JSON dims)
     * - text_mask: [batch_size, 1, seq_len] float32 (3D, not 2D!)
     * - output: [batch_size] float32 (scalar duration in seconds)
     */
    private predictDuration;
    /**
     * Step 2: Encode text into embeddings
     *
     * Output shape is [batch, emb_dim, seq_len] - NOT expanded by durations.
     * The vector estimator handles text-to-latent mapping via cross-attention.
     *
     * Reference shapes from official implementation:
     * - text_ids: [batch_size, seq_len] int64
     * - text_mask: [batch_size, 1, seq_len] float32 (3D, not 2D!)
     * - style_ttl: [batch_size, 50, 256] float32 (3D from voice JSON dims)
     * - output text_emb: [batch_size, emb_dim, seq_len] float32
     */
    private encodeText;
    /**
     * Step 3: Run iterative diffusion to estimate mel-spectrogram latent
     *
     * IMPORTANT: The text embedding is NOT expanded by durations.
     * The model uses cross-attention to map text_emb [1, emb_dim, seq_len]
     * to latent [1, latent_dim, latent_len] internally.
     *
     * Reference shapes from official implementation:
     * - noisy_latent: [batch_size, 144, latent_len] float32
     * - text_emb: [batch_size, emb_dim, seq_len] float32 (NOT expanded!)
     * - style_ttl: [batch_size, 50, 256] float32
     * - text_mask: [batch_size, 1, seq_len] float32 (3D!)
     * - latent_mask: [batch_size, 1, latent_len] float32 (3D!)
     * - current_step: [batch_size] float32
     * - total_step: [batch_size] float32
     */
    private estimateVector;
    /**
     * Step 4: Convert latent to audio waveform
     *
     * Reference shapes:
     * - latent: [batch_size, 144, latent_len] float32
     * - output wav: [batch_size, wav_len] float32
     */
    private vocode;
    /**
     * Check if inference pipeline is ready
     */
    isReady(): boolean;
    /**
     * Release all model resources
     */
    destroy(): Promise<void>;
    /**
     * Release all ONNX sessions to free memory.
     * Unlike destroy(), this method calls session.release() if available
     * to properly free native resources.
     *
     * @returns Array of errors that occurred during release (empty if all succeeded)
     */
    release(): Promise<Error[]>;
}
