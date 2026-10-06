import {sha256Hex} from '../sha256';

describe('sha256Hex', () => {
  it('hashes the empty string (FIPS 180-4 vector)', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes "abc" (FIPS 180-4 vector)', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the two-block FIPS 180-4 vector', () => {
    expect(
      sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('hashes the classic pangram', () => {
    expect(sha256Hex('The quick brown fox jumps over the lazy dog')).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    );
  });

  it('is deterministic and 64 hex chars long', () => {
    const a = sha256Hex('drs-ai-phone nonce');
    const b = sha256Hex('drs-ai-phone nonce');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles non-ASCII (UTF-8 multibyte) input', () => {
    // Reference: node -e "console.log(require('crypto').createHash('sha256').update('مرحبا').digest('hex'))"
    expect(sha256Hex('مرحبا')).toBe(
      '80eff1a750bb540045622ad23c148c8875790515e3f768c77d5dff8c1d221b49',
    );
  });

  it('handles input spanning multiple compression blocks', () => {
    const long = 'a'.repeat(200); // 200 bytes > 64-byte block, needs padding path
    // Reference: node -e "console.log(require('crypto').createHash('sha256').update(Buffer.alloc(200, 0x61)).digest('hex'))"
    expect(sha256Hex(long)).toBe(
      'c2a908d98f5df987ade41b5fce213067efbcc21ef2240212a41e54b5e7c28ae5',
    );
  });
});
