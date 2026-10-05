import * as React from 'react';
import {StyleSheet} from 'react-native';
import {LinearGradient} from 'react-native-linear-gradient';

import {
  BRAND_GRADIENT_COLORS,
  BRAND_GRADIENT_SOFT,
  BRAND_HAIRLINE_HEIGHT,
  BRAND_WASH_FADE,
} from '../../theme/tokens/brand';

/**
 * Signature brand chrome for native navigation headers.
 *
 * Mirrors the treatment of the custom ChatHeader: a soft violet→blue wash
 * bleeding down from the status-bar edge plus the gradient hairline along
 * the bottom edge of the bar. Wire it via `headerBackground` on any
 * navigator so every top-level screen carries the brand without each
 * screen owning layout code.
 *
 * The wash is deliberately subtle (≤10% alpha) so header text keeps AA
 * contrast against both light and dark surfaces — no status-bar theme
 * branching required.
 */
export const BrandHeaderBackground = () => (
  <>
    {/* Soft brand wash fading to transparent at the bottom of the bar */}
    <LinearGradient
      pointerEvents="none"
      start={{x: 0, y: 0}}
      end={{x: 0, y: 1}}
      colors={[BRAND_GRADIENT_SOFT[0], BRAND_GRADIENT_SOFT[1], BRAND_WASH_FADE]}
      style={StyleSheet.absoluteFill}
    />
    {/* Gradient hairline — the brand's violet→blue signature line */}
    <LinearGradient
      pointerEvents="none"
      start={{x: 0, y: 0}}
      end={{x: 1, y: 0}}
      colors={BRAND_GRADIENT_COLORS}
      style={styles.hairline}
    />
  </>
);

const styles = StyleSheet.create({
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: BRAND_HAIRLINE_HEIGHT,
  },
});
