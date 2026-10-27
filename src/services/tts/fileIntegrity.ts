import * as RNFS from '@dr.pogodin/react-native-fs';

import {getSHA256Hash} from '../../utils';

/**
 * Post-download integrity verification for bundled TTS model files
 * (audit AI-01: neural TTS downloads previously only checked the HTTP
 * status — a truncated or tampered ONNX file installed fine as long as a
 * 200 came back).
 *
 * Verification data lives in `tts/constants.ts` as static `sha256` (the
 * HuggingFace LFS oid, i.e. the ground-truth SHA-256 of the file) and
 * exact `bytes` values. Files whose source repo is not anonymously
 * readable (the two drshub-owned repos are gated as of 2026-10) carry no
 * descriptor values yet and simply skip verification until the owner
 * fills them in — verification degrades to "no-op" for those, never to a
 * false failure.
 */

export interface TtsFileDescriptor {
  /** Local filename the engine saves under. */
  name: string;
  /** Path appended to the repo base URL (absent for full-`url` entries). */
  urlPath?: string;
  /** Full download URL (used by entries like the shared IPA dict). */
  url?: string;
  /** Expected SHA-256 (lowercase hex) — HF LFS oid where available. */
  sha256?: string;
  /** Expected exact byte size. */
  bytes?: number;
}

/** Raised when a downloaded TTS file fails an integrity check. */
export class TtsIntegrityError extends Error {
  readonly fileName: string;
  readonly reason: 'missing' | 'size' | 'checksum';

  constructor(fileName: string, reason: 'missing' | 'size' | 'checksum') {
    super(
      reason === 'missing'
        ? `TTS file missing after download: ${fileName}`
        : reason === 'size'
          ? `TTS file size mismatch: ${fileName}`
          : `TTS file checksum mismatch: ${fileName}`,
    );
    this.name = 'TtsIntegrityError';
    this.fileName = fileName;
    this.reason = reason;
  }
}

/**
 * Verify one downloaded TTS file. Every check is optional by descriptor:
 * a descriptor without `bytes`/`sha256` only requires the file to exist
 * (status-quo behavior). Throws `TtsIntegrityError` on any failure so the
 * engine's existing all-or-nothing cleanup removes the partial install.
 */
export const verifyTtsFile = async (
  filePath: string,
  file: TtsFileDescriptor,
): Promise<void> => {
  if (!(await RNFS.exists(filePath))) {
    throw new TtsIntegrityError(file.name, 'missing');
  }
  if (file.bytes && file.bytes > 0) {
    const stat = await RNFS.stat(filePath);
    if (Number(stat.size) !== file.bytes) {
      throw new TtsIntegrityError(file.name, 'size');
    }
  }
  if (file.sha256) {
    const actual = await getSHA256Hash(filePath);
    if (!actual || actual.toLowerCase() !== file.sha256.toLowerCase()) {
      throw new TtsIntegrityError(file.name, 'checksum');
    }
  }
};

/**
 * Derive the HF repo-tree API URL for a directory from the corresponding
 * `resolve` base URL used for downloads:
 *   https://huggingface.co/{owner}/{repo}/resolve/{rev}
 *     -> https://huggingface.co/api/models/{owner}/{repo}/tree/{rev}/{dir}
 *   https://huggingface.co/datasets/{owner}/{repo}/resolve/{rev}
 *     -> https://huggingface.co/api/datasets/{owner}/{repo}/tree/{rev}/{dir}
 */
export const hfTreeApiUrl = (
  resolveBaseUrl: string,
  dirPath: string,
): string => {
  const model = resolveBaseUrl.match(
    /^https:\/\/huggingface\.co\/(?!datasets\/)(.+?)\/resolve\/([^/]+)/,
  );
  if (model) {
    return `https://huggingface.co/api/models/${model[1]}/tree/${model[2]}/${dirPath}`;
  }
  const dataset = resolveBaseUrl.match(
    /^https:\/\/huggingface\.co\/datasets\/(.+?)\/resolve\/([^/]+)/,
  );
  if (dataset) {
    return `https://huggingface.co/api/datasets/${dataset[1]}/tree/${dataset[2]}/${dirPath}`;
  }
  throw new Error(`Cannot derive HF tree API URL from: ${resolveBaseUrl}`);
};

/** One entry of the HF repo-tree API (`/api/{models|datasets}/{repo}/tree/...`). */
interface HfTreeEntry {
  type?: string;
  path?: string;
  size?: number;
  lfs?: {oid?: string; size?: number};
}

/**
 * Fetch integrity data ({sha256, bytes}) for every file in an HF directory
 * listing. Used for bulk artifacts like Kokoro's per-voice `.bin` embeddings
 * where hardcoding dozens of oids in constants would be unmaintainable — one
 * API call resolves all of them.
 *
 * The network call is best-effort: on any failure the caller receives an
 * empty map and voice files simply keep the status-quo (status-only)
 * verification. LFS entries resolve to the LFS oid; regular files get no
 * sha256 (only their declared size), matching `TtsFileDescriptor` semantics.
 */
export const fetchHfDirectoryIntegrityMap = async (
  apiUrl: string,
): Promise<Map<string, TtsFileDescriptor>> => {
  const map = new Map<string, TtsFileDescriptor>();
  try {
    const response = await fetch(apiUrl, {
      headers: {Accept: 'application/json'},
    });
    if (!response.ok) {
      console.warn(
        `[tts/integrity] HF tree request failed (${response.status}): ${apiUrl}`,
      );
      return map;
    }
    const entries = (await response.json()) as HfTreeEntry[];
    if (!Array.isArray(entries)) {
      return map;
    }
    for (const entry of entries) {
      if (entry.type !== 'file' || !entry.path) {
        continue;
      }
      const fileName = entry.path.split('/').pop();
      if (!fileName) {
        continue;
      }
      map.set(fileName, {
        name: fileName,
        sha256: entry.lfs?.oid,
        bytes: entry.lfs?.size ?? entry.size,
      });
    }
  } catch (err) {
    console.warn('[tts/integrity] HF tree request threw:', err);
  }
  return map;
};
