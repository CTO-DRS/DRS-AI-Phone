export interface VoiceStyle {
    styleDp: Float32Array;
    styleTtl: Float32Array;
}
export interface ModelPaths {
    durationPredictor: string;
    textEncoder: string;
    vectorEstimator: string;
    vocoder: string;
    unicodeIndexer: string;
}
export interface SynthOptions {
    language: string;
    voiceId: string;
    speed?: number;
    inferenceSteps?: number;
}
export declare class SupertonicNode {
    private duration;
    private textEncoder;
    private vectorEstimator;
    private vocoder;
    private indexer;
    private supportsLangTags;
    private voicesDir;
    private voiceCache;
    init(paths: ModelPaths, voicesDir: string): Promise<void>;
    private getVoice;
    synthesize(text: string, options: SynthOptions): Promise<{
        samples: Float32Array;
        sampleRate: number;
    }>;
}
export declare const SUPERTONIC_NODE_SAMPLE_RATE = 44100;
//# sourceMappingURL=supertonic-node.d.ts.map