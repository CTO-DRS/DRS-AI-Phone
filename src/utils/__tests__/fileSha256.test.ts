/**
 * Tests for the chunked streaming SHA-256 file hasher (audit AI-02).
 *
 * RNFS is mocked with an in-memory "filesystem": `read(path, length,
 * position, 'base64')` slices the buffer and base64-encodes it, exactly
 * like the native module. Expected digests come from Node's crypto module
 * (independent reference implementation — no circularity with our code).
 */

import * as crypto from 'crypto';

jest.mock('@dr.pogodin/react-native-fs', () => {
  const state = {buffers: new Map<string, Buffer>()};

  const stat = jest.fn(async (path: string) => {
    const buf = state.buffers.get(path);
    if (!buf) {
      throw new Error(`ENOENT: ${path}`);
    }
    return {size: buf.length};
  });

  const read = jest.fn(
    async (
      path: string,
      length: number,
      position: number,
      encoding: string,
    ) => {
      if (encoding !== 'base64') {
        throw new Error('test mock only supports base64');
      }
      const buf = state.buffers.get(path);
      if (!buf) {
        throw new Error(`ENOENT: ${path}`);
      }
      return buf.subarray(position, position + length).toString('base64');
    },
  );

  return {
    __setFile: (path: string, content: Buffer) => {
      state.buffers.set(path, content);
    },
    __clearFiles: () => state.buffers.clear(),
    stat,
    read,
  };
});

import * as RNFS from '@dr.pogodin/react-native-fs';

import {decodeBase64ToBytes, sha256FileChunked} from '../fileSha256';

const nodeSha256 = (buf: Buffer): string =>
  crypto.createHash('sha256').update(buf).digest('hex');

describe('decodeBase64ToBytes', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array(257);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 256;
    }
    const b64 = Buffer.from(bytes).toString('base64');
    expect(Array.from(decodeBase64ToBytes(b64))).toEqual(Array.from(bytes));
  });

  it('decodes padded and unpadded inputs', () => {
    expect(Buffer.from(decodeBase64ToBytes('aGVsbG8=')).toString()).toBe(
      'hello',
    );
    expect(Buffer.from(decodeBase64ToBytes('aGVsbG8')).toString()).toBe(
      'hello',
    );
  });
});

describe('sha256FileChunked', () => {
  const PATH = '/models/big.gguf';

  beforeEach(() => {
    (RNFS as any).__clearFiles();
  });

  it('matches Node crypto for an empty file', async () => {
    (RNFS as any).__setFile(PATH, Buffer.alloc(0));
    await expect(sha256FileChunked(PATH)).resolves.toBe(
      nodeSha256(Buffer.alloc(0)),
    );
  });

  it('matches Node crypto for a small single-chunk file', async () => {
    const content = Buffer.from('hello drs ai phone', 'utf8');
    (RNFS as any).__setFile(PATH, content);
    await expect(sha256FileChunked(PATH)).resolves.toBe(nodeSha256(content));
  });

  it('matches Node crypto across chunk boundaries (multi-chunk)', async () => {
    // Deterministic pseudo-random buffer larger than two 64 KiB test chunks.
    const content = crypto.randomBytes(200 * 1024);
    (RNFS as any).__setFile(PATH, content);
    const digest = await sha256FileChunked(PATH, {chunkBytes: 64 * 1024});
    expect(digest).toBe(nodeSha256(content));
  });

  it('matches Node crypto when the file length is an exact multiple of the chunk size', async () => {
    const content = crypto.randomBytes(128 * 1024);
    (RNFS as any).__setFile(PATH, content);
    const digest = await sha256FileChunked(PATH, {chunkBytes: 64 * 1024});
    expect(digest).toBe(nodeSha256(content));
  });

  it('reports monotonic byte progress ending at the total size', async () => {
    const content = crypto.randomBytes(150 * 1024);
    (RNFS as any).__setFile(PATH, content);
    const progress: Array<{bytesDone: number; totalBytes: number}> = [];
    await sha256FileChunked(PATH, {
      chunkBytes: 64 * 1024,
      onProgress: p => progress.push({...p}),
    });
    expect(progress.length).toBe(3); // 64K + 64K + 22K
    expect(progress[progress.length - 1]).toEqual({
      bytesDone: content.length,
      totalBytes: content.length,
    });
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!.bytesDone).toBeGreaterThan(
        progress[i - 1]!.bytesDone,
      );
    }
  });

  it('reads each chunk at the correct offset', async () => {
    const content = crypto.randomBytes(100 * 1024);
    (RNFS as any).__setFile(PATH, content);
    await sha256FileChunked(PATH, {chunkBytes: 64 * 1024});
    const calls = (RNFS.read as jest.Mock).mock.calls;
    expect(calls).toEqual([
      [PATH, 64 * 1024, 0, 'base64'],
      [PATH, 36 * 1024, 64 * 1024, 'base64'],
    ]);
  });

  it('throws when stat reports a non-finite size', async () => {
    (RNFS.stat as jest.Mock).mockResolvedValueOnce({size: NaN});
    await expect(sha256FileChunked('/models/big.gguf')).rejects.toThrow(
      /cannot stat/,
    );
  });

  it('propagates the underlying stat error for a missing file', async () => {
    await expect(sha256FileChunked('/missing.bin')).rejects.toThrow(/ENOENT/);
  });
});
