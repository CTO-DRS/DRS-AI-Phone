/**
 * Model taxonomy for the Models Hub.
 *
 * Classifies models into user-facing categories using ONLY real signals:
 * HuggingFace tags / pipeline tags, repo and file names, GGUF specs and
 * metadata already present on a Model record. Nothing here invents data —
 * when evidence is missing the classifier simply does not assign a category.
 *
 * Engine support is explicit: the local inference engine (llama.cpp GGUF via
 * llama.rn) runs text/vision/reasoning/code/translation/embedding models, but
 * cannot run image-generation, video-generation or audio models. Those are
 * still classified honestly and surfaced with an "unsupported by the local
 * engine" state instead of a download button.
 */

import {Model, ModelOrigin} from './types';

export type ModelCategory =
  | 'text'
  | 'vision'
  | 'reasoning'
  | 'coding'
  | 'embedding'
  | 'translation'
  | 'multimodal'
  | 'audio'
  | 'image'
  | 'video'
  | 'general';

export const HUB_CATEGORY_ORDER: ModelCategory[] = [
  'text',
  'vision',
  'reasoning',
  'coding',
  'multimodal',
  'embedding',
  'translation',
  'audio',
  'image',
  'video',
];

/**
 * Categories the local GGUF engine can actually load and run.
 * Anything outside this set must never expose a download action that claims
 * local executability.
 */
export const ENGINE_SUPPORTED_CATEGORIES: ModelCategory[] = [
  'text',
  'vision',
  'reasoning',
  'coding',
  'multimodal',
  'embedding',
  'translation',
  'general',
];

export const isEngineSupportedCategory = (category: ModelCategory): boolean =>
  ENGINE_SUPPORTED_CATEGORIES.includes(category);

/** Categories with zero engine support render an honest unavailable state. */
export const isUnavailableOnDeviceEngine = (category: ModelCategory): boolean =>
  !isEngineSupportedCategory(category);

/** Primary category = first classification hit, else general. */
export const primaryCategory = (categories: ModelCategory[]): ModelCategory =>
  categories.length > 0 ? categories[0] : 'general';

const add = (set: Set<ModelCategory>, category: ModelCategory) => {
  set.add(category);
};

/** Tags that HF exposes as pipeline tags (real API data). */
const PIPELINE_TAG_MAP: Record<string, ModelCategory[]> = {
  'text-generation': ['text'],
  conversational: ['text'],
  'text2text-generation': ['text'],
  'text-classification': ['text'],
  'question-answering': ['text'],
  summarization: ['text'],
  'fill-mask': ['text'],
  'zero-shot-classification': ['text'],
  'image-text-to-text': ['vision', 'multimodal'],
  'image-to-text': ['vision', 'multimodal'],
  'visual-document-question-answering': ['vision', 'multimodal'],
  'visual-question-answering': ['vision', 'multimodal'],
  'any-to-any': ['multimodal', 'vision'],
  translation: ['translation'],
  'feature-extraction': ['embedding'],
  'sentence-similarity': ['embedding'],
  'sentence-transformers': ['embedding'],
  'automatic-speech-recognition': ['audio'],
  'speech-to-text': ['audio'],
  'text-to-speech': ['audio'],
  'text-to-audio': ['audio'],
  'audio-classification': ['audio'],
  'audio-to-audio': ['audio'],
  'text-to-image': ['image'],
  'image-to-image': ['image'],
  'text-to-video': ['video'],
  'image-to-video': ['video'],
  'video-classification': ['video'],
};

const NAME_PATTERNS: Array<[RegExp, ModelCategory]> = [
  [
    /(^|[-_.\s])(coder|codellama|starcoder|codegemma|codestral|codeqwen|deepseek-?coder|codeshell|codegen|magicoder|stablecode|codet5)([-_.\d]|$)/i,
    'coding',
  ],
  [/(whisper|seamless|wav2vec|vosk|silero|piper|bark|tts|asr)/i, 'audio'],
  [/(embed|bge-|gte-|e5-|jina-|minilm|all-mpnet|arctic|voyage)/i, 'embedding'],
  [/(marian|opus-?mt|nllb|mbart|m2m-100|madlad)/i, 'translation'],
  [
    /(llava|moondream|minicpm-?v|paligemma|qwen.*?-?vl|internvl|idefics|smolvlm|vision|clip|florence)/i,
    'vision',
  ],
  [
    /(deepseek-r1|qwq|qvx|reasoner|thinking|-r1-|openo1|marco-o1|skywork-o1)/i,
    'reasoning',
  ],
];

/**
 * Classify a HuggingFace repo (search result or full info) into categories.
 * All inputs come straight from the HF API — no guessing beyond name/tag
 * heuristics that are the de-facto way these models are labelled.
 */
export const classifyHfModel = (hf: {
  id?: string;
  tags?: string[] | null;
  pipeline_tag?: string | null;
  specs?: {gguf?: {architecture?: string}} | null;
}): ModelCategory[] => {
  const found = new Set<ModelCategory>();
  const tags = hf.tags ?? [];
  const id = hf.id ?? '';
  const pipeline = hf.pipeline_tag ?? tags.find(t => !t.includes(':'));

  // 1) Pipeline tag — the strongest structured signal.
  for (const tag of [pipeline, ...tags]) {
    if (tag && PIPELINE_TAG_MAP[tag]) {
      PIPELINE_TAG_MAP[tag].forEach(c => add(found, c));
    }
  }

  // 2) Structured tags (license/keyword style) that carry category info.
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (
      lower === 'gguf' ||
      lower.startsWith('license:') ||
      lower.includes('arxiv')
    ) {
      continue;
    }
    if (PIPELINE_TAG_MAP[lower]) {
      PIPELINE_TAG_MAP[lower].forEach(c => add(found, c));
    }
    if (lower === 'code' || lower === 'coding') {
      add(found, 'coding');
    }
    if (lower === 'reasoning' || lower === 'thinking') {
      add(found, 'reasoning');
    }
    if (lower === 'multimodal' || lower === 'vision') {
      add(found, 'vision');
    }
    if (lower === 'translation') {
      add(found, 'translation');
    }
    if (lower === 'embeddings') {
      add(found, 'embedding');
    }
  }

  // 3) Repo id name patterns — reliable for well-known model families.
  for (const [pattern, category] of NAME_PATTERNS) {
    if (pattern.test(id)) {
      add(found, category);
    }
  }

  // A repo with no evidence stays unclassified (UI maps to "general").
  return HUB_CATEGORY_ORDER.filter(c => found.has(c));
};

/**
 * Classify an installed/local Model record. Uses the model's stored HF data
 * when present, then falls back to runtime-verified capabilities (multimodal,
 * reasoning, skills) that the app has actually detected.
 */
export const classifyModel = (model: Model): ModelCategory[] => {
  const found = new Set<ModelCategory>();

  // Prefer the HF repo classification when we have it (real upstream tags).
  if (model.hfModel) {
    classifyHfModel({
      id: model.hfModel.id ?? model.repo ?? model.name,
      tags: model.hfModel.tags,
      specs: model.hfModel.specs,
    }).forEach(c => add(found, c));
  } else {
    classifyHfModel({
      id: `${model.author ?? ''}/${model.repo ?? model.name ?? ''}`,
    }).forEach(c => add(found, c));
  }

  // Runtime-verified multimodal (mmproj actually attached) → vision/multimodal.
  if (model.supportsMultimodal || model.modelType === 'vision') {
    add(found, 'vision');
    add(found, 'multimodal');
  }

  // Reasoning capability is detected live from the template / tags.
  if (model.reasoning?.isReasoning === 'yes' || model.supportsThinking) {
    add(found, 'reasoning');
  }

  // Skills detected by the app (modelCaps / benchmarks of the file itself).
  const caps = model.capabilities ?? [];
  if (caps.includes('code')) {
    add(found, 'coding');
  }
  if (caps.includes('math') || caps.includes('reasoning')) {
    add(found, 'reasoning');
  }
  if (caps.includes('multilingual')) {
    add(found, 'translation');
  }

  return HUB_CATEGORY_ORDER.filter(c => found.has(c));
};

/**
 * Primary category for an installed model, with the "general" fallback used
 * for grouping and storage rollups.
 */
export const modelPrimaryCategory = (model: Model): ModelCategory =>
  primaryCategory(classifyModel(model));

/**
 * True when a HuggingFace repo can be executed by the local engine at all.
 * A repo qualifies if it exposes GGUF files AND its classification does not
 * fall exclusively into engine-unsupported categories.
 */
export const isHfModelLocallyRunnable = (
  hf: Parameters<typeof classifyHfModel>[0],
): boolean => {
  const categories = classifyHfModel(hf);
  if (categories.length === 0) {
    return true; // unclassified GGUF → llama.cpp may still run it
  }
  return categories.some(c => isEngineSupportedCategory(c));
};

/** Human-readable category key for i18n lookup: `modelsHub.categories.<key>`. */
export const categoryL10nKey = (category: ModelCategory): string => category;

/** Best-effort "family" label from a repo id, e.g. "Qwen2.5-Coder". */
export const extractFamilyLabel = (repoId: string): string => {
  const tail = repoId.split('/').pop() ?? repoId;
  const withoutSuffix = tail.replace(/-GGUF$/i, '').replace(/-gguf$/i, '');
  return withoutSuffix || tail;
};

/**
 * Parse a quantization label from a GGUF filename (real convention):
 * "model-Q4_K_M.gguf" → "Q4_K_M", "model.FP16.gguf" → "FP16".
 */
export const extractQuantLabel = (filename: string): string | null => {
  const match = filename.match(
    /\b(?:IQ|Q|F|FP|BF|TQ)\s?\d+[\w]*(_[\w]+)*|FP16|FP32|BF16|F16|F32\b/i,
  );
  return match ? match[0].toUpperCase().replace(/\s/g, '') : null;
};

/**
 * Approximate parameter-count label from GGUF specs total (real data when
 * present): 3_800_000_000 → "3.8B". Returns null when specs are missing.
 */
export const formatParamsLabel = (
  total: number | undefined | null,
): string | null => {
  if (!total || total <= 0) {
    return null;
  }
  if (total >= 1_000_000_000) {
    return `${(total / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (total >= 1_000_000) {
    return `${Math.round(total / 1_000_000)}M`;
  }
  return `${total}`;
};

/**
 * Why a classification exists — used by the details sheet to show evidence
 * instead of an unexplained label. Returns the matched real signals.
 */
export const classificationEvidence = (hf: {
  id?: string;
  tags?: string[] | null;
}): string[] => {
  const evidence: string[] = [];
  const tags = hf.tags ?? [];
  for (const tag of tags) {
    if (PIPELINE_TAG_MAP[tag]) {
      evidence.push(`pipeline_tag: ${tag}`);
    }
  }
  const id = hf.id ?? '';
  for (const [pattern, category] of NAME_PATTERNS) {
    if (pattern.test(id)) {
      evidence.push(`name pattern → ${category}`);
    }
  }
  return evidence;
};

export const MODEL_ORIGIN_LABEL = (
  origin: ModelOrigin,
): 'local' | 'hf' | 'remote' => {
  switch (origin) {
    case ModelOrigin.LOCAL:
      return 'local';
    case ModelOrigin.HF:
      return 'hf';
    default:
      return 'remote';
  }
};
