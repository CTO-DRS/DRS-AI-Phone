import {detectBaseDirection, layoutParagraph, toVisualLine} from '../bidiText';

const measure = (text: string, font: 'arabic' | 'latin') =>
  // Deterministic fake metrics: 1pt per char, wider for Arabic.
  text.length * (font === 'arabic' ? 1.2 : 1);

describe('bidiText', () => {
  describe('detectBaseDirection', () => {
    it('detects RTL for Arabic-leading text', () => {
      expect(detectBaseDirection('مرحبا بالعالم')).toBe(true);
    });

    it('detects LTR for Latin-leading text', () => {
      expect(detectBaseDirection('Hello world')).toBe(false);
    });

    it('defaults to LTR for empty/neutral text', () => {
      expect(detectBaseDirection('123 !?')).toBe(false);
      expect(detectBaseDirection('')).toBe(false);
    });
  });

  describe('toVisualLine', () => {
    it('keeps LTR islands (English + digits) intact inside RTL lines', () => {
      // Shaped Arabic words around an English phrase and a number.
      const words = ['ﺹﻧ', 'ﻉﺮﺒﻳ', 'English', 'words', '1234'];
      const visual = toVisualLine(words, true);
      expect(visual).toContain('English');
      expect(visual).toContain('1234');
      // The English phrase keeps its internal word order (UAX #9 neutral
      // resolution: the space between two LTR words joins the island).
      expect(visual).toMatch(/English words/);
    });

    it('keeps digits as a coherent LTR run', () => {
      const visual = toVisualLine(['ﺔﻨﺴ', '2026'], true);
      expect(visual).toContain('2026');
    });

    it('mirrors brackets in RTL context', () => {
      const plain = toVisualLine(['و', '(x)'], true);
      // Without mirroring, a full reversal leaves the parentheses
      // directionally identical to the logical ones; with mirroring the
      // open/close glyphs swap.
      const reversedNoMirror = 'و (x)'.split('').reverse().join('');
      expect(plain).not.toBe(reversedNoMirror);
    });
  });

  describe('layoutParagraph', () => {
    it('wraps long paragraphs into multiple lines', () => {
      const lines = layoutParagraph('one two three four five six seven eight', {
        maxWidth: 10,
        spaceWidth: 1,
        measure,
      });
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line.width).toBeLessThanOrEqual(10);
      }
    });

    it('produces RTL lines for Arabic text', () => {
      const [line] = layoutParagraph('مرحبا بالعالم', {
        maxWidth: 500,
        spaceWidth: 1,
        measure,
      });
      expect(line.rtl).toBe(true);
      expect(line.runs.length).toBeGreaterThan(0);
      expect(line.runs[0].font).toBe('arabic');
    });

    it('splits mixed-script visual lines into font runs', () => {
      const lines = layoutParagraph('نص English نص', {
        maxWidth: 500,
        spaceWidth: 1,
        measure,
      });
      expect(lines.length).toBe(1);
      const fonts = new Set(lines[0].runs.map(r => r.font));
      expect(fonts.has('arabic')).toBe(true);
      expect(fonts.has('latin')).toBe(true);
    });

    it('hard-breaks words longer than the line width', () => {
      const lines = layoutParagraph('aaaaaaaaaaaa', {
        maxWidth: 5,
        spaceWidth: 1,
        measure,
      });
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line.width).toBeLessThanOrEqual(5);
      }
    });

    it('returns no lines for empty input', () => {
      expect(
        layoutParagraph('   ', {maxWidth: 100, spaceWidth: 1, measure}),
      ).toEqual([]);
    });

    it('replaces characters the latin font cannot encode', () => {
      const lines = layoutParagraph('emoji 🎉 here', {
        maxWidth: 500,
        spaceWidth: 1,
        measure,
      });
      const text = lines[0].runs.map(r => r.text).join('');
      expect(text).not.toContain('🎉');
      expect(text).toContain('?');
    });
  });
});
