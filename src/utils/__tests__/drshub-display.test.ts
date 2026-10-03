import {
  getPalDisplayLabel,
  getPalActionText,
  isPalFree,
  isPalPremium,
  getPremiumInfoText,
  shouldShowPalContent,
} from '../drshub-display';
import {
  mockDrshubPal,
  mockPremiumDrshubPal,
  mockOwnedPremiumPal,
  mockPrivateDrshubPal,
} from '../../../jest/fixtures/pals';

describe('drshub-display', () => {
  describe('getPalDisplayLabel', () => {
    it('returns free label for free pals', () => {
      const label = getPalDisplayLabel(mockDrshubPal);
      expect(label.type).toBe('free');
      expect(label.showLabel).toBe(true);
    });

    it('returns premium label for reveal_on_purchase pals', () => {
      const label = getPalDisplayLabel(mockPremiumDrshubPal);
      expect(label.type).toBe('premium');
      expect(label.showLabel).toBe(true);
    });

    it('returns locked label for private paid pals', () => {
      // mockPrivateDrshubPal has price_cents: 0 (inherited from free pal),
      // so we need a paid private pal to trigger the 'locked' label
      const paidPrivatePal = {...mockPrivateDrshubPal, price_cents: 500};
      const label = getPalDisplayLabel(paidPrivatePal);
      expect(label.type).toBe('locked');
      expect(label.showLabel).toBe(true);
    });
  });

  describe('isPalFree', () => {
    it('returns true for free pals', () => {
      expect(isPalFree(mockDrshubPal)).toBe(true);
    });

    it('returns false for premium pals', () => {
      expect(isPalFree(mockPremiumDrshubPal)).toBe(false);
    });
  });

  describe('isPalPremium', () => {
    it('returns true for premium pals', () => {
      expect(isPalPremium(mockPremiumDrshubPal)).toBe(true);
    });

    it('returns false for free pals', () => {
      expect(isPalPremium(mockDrshubPal)).toBe(false);
    });
  });

  describe('getPalActionText', () => {
    it('returns download text for owned pals', () => {
      const text = getPalActionText(mockOwnedPremiumPal, true);
      expect(text).not.toBeNull();
    });

    it('returns get free text for free pals', () => {
      const text = getPalActionText(mockDrshubPal, false);
      expect(text).not.toBeNull();
    });

    it('returns null for unowned premium pals', () => {
      const text = getPalActionText(mockPremiumDrshubPal, false);
      expect(text).toBeNull();
    });
  });

  describe('getPremiumInfoText', () => {
    it('returns a non-empty string', () => {
      const text = getPremiumInfoText();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    });
  });

  describe('shouldShowPalContent', () => {
    it('returns true for free public pals', () => {
      expect(shouldShowPalContent(mockDrshubPal)).toBe(true);
    });

    it('returns false for unowned premium pals', () => {
      expect(shouldShowPalContent(mockPremiumDrshubPal)).toBe(false);
    });

    it('returns true for owned premium pals', () => {
      expect(shouldShowPalContent(mockOwnedPremiumPal)).toBe(true);
    });
  });
});
