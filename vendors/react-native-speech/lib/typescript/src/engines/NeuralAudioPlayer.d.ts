/**
 * Neural Audio Player
 *
 * Handles playback of PCM audio data from neural TTS engines
 * Provides a unified interface for playing synthesized audio
 */
import type {AudioBuffer} from '../types';
export interface PlaybackOptions {
  /**
   * If `true`, audio from other apps will be temporarily lowered (ducked) while speech is active.
   * @default false
   */
  ducking?: boolean;
  /**
   * Determines how speech audio interacts with the device's silent (ringer) switch.
   * @platform iOS
   *
   * - `obey`: (Default) Does not change the app's audio session. Speech follows the system default.
   * - `respect`: Speech will be silenced by the ringer switch. Use for non-critical audio.
   * - `ignore`: Speech will play even if the ringer is off. Use for critical audio when ducking is not desired.
   */
  silentMode?: 'obey' | 'respect' | 'ignore';
}
/**
 * Neural Audio Player class
 * Manages playback of neural TTS audio
 */
export declare class NeuralAudioPlayer {
  private isCurrentlyPlaying;
  /**
   * Play an audio buffer
   * @param audioBuffer - Audio buffer from neural TTS engine
   * @param options - Playback options
   */
  play(audioBuffer: AudioBuffer, options?: PlaybackOptions): Promise<void>;
  /**
   * Stop current playback
   */
  stop(): Promise<void>;
  /**
   * Pause current playback
   */
  pause(): Promise<boolean>;
  /**
   * Resume paused playback
   */
  resume(): Promise<boolean>;
  /**
   * Check if audio is currently playing
   */
  isSpeaking(): Promise<boolean>;
  /**
   * Get event emitters for playback events
   */
  get events(): {
    onStart: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
      import('..').EventProps
    >;
    onFinish: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
      import('..').EventProps
    >;
    onError: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
      import('..').EventProps
    >;
    onProgress: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
      import('..').ProgressEventProps
    >;
    onPause: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
      import('..').EventProps
    >;
    onResume: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
      import('..').EventProps
    >;
    onStopped: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
      import('..').EventProps
    >;
  };
}
export declare const neuralAudioPlayer: NeuralAudioPlayer;
//# sourceMappingURL=NeuralAudioPlayer.d.ts.map
