/**
 * Arabic contextual shaping for PDF export.
 *
 * PDF text drawing has no OpenType shaping (GSUB) pipeline, so Arabic must be
 * pre-mapped to its Unicode presentation forms (U+FB50–U+FEFF) before it is
 * handed to the font. This module implements the standard contextual-forms
 * table used by reshapers: isolated / final / initial / medial, the lam-alef
 * ligatures, and transparency for combining marks (tashkeel).
 *
 * The table covers the core Arabic block plus the common Persian/Urdu
 * extensions (پ چ ژ گ ک ں ھ ے ...). Letters without an entry fall back to
 * their raw codepoint, which the font renders in isolated form — readable,
 * just not joined.
 */

// [isolated, final, initial, medial] — null = form does not exist.
const FORMS: Record<number, [number, number, number | null, number | null]> = {
  0x0621: [0xfe80, 0xfe80, null, null], // ء
  0x0622: [0xfe81, 0xfe82, null, null], // آ
  0x0623: [0xfe83, 0xfe84, null, null], // أ
  0x0624: [0xfe85, 0xfe86, null, null], // ؤ
  0x0625: [0xfe87, 0xfe88, null, null], // إ
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], // ئ
  0x0627: [0xfe8d, 0xfe8e, null, null], // ا
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], // ب
  0x0629: [0xfe93, 0xfe94, null, null], // ة
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], // ت
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], // ث
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], // ج
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4], // ح
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], // خ
  0x062f: [0xfea9, 0xfeaa, null, null], // د
  0x0630: [0xfeab, 0xfeac, null, null], // ذ
  0x0631: [0xfead, 0xfeae, null, null], // ر
  0x0632: [0xfeaf, 0xfeb0, null, null], // ز
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], // س
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8], // ش
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], // ص
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0], // ض
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4], // ط
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8], // ظ
  0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc], // ع
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0], // غ
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640], // ـ tatweel
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4], // ف
  0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8], // ق
  0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc], // ك
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0], // ل
  0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4], // م
  0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8], // ن
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec], // ه
  0x0648: [0xfeed, 0xfeee, null, null], // و
  0x0649: [0xfeef, 0xfef0, null, null], // ى
  0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4], // ي
  0x0671: [0xfb50, 0xfb51, null, null], // ٱ
  0x0679: [0xfb66, 0xfb67, 0xfb68, 0xfb69], // ٹ
  0x067a: [0xfb5a, 0xfb5b, 0xfb5c, 0xfb5d], // ٺ
  0x067b: [0xfb56, 0xfb57, 0xfb58, 0xfb59], // پ
  0x0680: [0xfb52, 0xfb53, 0xfb54, 0xfb55], // ٻ
  0x0683: [0xfb76, 0xfb77, 0xfb78, 0xfb79], // ڄ
  0x0684: [0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d], // ڄ
  0x0686: [0xfb7e, 0xfb7f, 0xfb80, 0xfb81], // چ
  0x0688: [0xfb88, 0xfb89, null, null], // ڈ
  0x068c: [0xfb84, 0xfb85, null, null], // ڈ
  0x068d: [0xfb86, 0xfb87, null, null], // ڊ
  0x0691: [0xfb8c, 0xfb8d, null, null], // ڑ
  0x0698: [0xfb8a, 0xfb8b, null, null], // ژ
  0x06a4: [0xfb6a, 0xfb6b, 0xfb6c, 0xfb6d], // ڤ
  0x06a9: [0xfb8e, 0xfb8f, 0xfb90, 0xfb91], // ک
  0x06af: [0xfb92, 0xfb93, 0xfb94, 0xfb95], // گ
  0x06b3: [0xfb96, 0xfb97, 0xfb98, 0xfb99], // ڳ
  0x06ba: [0xfb9e, 0xfb9f, null, null], // ں
  0x06bb: [0xfba0, 0xfba1, 0xfba2, 0xfba3], // ڻ
  0x06be: [0xfbaa, 0xfbab, 0xfbac, 0xfbad], // ھ
  0x06c0: [0xfba4, 0xfba5, null, null], // ۀ
  0x06c1: [0xfba6, 0xfba7, 0xfba8, 0xfba9], // ہ
  0x06d2: [0xfbae, 0xfbaf, null, null], // ے
};

// lam + alef variant -> [isolated ligature, final ligature]
const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xfef5, 0xfef6], // لآ
  0x0623: [0xfef7, 0xfef8], // لأ
  0x0625: [0xfef9, 0xfefa], // لإ
  0x0627: [0xfefb, 0xfefc], // لا
};

/** Combining marks are transparent for joining purposes. */
const TRANSPARENT = new Set<number>();
for (let cp = 0x064b; cp <= 0x065f; cp++) {
  TRANSPARENT.add(cp);
}
[0x0670, 0x0653, 0x0654, 0x0655].forEach(cp => TRANSPARENT.add(cp));

export const isTransparentMark = (cp: number): boolean => TRANSPARENT.has(cp);

/** True for characters in the Arabic script ranges (letters + marks). */
export const isArabicChar = (cp: number): boolean =>
  (cp >= 0x0600 && cp <= 0x06ff) ||
  (cp >= 0x0750 && cp <= 0x077f) ||
  (cp >= 0x08a0 && cp <= 0x08ff) ||
  (cp >= 0xfb50 && cp <= 0xfdff) ||
  (cp >= 0xfe70 && cp <= 0xfeff);

/** Arabic letters that participate in joining (marks excluded). */
const isArabicLetter = (cp: number): boolean =>
  ((cp >= 0x0620 && cp <= 0x064a) ||
    (cp >= 0x066e && cp <= 0x06d3) ||
    (cp >= 0x0750 && cp <= 0x077f)) &&
  !TRANSPARENT.has(cp);

// does this letter connect forward to the next letter? (dual-joining)
const connectsForward = (cp: number): boolean =>
  FORMS[cp] != null && FORMS[cp][2] !== null;

// does this letter accept a connection from the previous letter? (final form)
const acceptsBackward = (cp: number): boolean =>
  FORMS[cp] != null && FORMS[cp][1] !== null;

/**
 * Shape a single word (no spaces) into Unicode presentation forms.
 * Joining context never crosses whitespace, so shaping is applied per word.
 */
export const shapeArabicWord = (word: string): string => {
  const chars = [...word];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0) as number;
    if (!isArabicLetter(cp)) {
      out.push(chars[i]);
      continue;
    }
    // Neighbouring letters, skipping transparent combining marks.
    let prevCp: number | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const p = chars[j].codePointAt(0) as number;
      if (TRANSPARENT.has(p)) {
        continue;
      }
      prevCp = p;
      break;
    }
    let nextCp: number | null = null;
    for (let j = i + 1; j < chars.length; j++) {
      const n = chars[j].codePointAt(0) as number;
      if (TRANSPARENT.has(n)) {
        continue;
      }
      nextCp = n;
      break;
    }
    const forms = FORMS[cp];
    if (!forms) {
      out.push(chars[i]);
      continue;
    }
    // Correct joining semantics:
    //  - this letter joins FROM prev iff it has a final form and prev
    //    connects forward (prev has an initial form);
    //  - this letter joins TO next iff it has an initial form and next
    //    accepts a backward join (next has a final form).
    const fromPrev =
      forms[1] !== null && prevCp !== null && connectsForward(prevCp);
    const fromNext =
      forms[2] !== null && nextCp !== null && acceptsBackward(nextCp);

    // lam-alef mandatory ligatures
    if (cp === 0x0644 && nextCp !== null && LAM_ALEF[nextCp]) {
      out.push(String.fromCodePoint(LAM_ALEF[nextCp][fromPrev ? 1 : 0]));
      i++; // step past lam onto the alef (or marks between them)
      while (
        i < chars.length &&
        TRANSPARENT.has(chars[i].codePointAt(0) as number)
      ) {
        i++; // marks that sat between lam and alef are absorbed
      }
      // `i` points at the alef; the for-loop increment steps past it
      continue;
    }

    let idx: number;
    if (fromPrev && fromNext && forms[3] !== null) {
      idx = 3;
    } else if (fromPrev && forms[1] !== null) {
      idx = 1;
    } else if (fromNext && forms[2] !== null) {
      idx = 2;
    } else {
      idx = 0;
    }
    out.push(String.fromCodePoint(forms[idx] ?? cp));
  }
  return out.join('');
};

/** True if the text contains any Arabic script character. */
export const containsArabic = (text: string): boolean =>
  [...text].some(c => isArabicChar(c.codePointAt(0) as number));
