import {
  classifyHfModel,
  classifyModel,
  extractQuantLabel,
  formatParamsLabel,
  isHfModelLocallyRunnable,
  primaryCategory,
} from '../modelTaxonomy';
import {Model, ModelOrigin} from '../types';

const hf = (id: string, tags: string[] = []) => ({id, tags, specs: undefined});

describe('classifyHfModel', () => {
  it('classifies text-generation pipeline models as text', () => {
    expect(
      classifyHfModel(hf('org/model', ['gguf', 'text-generation'])),
    ).toContain('text');
  });

  it('classifies vision language models from pipeline tag', () => {
    const cats = classifyHfModel(hf('org/vlm', ['gguf', 'image-text-to-text']));
    expect(cats).toContain('vision');
    expect(cats).toContain('multimodal');
  });

  it('classifies coder repos by name pattern', () => {
    expect(
      classifyHfModel(hf('Qwen/Qwen2.5-Coder-7B-Instruct-GGUF', ['gguf'])),
    ).toContain('coding');
    expect(
      classifyHfModel(hf('deepseek-ai/DeepSeek-Coder-V2-Lite-GGUF', ['gguf'])),
    ).toContain('coding');
  });

  it('classifies whisper as audio and marks engine-unsupported categories', () => {
    expect(
      classifyHfModel(
        hf('repo/whisper-small-gguf', ['gguf', 'automatic-speech-recognition']),
      ),
    ).toContain('audio');
    expect(
      isHfModelLocallyRunnable(
        hf('repo/whisper-small-gguf', ['gguf', 'automatic-speech-recognition']),
      ),
    ).toBe(false);
  });

  it('classifies embedding repos', () => {
    expect(
      classifyHfModel(hf('org/bge-m3-GGUF', ['gguf', 'feature-extraction'])),
    ).toContain('embedding');
  });

  it('classifies translation repos from name and tags', () => {
    expect(
      classifyHfModel(hf('org/nllb-200-GGUF', ['gguf', 'translation'])),
    ).toContain('translation');
    expect(classifyHfModel(hf('org/opus-mt-en-ar-GGUF', []))).toContain(
      'translation',
    );
  });

  it('classifies text-to-image as image and refuses local run', () => {
    expect(
      classifyHfModel(hf('org/sdxl-GGUF', ['gguf', 'text-to-image'])),
    ).toContain('image');
    expect(
      isHfModelLocallyRunnable(hf('org/sdxl-GGUF', ['gguf', 'text-to-image'])),
    ).toBe(false);
  });

  it('classifies reasoning repos (R1 / QwQ) and tag evidence', () => {
    expect(
      classifyHfModel(
        hf('deepseek-ai/DeepSeek-R1-Distill-Qwen-7B-GGUF', ['gguf']),
      ),
    ).toContain('reasoning');
    expect(classifyHfModel(hf('org/model', ['gguf', 'reasoning']))).toContain(
      'reasoning',
    );
  });

  it('returns empty for a repo with no evidence (mapped to general downstream)', () => {
    expect(
      classifyHfModel(
        hf('org/unknown-model-xyz', ['gguf', 'license:apache-2.0']),
      ),
    ).toEqual([]);
    expect(primaryCategory([])).toBe('general');
  });

  it('never misclassifies unrelated names containing "code" substrings', () => {
    expect(classifyHfModel(hf('org/decoder-v2-GGUF', ['gguf']))).not.toContain(
      'coding',
    );
  });
});

describe('classifyModel', () => {
  const baseModel = (): Model =>
    ({
      id: 'm1',
      author: 'org',
      name: 'Test 7B',
      type: 'test',
      size: 4_000_000_000,
      params: 7_000_000_000,
      isDownloaded: true,
      downloadUrl: 'https://huggingface.co/org/repo/resolve/main/m.gguf',
      hfUrl: 'https://huggingface.co/org/repo',
      progress: 100,
      filename: 'm.gguf',
      isLocal: false,
      origin: ModelOrigin.HF,
      defaultChatTemplate: {} as Model['defaultChatTemplate'],
      chatTemplate: {} as Model['chatTemplate'],
      defaultStopWords: [],
      stopWords: [],
      defaultCompletionSettings: {} as Model['defaultCompletionSettings'],
      completionSettings: {} as Model['completionSettings'],
    }) as unknown as Model;

  it('uses runtime multimodal signal to add vision', () => {
    const model = baseModel();
    model.supportsMultimodal = true;
    const cats = classifyModel(model);
    expect(cats).toContain('vision');
    expect(cats).toContain('multimodal');
  });

  it('uses detected reasoning capability', () => {
    const model = baseModel();
    model.reasoning = {
      isReasoning: 'yes',
      source: 'detected',
      supportsEffort: false,
      effortValues: [],
      effortSource: 'none',
    };
    expect(classifyModel(model)).toContain('reasoning');
  });

  it('falls back to general for a model with no signals', () => {
    expect(primaryCategory(classifyModel(baseModel()))).toBe('general');
  });
});

describe('quant + params labels', () => {
  it('parses quantization from GGUF filenames', () => {
    expect(extractQuantLabel('model-Q4_K_M.gguf')).toBe('Q4_K_M');
    expect(extractQuantLabel('model.FP16.gguf')).toBe('FP16');
    expect(extractQuantLabel('model-IQ3_XS.gguf')).toBe('IQ3_XS');
    expect(extractQuantLabel('model.gguf')).toBeNull();
  });

  it('formats parameter counts from real GGUF specs', () => {
    expect(formatParamsLabel(3_800_000_000)).toBe('3.8B');
    expect(formatParamsLabel(1_000_000_000)).toBe('1B');
    expect(formatParamsLabel(700_000_000)).toBe('700M');
    expect(formatParamsLabel(undefined)).toBeNull();
    expect(formatParamsLabel(0)).toBeNull();
  });
});
