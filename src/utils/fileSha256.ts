/* eslint-disable no-bitwise */
import * as RNFS from '@dr.pogodin/react-native-fs';

import {IncrementalSha256} from './sha256';

/**
 * Chunked streaming SHA-256 for huge files (audit AI-02).
 *
 * RNFS.hash delegates to a native hasher that is known to be unreliable on
 * very large files (https://github.com/birdofpreyru/react-native-fs/issues/99)
 * — the reason `verifyDownloadedModel` only hash-verifies files ≤ 4 GiB.
 * This module closes that gap: it reads the file in fixed-size base64
 * segments via RNFS.read and feeds raw bytes through a pure-JS incremental
 * SHA-256 (see `IncrementalSha256`), keeping JS memory bounded to one chunk
 * regardless of file size.
 *
 * The trade-off is throughput: a pure-JS SHA-256 on Hermes runs at a few
 * MB/s, so a 6 GB model takes on the order of tens of minutes. That is why
 * callers run this in the background AFTER the model is installed, never
 * blocking the download-completion or load path (size gates stay cheap and
 * synchronous).
 */

/** 4 MiB — a balance between bridge round-trips and peak JS memory. */
export const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;

// Standard base64 alphabet lookup for chunk decoding.
const B64_LOOKUP = new Uint8Array(128);
(() => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < alphabet.length; i++) {
    B64_LOOKUP[alphabet.charCodeAt(i)] = i;
  }
})();

/** Decode a base64 string into raw bytes (standard alphabet, padding optional). */
export function decodeBase64ToBytes(b64: string): Uint8Array {
  // Worst-case output size (each char carries 6 bits); the actual used
  // length is trimmed from the front of the buffer below.
  const out = new Uint8Array(Math.ceil((b64.length * 3) / 4));
  let outPos = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < b64.length; i++) {
    const code = b64.charCodeAt(i);
    if (code === 61) {
      // '=' — padding tail; remaining bits are zero by construction.
      break;
    }
    const value = B64_LOOKUP[code] ?? -1;
    if (value < 0) {
      throw new Error(`Invalid base64 character at ${i}`);
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outPos++] = (buffer >>> bits) & 0xff;
    }
  }
  return out.subarray(0, outPos);
}

export interface Sha256FileProgress {
  /** Bytes hashed so far. */
  bytesDone: number;
  /** Total file size in bytes (from stat). */
  totalBytes: number;
}

/**
 * Compute the SHA-256 of `filePath` by streaming it in chunks.
 * Returns the lowercase hex digest (same encoding as RNFS.hash / HF LFS oid).
 */
export const sha256FileChunked = async (
  filePath: string,
  options?: {
    chunkBytes?: number;
    onProgress?: (progress: Sha256FileProgress) => void;
  },
): Promise<string> => {
  const stat = await RNFS.stat(filePath);
  const totalBytes = Number(stat.size);
  if (!Number.isFinite(totalBytes) || totalBytes < 0) {
    throw new Error(`sha256FileChunked: cannot stat ${filePath}`);
  }

  const chunkBytes = options?.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const hasher = new IncrementalSha256();
  let position = 0;

  while (position < totalBytes) {
    const length = Math.min(chunkBytes, totalBytes - position);
    const b64 = await RNFS.read(filePath, length, position, 'base64');
    const bytes = decodeBase64ToBytes(b64);
    if (bytes.length !== length) {
      throw new Error(
        `sha256FileChunked: short read at ${position} (${bytes.length} of ${length})`,
      );
    }
    hasher.update(bytes);
    position += length;
    options?.onProgress?.({bytesDone: position, totalBytes});
  }

  return hasher.digestHex();
};
