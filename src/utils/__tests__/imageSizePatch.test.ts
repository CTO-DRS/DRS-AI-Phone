/**
 * Regression tests for the image-size DoS backport
 * (GHSA-5p2g-fcmc-qvqq + GHSA-w3rx-r6gpr6, fixed upstream only in
 * 2.0.3).
 *
 * metro requires image-size ^1.0.2 (the callable v1 API) and forcing v2
 * breaks the React Native bundle phase, so the upstream fix is backported
 * to 1.2.1 through patches/image-size+1.2.1.patch (patch-package). These
 * tests exist so that a lost/unapplied patch fails CI instead of silently
 * reintroducing the infinite loops: without the patch the crafted buffers
 * below hang the parser and Jest kills the test on its per-test timeout.
 */
import {imageSize} from 'image-size';

const ascii = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0));

/** JXL container whose only jxlp box declares size 0 (pre-patch: hang). */
const JXL_ZERO_SIZE_JXLP = new Uint8Array([
  // ISO-BMFF signature box: size 12, type 'JXL ', payload 0D 0A 87 0A.
  // The payload bytes matter: findBox walks boxes by their declared size,
  // so without them the ftyp box lands at the wrong offset and the
  // detector never recognizes the buffer as JXL.
  0x00,
  0x00,
  0x00,
  0x0c,
  ...ascii('JXL '),
  0x0d,
  0x0a,
  0x87,
  0x0a,
  // ftyp box: size 12, 'ftyp', brand 'jxl '
  0x00,
  0x00,
  0x00,
  0x0c,
  ...ascii('ftyp'),
  ...ascii('jxl '),
  // jxlp box: size 0, 'jxlp' — offset below never advances pre-patch
  0x00,
  0x00,
  0x00,
  0x00,
  ...ascii('jxlp'),
]);

/** ICNS file whose first entry declares length 0 (pre-patch: hang). */
const ICNS_ZERO_LENGTH_ENTRY = new Uint8Array([
  ...ascii('icns'), // magic
  0x00,
  0x00,
  0x00,
  0x10, // file length 16
  ...ascii('ic07'), // entry type
  0x00,
  0x00,
  0x00,
  0x00, // entry length 0 — never advances imageOffset
]);

/** HEIF file with an undersized ispe box (size 16 < 20: no width/height). */
const HEIF_UNDERSIZED_ISPE = new Uint8Array([
  // ftyp: size 20, 'ftyp', major brand 'mif1', minor 0, compat 'mif1'
  0x00,
  0x00,
  0x00,
  0x14,
  ...ascii('ftyp'),
  ...ascii('mif1'),
  0x00,
  0x00,
  0x00,
  0x00,
  ...ascii('mif1'),
  // meta: size 24 (8 header + 4 version/flags + 12 first child)
  0x00,
  0x00,
  0x00,
  0x18,
  ...ascii('meta'),
  0x00,
  0x00,
  0x00,
  0x00,
  // iprp: size 16, 'iprp'
  0x00,
  0x00,
  0x00,
  0x10,
  ...ascii('iprp'),
  // ipco: size 16, 'ipco'
  0x00,
  0x00,
  0x00,
  0x10,
  ...ascii('ipco'),
  // ispe: size 16 (< 20 — content cannot hold version/flags+width+height)
  0x00,
  0x00,
  0x00,
  0x10,
  ...ascii('ispe'),
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
]);

describe('image-size DoS backport (patch-package)', () => {
  it('rejects a zero-size jxlp box instead of hanging (JXL)', () => {
    expect(() => imageSize(JXL_ZERO_SIZE_JXLP as Buffer)).toThrow(
      /Invalid JXL/,
    );
  });

  it('rejects a zero-length ICNS entry instead of hanging', () => {
    expect(() => imageSize(ICNS_ZERO_LENGTH_ENTRY as Buffer)).toThrow(
      /Invalid ICNS/,
    );
  });

  it('rejects an undersized HEIF ispe box instead of reading past it', () => {
    expect(() => imageSize(HEIF_UNDERSIZED_ISPE as Buffer)).toThrow(
      /Invalid HEIF/,
    );
  });

  it('still parses a well-formed ICNS file (patch does not overreach)', () => {
    // 'icns' + file length 24 + one complete 'ic07' entry of length 16.
    const validIcns = new Uint8Array([
      ...ascii('icns'),
      0x00,
      0x00,
      0x00,
      0x18,
      ...ascii('ic07'),
      0x00,
      0x00,
      0x00,
      0x10,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
    ]);
    const result = imageSize(validIcns as Buffer);
    expect(result.width).toBe(128);
    expect(result.height).toBe(128);
    // v1 reports the entry type ('ic07'), not the container type.
    expect(result.type).toBe('ic07');
  });
});
