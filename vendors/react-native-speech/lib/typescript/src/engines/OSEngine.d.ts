/**
 * OS Native TTS Engine Wrapper
 *
 * Wraps the existing OS TTS functionality (AVSpeechSynthesizer on iOS, Android TTS on Android)
 * to conform to the TTSEngineInterface
 */
import type {
  TTSEngine,
  TTSEngineInterface,
  AudioBuffer,
  SynthesisOptions,
  SpeechInput,
  ReleaseResult,
} from '../types';
export declare class OSEngine implements TTSEngineInterface<void> {
  readonly name: TTSEngine;
  /**
   * Initialize the OS engine (no-op, always ready)
   */
  initialize(): Promise<void>;
  /**
   * Check if engine is ready (always true for OS TTS)
   */
  isReady(): Promise<boolean>;
  /**
   * Synthesize text using OS TTS
   *
   * Note: OS TTS engines don't return audio buffers, they play directly
   * This method will trigger playback and resolve when complete
   */
  synthesize(
    input: SpeechInput,
    options?: SynthesisOptions,
  ): Promise<AudioBuffer | void>;
  /**
   * Get available voices for OS TTS
   */
  getAvailableVoices(language?: string): Promise<string[]>;
  /**
   * Stop current synthesis
   */
  stop(): Promise<void>;
  /**
   * Destroy engine (no-op for OS TTS)
   */
  destroy(): Promise<void>;
  /**
   * Release engine resources (no-op for OS TTS)
   * OS TTS doesn't load models into memory, so there's nothing to release
   */
  release(): Promise<ReleaseResult>;
}
//# sourceMappingURL=OSEngine.d.ts.map
