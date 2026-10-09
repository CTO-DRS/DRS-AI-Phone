import {Theme} from '../../utils/types';

/**
 * Theme-aware status palette for the models hub (v1.36.0).
 *
 * The hub previously hardcoded light-theme status colors (#059669 emerald,
 * #F59E0B amber, #2563EB blue, #7C3AED violet, #94A3B8 slate) as TEXT on
 * themed surfaces. On the dark-theme canvas (#14101F family) those collapse
 * to roughly 2:1 contrast — the same failure class as the v1.35.0 header
 * fix, just expressed through status colors instead of backgrounds.
 *
 * Each semantic role pairs a light-mode ink (600/700-weight tailwind steps,
 * readable on white) with a dark-mode ink (400-weight steps, readable on
 * near-black). Dots/badges that paint saturated FILLS can keep the raw
 * COMPAT_COLORS map — only text inks need this pairing.
 */
export interface HubStatusColors {
  /** Success / healthy (was #059669). */
  ok: string;
  /** Informational blue (was #2563EB). */
  info: string;
  /** Translucent blue wash for chip backgrounds (was #2563EB22). */
  infoSoft: string;
  /** Caution (was #F59E0B). */
  warn: string;
  /** Not recommended / danger (was #EF4444). */
  danger: string;
  /** Unknown / fallback (was #94A3B8). */
  neutral: string;
  /** Brand violet accent (was #7C3AED). */
  accent: string;
}

export const hubStatusColors = (theme: Theme): HubStatusColors =>
  theme.dark
    ? {
        ok: '#34D399', // emerald-400
        info: '#60A5FA', // blue-400 — matches dark secondary
        infoSoft: 'rgba(96, 165, 250, 0.16)',
        warn: '#FBBF24', // amber-400
        danger: '#F87171', // red-400
        neutral: '#9B94B8', // muted violet-gray
        accent: '#A78BFA', // dark primary
      }
    : {
        ok: '#059669', // emerald-600
        info: '#2563EB', // blue-600 — matches light secondary
        infoSoft: 'rgba(37, 99, 235, 0.15)',
        warn: '#B45309', // amber-700
        danger: '#DC2626', // red-600
        neutral: '#64748B', // slate-500
        accent: '#7C3AED', // light primary
      };
