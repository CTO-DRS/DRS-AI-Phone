import * as React from 'react';
import {AccessibilityRole, StyleProp, ViewStyle} from 'react-native';

import LinearGradient from 'react-native-linear-gradient';

/**
 * DRS AI brand gradient — the single source of truth for the violet →
 * indigo → blue ramp that also drives the native splash (`bg_splash.xml`)
 * and the app icon. Components should never hardcode these stops; import
 * `BRAND_GRADIENT_COLORS` or wrap content in `BrandGradient` instead.
 */
export const BRAND_GRADIENT_COLORS = ['#7C3AED', '#4F46E5', '#2563EB'] as const;

interface BrandGradientProps {
  /** Optional children rendered on top of the gradient. */
  children?: React.ReactNode;
  /** Container style; pass explicit width/height or use `circle`. */
  style?: StyleProp<ViewStyle>;
  /** Convenience: renders a perfect circle of the given diameter. */
  circle?: number;
  /** Gradient direction. Defaults to a diagonal top-left → bottom-right. */
  start?: {x: number; y: number};
  end?: {x: number; y: number};
  /** Passed through for tests and E2E selectors. */
  testID?: string;
  /** Passed through for accessibility. */
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
}

const circleStyle = (diameter: number): ViewStyle => ({
  width: diameter,
  height: diameter,
  borderRadius: diameter / 2,
  alignItems: 'center',
  justifyContent: 'center',
});

/**
 * Brand gradient surface. Purely presentational — no theming, no state.
 */
export const BrandGradient = ({
  children,
  style,
  circle,
  start = {x: 0, y: 0},
  end = {x: 1, y: 1},
  testID,
  accessibilityLabel,
  accessibilityRole,
}: BrandGradientProps) => {
  const baseStyle: StyleProp<ViewStyle> =
    circle != null ? circleStyle(circle) : undefined;
  const composed: StyleProp<ViewStyle> =
    baseStyle != null && style != null
      ? [baseStyle, style]
      : (style ?? baseStyle);
  return (
    <LinearGradient
      colors={BRAND_GRADIENT_COLORS as unknown as string[]}
      start={start}
      end={end}
      style={composed}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}>
      {children}
    </LinearGradient>
  );
};
