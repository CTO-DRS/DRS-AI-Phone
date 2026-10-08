/**
 * Line layout for PDF export: Arabic shaping, pragmatic bidirectional
 * reordering and word wrapping.
 *
 * PDF draws glyphs strictly left-to-right in logical string order and has no
 * bidi/UBA implementation, so this module turns a logical paragraph into
 * visual lines:
 *   1. every word is shaped via `shapeArabicWord` (presentation forms),
 *   2. words are greedily wrapped to the available width,
 *   3. each line is converted to visual order (reverse for RTL base, with
 *      LTR islands re-reversed — including neutrals BETWEEN LTR chars —
 *      and bracket mirroring in RTL context),
 *   4. the visual string is split into font runs (Arabic font vs Helvetica),
 *      which the caller draws left-to-right.
 */

import {containsArabic, isArabicChar, shapeArabicWord} from './arabicShaper';

export type FontKey = 'arabic' | 'latin';

export interface TextRun {
  text: string;
  font: FontKey;
  width: number;
}

export interface LayoutLine {
  runs: TextRun[];
  width: number;
  rtl: boolean;
}

export type MeasureText = (text: string, font: FontKey) => number;

// Chars that are strongly left-to-right (letters and digits).
const LTR_STRONG = /[A-Za-z0-9\u00C0-\u024F]/;
// Chars with no intrinsic direction; they follow the surrounding context.
// Control chars are covered by \s matching for this app's sanitized input.
/* eslint-disable no-control-regex, no-useless-escape */
const NEUTRAL =
  /[\s\u0000-\u001F\u00A0(){}\[\]<>«»"''".,;:!?*#%&+\-\/=|~^@$€£¥·•]/;
/* eslint-enable no-control-regex, no-useless-escape */

// Bracket pairs mirrored when rendered inside an RTL context.
const MIRROR: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
};

// Characters the standard-font (WinAnsi) latin run can encode; anything else
// is replaced with '?' so pdf-lib never throws mid-export.
const WINANSI_SAFE =
  /[\u0020-\u007E\u00A0-\u00FF\u2018\u2019\u201C\u201D\u2013\u2014\u2022\u2026\u20AC]/;

/** Base direction from the first strong directional character. */
export const detectBaseDirection = (text: string): boolean => {
  for (const c of text) {
    const cp = c.codePointAt(0) as number;
    if (isArabicChar(cp) && !NEUTRAL.test(c)) {
      return true;
    }
    if (LTR_STRONG.test(c)) {
      return false;
    }
  }
  return false;
};

const charFont = (c: string): FontKey =>
  isArabicChar(c.codePointAt(0) as number) ? 'arabic' : 'latin';

/** Replace characters the PDF fonts cannot encode, normalise whitespace. */
export const sanitizeForPdf = (text: string): string =>
  text
    .replace(/\r\n?/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')
    .split('')
    .map(c => {
      const cp = c.codePointAt(0) as number;
      if (isArabicChar(cp) || WINANSI_SAFE.test(c)) {
        return c;
      }
      return '?';
    })
    .join('');

/**
 * Convert one shaped logical line into visual order.
 * `words` are already shaped, space-free tokens.
 */
export const toVisualLine = (words: string[], baseRTL: boolean): string => {
  const shaped = words.join(' ');
  const chars = [...shaped];
  if (!baseRTL) {
    // LTR base: keep order, reverse contiguous Arabic islands in place.
    const out: string[] = [];
    let i = 0;
    while (i < chars.length) {
      const cp = chars[i].codePointAt(0) as number;
      if (isArabicChar(cp) && !NEUTRAL.test(chars[i])) {
        let j = i;
        while (
          j < chars.length &&
          isArabicChar(chars[j].codePointAt(0) as number) &&
          !NEUTRAL.test(chars[j])
        ) {
          j++;
        }
        out.push(...chars.slice(i, j).reverse());
        i = j;
      } else {
        out.push(chars[i]);
        i++;
      }
    }
    return out.join('');
  }

  // RTL base: reverse everything, then re-reverse LTR islands. Neutrals
  // BETWEEN LTR chars belong to the island (UAX #9 neutral resolution).
  const reversed = [...chars].reverse();
  const out: string[] = [];
  let i = 0;
  while (i < reversed.length) {
    if (LTR_STRONG.test(reversed[i])) {
      let lastLTR = i;
      let k = i;
      while (k < reversed.length) {
        if (LTR_STRONG.test(reversed[k])) {
          lastLTR = k;
          k++;
        } else if (NEUTRAL.test(reversed[k])) {
          k++;
        } else {
          break;
        }
      }
      out.push(...reversed.slice(i, lastLTR + 1).reverse());
      i = lastLTR + 1;
    } else {
      const c = reversed[i];
      out.push(MIRROR[c] ?? c);
      i++;
    }
  }
  return out.join('');
};

interface WordUnit {
  shaped: string;
  width: number;
}

/** Wrap a paragraph into lines of shaped words. */
const wrapWords = (
  words: string[],
  baseRTL: boolean,
  maxWidth: number,
  spaceWidth: number,
  measure: MeasureText,
): string[][] => {
  const units: WordUnit[] = words.map(w => {
    const shaped = shapeArabicWord(w);
    let width = 0;
    for (const c of shaped) {
      width += measure(c, charFont(c));
    }
    return {shaped, width};
  });

  const lines: string[][] = [];
  let current: string[] = [];
  let currentWidth = 0;

  for (const unit of units) {
    // Hard-break words that alone exceed the line width.
    if (unit.width > maxWidth && unit.shaped.length > 0) {
      // flush current line first
      if (current.length > 0) {
        lines.push(current);
        current = [];
        currentWidth = 0;
      }
      let chunk = '';
      let chunkWidth = 0;
      for (const c of unit.shaped) {
        const w = measure(c, charFont(c));
        if (chunkWidth + w > maxWidth && chunk.length > 0) {
          lines.push([chunk]);
          chunk = '';
          chunkWidth = 0;
        }
        chunk += c;
        chunkWidth += w;
      }
      if (chunk.length > 0) {
        current = [chunk];
        currentWidth = chunkWidth;
      }
      continue;
    }

    const added =
      current.length === 0
        ? unit.width
        : currentWidth + spaceWidth + unit.width;
    if (added > maxWidth && current.length > 0) {
      lines.push(current);
      current = [unit.shaped];
      currentWidth = unit.width;
    } else {
      current.push(unit.shaped);
      currentWidth = added;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
};

export interface ParagraphLayoutOptions {
  maxWidth: number;
  spaceWidth: number;
  measure: MeasureText;
  rtl?: boolean; // force base direction; auto-detected when omitted
}

/** Lay a logical paragraph out into visual, draw-ready lines. */
export const layoutParagraph = (
  text: string,
  options: ParagraphLayoutOptions,
): LayoutLine[] => {
  const clean = sanitizeForPdf(text).trim();
  if (!clean) {
    return [];
  }
  const rtl = options.rtl ?? detectBaseDirection(clean);
  const words = clean.split(/\s+/).filter(w => w.length > 0);
  const wrapped = wrapWords(
    words,
    rtl,
    options.maxWidth,
    options.spaceWidth,
    options.measure,
  );

  return wrapped.map(lineWords => {
    const visual = toVisualLine(lineWords, rtl);
    // Group consecutive characters by font into draw runs.
    const runs: TextRun[] = [];
    let buffer = '';
    let bufferFont: FontKey | null = null;
    for (const c of visual) {
      const f = charFont(c);
      if (bufferFont !== null && f !== bufferFont) {
        runs.push({
          text: buffer,
          font: bufferFont,
          width: options.measure(buffer, bufferFont),
        });
        buffer = '';
      }
      bufferFont = f;
      buffer += c;
    }
    if (bufferFont !== null && buffer.length > 0) {
      runs.push({
        text: buffer,
        font: bufferFont,
        width: options.measure(buffer, bufferFont),
      });
    }
    return {
      runs,
      width: runs.reduce((sum, r) => sum + r.width, 0),
      rtl,
    };
  });
};

/** Convenience: does this paragraph read right-to-left? */
export const isRtlText = (text: string): boolean =>
  containsArabic(text) && detectBaseDirection(text);
