/**
 * Nonce contract tests (fix 2 companion — DORMANT module).
 * src/utils/nonce.ts is deliberately NOT wired into sign-in
 * (@react-native-google-signin v16.0.0/16.1.5 verified nonce-free). These
 * tests pin the contract so wiring up later is a three-line change, exactly
 * as the module header promises. Pure TS — no timers, no handles, no logs.
 */
import {generateNonce, hashNonce} from '../nonce';

describe('nonce contract (dormant — replay protection ready)', () => {
  it('generateNonce: 64 hex chars of fresh 32-byte entropy per call', () => {
    const raw = generateNonce();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    const again = generateNonce();
    expect(again).not.toBe(raw);
    // 32 bytes of entropy decode back from the hex payload
    expect(Buffer.from(raw, 'hex').length).toBe(32);
  });

  it('hashNonce: SHA-256 of the raw nonce per FIPS vectors — raw never equals hashed', () => {
    // FIPS 180-4 vector: sha256('abc')
    expect(hashNonce('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const raw = generateNonce();
    const hashed = hashNonce(raw);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toBe(raw);
  });
});
