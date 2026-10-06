/**
 * Cryptographically strong nonce generation for Google sign-in (F-08).
 *
 * NOTE: currently NOT wired into the sign-in flow —
 * `@react-native-google-signin/google-signin` v16 exposes no nonce option,
 * so `signInWithIdToken` runs without replay protection until upstream
 * support exists (see the note in AuthService.signInWithGoogle). This
 * helper + sha256.ts are kept tested and ready so wiring the flow up is a
 * three-line change once the SDK cooperates.
 *
 * Flow (per Supabase's documented React Native pattern):
 *   1. `generateNonce()` produces a random hex string (the "raw nonce").
 *   2. The raw nonce is handed to Google via `GoogleSignin.configure({nonce})`.
 *      Google embeds its SHA-256 hash into the ID token's `nonce` claim.
 *   3. `hashNonce(rawNonce)` is passed to `supabase.auth.signInWithIdToken`,
 *      letting Supabase verify the claim and block token replay/reuse.
 */

// Registers crypto.getRandomValues on the Hermes global (already a project
// dependency; ModelStore imports it the same way).
import 'react-native-get-random-values';

import {sha256Hex} from './sha256';

const NONCE_BYTES = 32; // 256 bits of entropy

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Generate a cryptographically strong random nonce (64 hex chars). */
export function generateNonce(byteLength: number = NONCE_BYTES): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/** SHA-256 hash of a raw nonce, as Supabase's signInWithIdToken expects. */
export function hashNonce(rawNonce: string): string {
  return sha256Hex(rawNonce);
}
