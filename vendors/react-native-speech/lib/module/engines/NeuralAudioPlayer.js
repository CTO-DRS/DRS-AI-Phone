'use strict';

/**
 * Neural Audio Player
 *
 * Handles playback of PCM audio data from neural TTS engines
 * Provides a unified interface for playing synthesized audio
 */

import NativeNeuralAudioPlayer from '../NativeAudioPlayer.js';
import {float32ToBase64Int16} from '../utils/AudioConverter.js';
/**
 * Neural Audio Player class
 * Manages playback of neural TTS audio
 */
export class NeuralAudioPlayer {
  isCurrentlyPlaying = false;

  /**
   * Play an audio buffer
   * @param audioBuffer - Audio buffer from neural TTS engine
   * @param options - Playback options
   */
  async play(audioBuffer, options) {
    // Convert Float32Array to base64-encoded Int16 PCM
    const base64Audio = float32ToBase64Int16(audioBuffer.samples);

    // Prepare configuration
    const config = {
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.channels,
      ducking: options?.ducking,
      silentMode: options?.silentMode,
    };

    // Play audio via native module
    this.isCurrentlyPlaying = true;
    try {
      await NativeNeuralAudioPlayer.playAudio(base64Audio, config);
    } finally {
      this.isCurrentlyPlaying = false;
    }
  }

  /**
   * Stop current playback
   */
  async stop() {
    if (this.isCurrentlyPlaying) {
      await NativeNeuralAudioPlayer.stop();
      this.isCurrentlyPlaying = false;
    }
  }

  /**
   * Pause current playback
   */
  async pause() {
    if (this.isCurrentlyPlaying) {
      const result = await NativeNeuralAudioPlayer.pause();
      return result;
    }
    return false;
  }

  /**
   * Resume paused playback
   */
  async resume() {
    const result = await NativeNeuralAudioPlayer.resume();
    return result;
  }

  /**
   * Check if audio is currently playing
   */
  async isSpeaking() {
    return NativeNeuralAudioPlayer.isSpeaking();
  }

  /**
   * Get event emitters for playback events
   */
  get events() {
    return {
      onStart: NativeNeuralAudioPlayer.onStart,
      onFinish: NativeNeuralAudioPlayer.onFinish,
      onError: NativeNeuralAudioPlayer.onError,
      onProgress: NativeNeuralAudioPlayer.onProgress,
      onPause: NativeNeuralAudioPlayer.onPause,
      onResume: NativeNeuralAudioPlayer.onResume,
      onStopped: NativeNeuralAudioPlayer.onStopped,
    };
  }
}

// Singleton instance
export const neuralAudioPlayer = new NeuralAudioPlayer();
//# sourceMappingURL=NeuralAudioPlayer.js.map
