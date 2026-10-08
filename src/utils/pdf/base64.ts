/**
 * Self-contained Base64 codecs (Uint8Array <-> string).
 *
 * React Native's Hermes engine lacks Node's Buffer, and depending on the
 * runtime's atob/btoa availability is fragile — these implementations have
 * zero environment dependencies so PDF bytes can travel through
 * react-native-fs (`writeFile(..., 'base64')`) on every platform.
 */

const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    const has1 = i + 1 < len;
    const has2 = i + 2 < len;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += has1 ? B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += has2 ? B64_ALPHABET[b2 & 0x3f] : '=';
  }
  return out;
};

const B64_LOOKUP: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < B64_ALPHABET.length; i++) {
    table[B64_ALPHABET[i]] = i;
  }
  return table;
})();

export const base64ToBytes = (b64: string): Uint8Array => {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64_LOOKUP[clean[i]];
    const c1 = B64_LOOKUP[clean[i + 1]];
    const c2 = i + 2 < len ? B64_LOOKUP[clean[i + 2]] : 0;
    const c3 = i + 3 < len ? B64_LOOKUP[clean[i + 3]] : 0;
    out[p++] = (c0 << 2) | (c1 >> 4);
    if (i + 2 < len) {
      out[p++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    }
    if (i + 3 < len) {
      out[p++] = ((c2 & 0x03) << 6) | c3;
    }
  }
  return out.subarray(0, p);
};
