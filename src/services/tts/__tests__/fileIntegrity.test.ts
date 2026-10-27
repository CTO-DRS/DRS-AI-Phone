/**
 * Tests for TTS post-download integrity verification (audit AI-01).
 */

import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  TtsIntegrityError,
  fetchHfDirectoryIntegrityMap,
  hfTreeApiUrl,
  verifyTtsFile,
} from '../fileIntegrity';

describe('verifyTtsFile', () => {
  beforeEach(() => {
    (RNFS as any).__resetMockState?.();
  });

  it('passes silently when the file exists and all checks match', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.stat as jest.Mock).mockResolvedValue({size: 1024});
    (RNFS.hash as jest.Mock).mockResolvedValue('A'.repeat(64)); // case-insensitive

    await expect(
      verifyTtsFile('/tts/x/model.onnx', {
        name: 'model.onnx',
        bytes: 1024,
        sha256: 'a'.repeat(64),
      }),
    ).resolves.toBeUndefined();
  });

  it('passes with no descriptor values (status-only fallback for gated repos)', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    await expect(
      verifyTtsFile('/tts/x/kitten.onnx', {name: 'kitten.onnx'}),
    ).resolves.toBeUndefined();
    expect(RNFS.stat).not.toHaveBeenCalled();
    expect(RNFS.hash).not.toHaveBeenCalled();
  });

  it('throws "missing" when the file does not exist', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    const err = await verifyTtsFile('/tts/x/model.onnx', {
      name: 'model.onnx',
      bytes: 1024,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TtsIntegrityError);
    expect((err as TtsIntegrityError).reason).toBe('missing');
  });

  it('throws "size" on an exact-size mismatch', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.stat as jest.Mock).mockResolvedValue({size: 999});
    const err = await verifyTtsFile('/tts/x/model.onnx', {
      name: 'model.onnx',
      bytes: 1024,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TtsIntegrityError);
    expect((err as TtsIntegrityError).reason).toBe('size');
  });

  it('throws "checksum" on a hash mismatch', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.stat as jest.Mock).mockResolvedValue({size: 1024});
    (RNFS.hash as jest.Mock).mockResolvedValue('f'.repeat(64));
    const err = await verifyTtsFile('/tts/x/model.onnx', {
      name: 'model.onnx',
      sha256: 'a'.repeat(64),
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TtsIntegrityError);
    expect((err as TtsIntegrityError).reason).toBe('checksum');
  });
});

describe('hfTreeApiUrl', () => {
  it('derives the models tree API from a resolve base URL', () => {
    expect(
      hfTreeApiUrl(
        'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main',
        'voices',
      ),
    ).toBe(
      'https://huggingface.co/api/models/onnx-community/Kokoro-82M-v1.0-ONNX/tree/main/voices',
    );
  });

  it('derives the datasets tree API from a dataset resolve base URL', () => {
    expect(
      hfTreeApiUrl(
        'https://huggingface.co/datasets/drshub/phonemizer-dicts/resolve/main',
        '',
      ),
    ).toBe(
      'https://huggingface.co/api/datasets/drshub/phonemizer-dicts/tree/main/',
    );
  });

  it('throws on a non-HF base URL', () => {
    expect(() =>
      hfTreeApiUrl('https://example.com/foo/resolve/main', ''),
    ).toThrow(/Cannot derive/);
  });
});

describe('fetchHfDirectoryIntegrityMap', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps LFS entries to {sha256, bytes} keyed by basename', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          type: 'file',
          path: 'voices/af_heart.bin',
          size: 500,
          lfs: {oid: 'a'.repeat(64), size: 498123},
        },
        {
          type: 'directory',
          path: 'voices/sub',
        },
        {
          type: 'file',
          path: 'voices/plain.json',
          size: 77,
        },
      ],
    });

    const map = await fetchHfDirectoryIntegrityMap('https://api/tree/main');
    expect(map.get('af_heart.bin')).toEqual({
      name: 'af_heart.bin',
      sha256: 'a'.repeat(64),
      bytes: 498123,
    });
    // Regular (non-LFS) file: size only, no sha256.
    expect(map.get('plain.json')).toEqual({
      name: 'plain.json',
      sha256: undefined,
      bytes: 77,
    });
    // Directories are skipped.
    expect(map.size).toBe(2);
  });

  it('returns an empty map when the request fails (best-effort)', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValue({ok: false, status: 401});
    const map = await fetchHfDirectoryIntegrityMap('https://api/tree/main');
    expect(map.size).toBe(0);
  });

  it('returns an empty map when fetch throws (offline)', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const map = await fetchHfDirectoryIntegrityMap('https://api/tree/main');
    expect(map.size).toBe(0);
  });
});
