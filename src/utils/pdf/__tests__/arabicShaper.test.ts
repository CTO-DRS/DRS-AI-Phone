import {containsArabic, shapeArabicWord} from '../arabicShaper';

describe('arabicShaper', () => {
  it('leaves non-Arabic text untouched', () => {
    expect(shapeArabicWord('hello')).toBe('hello');
    expect(shapeArabicWord('123')).toBe('123');
  });

  it('gives word-initial dual-joining letters the initial form', () => {
    // م (meem) at the start of مرحبا must be initial (U+FEE3)
    const shaped = shapeArabicWord('مرحبا');
    expect([...shaped][0]).toBe('\uFEE3');
    // and the word ends with final alef (U+FE8E)
    expect([...shaped][4]).toBe('\uFE8E');
  });

  it('gives word-final letters the final form', () => {
    // سلام = س(initial) + لا ligature + م(isolated — alef never connects
    // forward, so the meem after the ligature stays detached)
    const shaped = shapeArabicWord('سلام');
    expect([...shaped][0]).toBe('\uFEB3');
    expect([...shaped]).toContain('\uFEFC');
    expect([...shaped][2]).toBe('\uFEE1');
    // قط: ق initial + ط final
    const qat = shapeArabicWord('قط');
    expect([...qat][0]).toBe('\uFED7');
    expect([...qat][1]).toBe('\uFEC2');
  });

  it('uses medial forms between two joining letters', () => {
    // كتاب: ك initial, ت medial, ا final, ب isolated (alef never connects
    // forward, so the final ب is detached from ا)
    const shaped = shapeArabicWord('كتاب');
    expect([...shaped]).toEqual(['\uFEDB', '\uFE98', '\uFE8E', '\uFE8F']);
  });

  it('keeps right-joining letters (ر د) disconnected from the next letter', () => {
    // In درس, د must be isolated (U+FEA9) because it cannot join forward,
    // and ر in مرحبا is final (U+FEAE).
    const dars = shapeArabicWord('درس');
    expect([...dars][0]).toBe('\uFEA9');
    const mar7ba = shapeArabicWord('مرحبا');
    expect([...mar7ba][1]).toBe('\uFEAE');
  });

  it('forms the isolated lam-alef ligature at word start', () => {
    const shaped = shapeArabicWord('لا');
    expect(shaped).toBe('\uFEFB');
  });

  it('forms the final lam-alef ligature after a joining letter', () => {
    // السلام: the second lam is joined from س, so lam-alef is final U+FEFC;
    // the trailing meem stays isolated (alef never connects forward).
    const shaped = shapeArabicWord('السلام');
    expect(shaped).toBe('\uFE8D\uFEDF\uFEB4\uFEFC\uFEE1');
  });

  it('forms lam-alef-hamza ligatures', () => {
    // لأ after a joining lam → final form U+FEF8
    const shaped = shapeArabicWord('للأ');
    expect(shaped).toContain('\uFEF8');
    const noLam = shapeArabicWord('أخذ');
    expect(noLam).not.toContain('\uFEF8');
  });

  it('treats tashkeel as transparent for joining', () => {
    // مُكَّة with marks: م stays initial, marks survive in the output
    const shaped = shapeArabicWord('مُكَّة');
    expect([...shaped][0]).toBe('\uFEE3');
    expect(shaped.length).toBeGreaterThan(3);
    expect(shaped).toContain('\u064F'); // damma
  });

  it('is idempotent on already-shaped text', () => {
    const once = shapeArabicWord('مرحبا');
    const twice = shapeArabicWord(once);
    expect(twice).toBe(once);
  });

  it('detects Arabic script text', () => {
    expect(containsArabic('مرحبا')).toBe(true);
    expect(containsArabic('hello')).toBe(false);
    expect(containsArabic('mixed نص')).toBe(true);
  });
});
