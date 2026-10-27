/* eslint-disable no-bitwise */
/**
 * Minimal, dependency-free SHA-256 (FIPS 180-4).
 *
 * Two consumers:
 *  - `sha256Hex(input)` hashes short UTF-8 strings (Google sign-in nonce,
 *    audit finding F-08 / recommendation R-08: the raw nonce goes to
 *    Google, the hash goes to Supabase `signInWithIdToken`).
 *  - `IncrementalSha256` feeds arbitrary byte chunks — used by
 *    `fileSha256.ts` to hash multi-GB model files in bounded-memory chunks
 *    (audit AI-02: the native RNFS hasher is unreliable beyond ~4 GiB,
 *    see https://github.com/birdofpreyru/react-native-fs/issues/99).
 */

// Round constants: first 32 bits of the fractional parts of the cube roots
// of the first 64 primes.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** UTF-8 encode a string to a byte array (no TextEncoder dependency). */
function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        // Surrogate pair -> astral code point
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/**
 * Incremental SHA-256 over raw byte chunks (FIPS 180-4). Single-use:
 * call `update()` any number of times, then `digestHex()` once.
 *
 * Bounded memory: only one 64-byte block buffer + scratch words are held,
 * so a multi-GB model file can be hashed in fixed-size chunks without ever
 * materializing the file in JS memory.
 */
export class IncrementalSha256 {
  private readonly h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly pending = new Uint8Array(64);
  private pendingLen = 0;
  private totalBytes = 0;
  private readonly w = new Uint32Array(64);

  update(bytes: Uint8Array): void {
    this.totalBytes += bytes.length;
    let offset = 0;

    // Top up a partially filled block first.
    if (this.pendingLen > 0) {
      const take = Math.min(64 - this.pendingLen, bytes.length);
      this.pending.set(bytes.subarray(0, take), this.pendingLen);
      this.pendingLen += take;
      offset = take;
      if (this.pendingLen === 64) {
        this.compress(this.pending, 0);
        this.pendingLen = 0;
      }
    }

    // Compress whole blocks directly from the input.
    while (offset + 64 <= bytes.length) {
      this.compress(bytes, offset);
      offset += 64;
    }

    // Buffer the tail (< 64 bytes).
    if (offset < bytes.length) {
      this.pending.set(bytes.subarray(offset), 0);
      this.pendingLen = bytes.length - offset;
    }
  }

  digestHex(): string {
    // Total bit length as a 64-bit big-endian pair. totalBytes stays a safe
    // integer below 2^53, so totalBytes * 8 is exact for any practical file.
    const totalBits = this.totalBytes * 8;
    const bitLenHi = Math.floor(totalBits / 0x100000000);
    const bitLenLo = totalBits % 0x100000000;

    // Padding after the pending bytes: 0x80 + zeros + 8-byte big-endian bit
    // length, sized so that pendingLen + padLen is a multiple of 64.
    let zeros = (55 - this.pendingLen) % 64;
    if (zeros < 0) {
      zeros += 64;
    }
    const padLen = 1 + zeros + 8;
    const pad = new Uint8Array(padLen);
    pad[0] = 0x80;
    const lenPos = padLen - 8;
    pad[lenPos] = (bitLenHi >>> 24) & 0xff;
    pad[lenPos + 1] = (bitLenHi >>> 16) & 0xff;
    pad[lenPos + 2] = (bitLenHi >>> 8) & 0xff;
    pad[lenPos + 3] = bitLenHi & 0xff;
    pad[lenPos + 4] = (bitLenLo >>> 24) & 0xff;
    pad[lenPos + 5] = (bitLenLo >>> 16) & 0xff;
    pad[lenPos + 6] = (bitLenLo >>> 8) & 0xff;
    pad[lenPos + 7] = bitLenLo & 0xff;

    // pending (0..63 bytes, buffered by update()) + pad == 1 or 2 blocks.
    const combined = new Uint8Array(this.pendingLen + padLen);
    combined.set(this.pending.subarray(0, this.pendingLen), 0);
    combined.set(pad, this.pendingLen);
    for (let off = 0; off + 64 <= combined.length; off += 64) {
      this.compress(combined, off);
    }

    return Array.from(this.h)
      .map(x => x.toString(16).padStart(8, '0'))
      .join('');
  }

  private compress(block: Uint8Array, blockOffset: number): void {
    const w = this.w;
    for (let t = 0; t < 16; t++) {
      const i = blockOffset + t * 4;
      w[t] =
        ((block[i] << 24) |
          (block[i + 1] << 16) |
          (block[i + 2] << 8) |
          block[i + 3]) >>>
        0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = this.h[0];
    let b = this.h[1];
    let c = this.h[2];
    let d = this.h[3];
    let e = this.h[4];
    let f = this.h[5];
    let g = this.h[6];
    let h = this.h[7];

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0;
    this.h[5] = (this.h[5] + f) >>> 0;
    this.h[6] = (this.h[6] + g) >>> 0;
    this.h[7] = (this.h[7] + h) >>> 0;
  }
}

/** Compute the SHA-256 digest of `input` and return it as lowercase hex. */
export function sha256Hex(input: string): string {
  const hasher = new IncrementalSha256();
  hasher.update(new Uint8Array(utf8Bytes(input)));
  return hasher.digestHex();
}
