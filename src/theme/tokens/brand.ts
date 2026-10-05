/**
 * DRS AI brand tokens — the signature violet→blue gradient.
 *
 * The pairing is deliberately theme-independent: it reads as an accent
 * on both the light and dark surfaces, so consumers can use it without
 * branching on the active color scheme.
 */
export const BRAND_PURPLE = '#7C3AED';
export const BRAND_BLUE = '#2563EB';

/** Horizontal or diagonal brand gradient stops (start → end). */
export const BRAND_GRADIENT_COLORS: [string, string] = [
  BRAND_PURPLE,
  BRAND_BLUE,
];

/**
 * Full brand ramp with the indigo mid-stop — used for larger gradient
 * surfaces (splash, app icon, avatars) where a pure 2-stop blend reads
 * muddy in the middle. Single source of truth; native splash
 * (`bg_splash.xml`) mirrors these stops.
 */
export const BRAND_GRADIENT_RAMP: [string, string, string] = [
  BRAND_PURPLE,
  '#4F46E5',
  BRAND_BLUE,
];

/** Soft wash of the brand gradient for tinted surfaces (8-bit alpha baked in). */
export const BRAND_GRADIENT_SOFT: [string, string] = ['#7C3AED1A', '#2563EB14'];

/** Fully transparent stop used to fade the brand wash out cleanly. */
export const BRAND_WASH_FADE = '#FFFFFF00';

/** Gradient hairline height — the brand's signature under-header line. */
export const BRAND_HAIRLINE_HEIGHT = 1.5;
