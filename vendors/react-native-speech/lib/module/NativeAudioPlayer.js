"use strict";

import TurboSpeech from "./NativeSpeech.js";
// Wrapper for neural audio player methods from RNSpeech
export const NativeNeuralAudioPlayer = {
  playAudio: TurboSpeech.playAudio,
  stop: TurboSpeech.stopAudio,
  pause: TurboSpeech.pauseAudio,
  resume: TurboSpeech.resumeAudio,
  isSpeaking: TurboSpeech.isAudioPlaying,
  // Event emitters (same as main Speech module)
  onStart: TurboSpeech.onStart,
  onFinish: TurboSpeech.onFinish,
  onError: TurboSpeech.onError,
  onProgress: TurboSpeech.onProgress,
  onPause: TurboSpeech.onPause,
  onResume: TurboSpeech.onResume,
  onStopped: TurboSpeech.onStopped,
  onAudioInterruption: TurboSpeech.onAudioInterruption
};
export default NativeNeuralAudioPlayer;
//# sourceMappingURL=NativeAudioPlayer.js.map