export type {AudioPlayerConfig} from './NativeSpeech';
export type {EventProps as AudioPlayerEventProps} from './NativeSpeech';
export type {ProgressEventProps as AudioPlayerProgressEventProps} from './NativeSpeech';
export type {AudioInterruptionProps} from './NativeSpeech';
export declare const NativeNeuralAudioPlayer: {
  playAudio: (
    audioData: string,
    config: import('./NativeSpeech').AudioPlayerConfig,
  ) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  isSpeaking: () => Promise<boolean>;
  onStart: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
    import('./NativeSpeech').EventProps
  >;
  onFinish: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
    import('./NativeSpeech').EventProps
  >;
  onError: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
    import('./NativeSpeech').EventProps
  >;
  onProgress: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
    import('./NativeSpeech').ProgressEventProps
  >;
  onPause: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
    import('./NativeSpeech').EventProps
  >;
  onResume: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
    import('./NativeSpeech').EventProps
  >;
  onStopped: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
    import('./NativeSpeech').EventProps
  >;
  onAudioInterruption: import('react-native/Libraries/Types/CodegenTypesNamespace').EventEmitter<
    import('./NativeSpeech').AudioInterruptionProps
  >;
};
export default NativeNeuralAudioPlayer;
//# sourceMappingURL=NativeAudioPlayer.d.ts.map
