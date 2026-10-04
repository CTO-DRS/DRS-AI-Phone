import {
  getAssistantDisplayLabel,
  getAssistantActionText,
  isAssistantFree,
  isAssistantPremium,
  getPremiumInfoText,
  shouldShowAssistantContent,
} from '../drshub-display';
import {
  mockDrshubAssistant,
  mockPremiumDrshubAssistant,
  mockOwnedPremiumAssistant,
  mockPrivateDrshubAssistant,
} from '../../../jest/fixtures/assistants';

describe('drshub-display', () => {
  describe('getAssistantDisplayLabel', () => {
    it('returns free label for free assistants', () => {
      const label = getAssistantDisplayLabel(mockDrshubAssistant);
      expect(label.type).toBe('free');
      expect(label.showLabel).toBe(true);
    });

    it('returns premium label for reveal_on_purchase assistants', () => {
      const label = getAssistantDisplayLabel(mockPremiumDrshubAssistant);
      expect(label.type).toBe('premium');
      expect(label.showLabel).toBe(true);
    });

    it('returns locked label for private paid assistants', () => {
      // mockPrivateDrshubAssistant has price_cents: 0 (inherited from free assistant),
      // so we need a paid private assistant to trigger the 'locked' label
      const paidPrivateAssistant = {
        ...mockPrivateDrshubAssistant,
        price_cents: 500,
      };
      const label = getAssistantDisplayLabel(paidPrivateAssistant);
      expect(label.type).toBe('locked');
      expect(label.showLabel).toBe(true);
    });
  });

  describe('isAssistantFree', () => {
    it('returns true for free assistants', () => {
      expect(isAssistantFree(mockDrshubAssistant)).toBe(true);
    });

    it('returns false for premium assistants', () => {
      expect(isAssistantFree(mockPremiumDrshubAssistant)).toBe(false);
    });
  });

  describe('isAssistantPremium', () => {
    it('returns true for premium assistants', () => {
      expect(isAssistantPremium(mockPremiumDrshubAssistant)).toBe(true);
    });

    it('returns false for free assistants', () => {
      expect(isAssistantPremium(mockDrshubAssistant)).toBe(false);
    });
  });

  describe('getAssistantActionText', () => {
    it('returns download text for owned assistants', () => {
      const text = getAssistantActionText(mockOwnedPremiumAssistant, true);
      expect(text).not.toBeNull();
    });

    it('returns get free text for free assistants', () => {
      const text = getAssistantActionText(mockDrshubAssistant, false);
      expect(text).not.toBeNull();
    });

    it('returns null for unowned premium assistants', () => {
      const text = getAssistantActionText(mockPremiumDrshubAssistant, false);
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

  describe('shouldShowAssistantContent', () => {
    it('returns true for free public assistants', () => {
      expect(shouldShowAssistantContent(mockDrshubAssistant)).toBe(true);
    });

    it('returns false for unowned premium assistants', () => {
      expect(shouldShowAssistantContent(mockPremiumDrshubAssistant)).toBe(
        false,
      );
    });

    it('returns true for owned premium assistants', () => {
      expect(shouldShowAssistantContent(mockOwnedPremiumAssistant)).toBe(true);
    });
  });
});
