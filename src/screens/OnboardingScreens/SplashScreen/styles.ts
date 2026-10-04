import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';

export const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      // The brand gradient (BrandGradient) covers the canvas; keep only
      // layout here so the splash is seamless with the native launch screen.
      alignItems: 'center',
      justifyContent: 'center',
    },
    wordmarkBlock: {
      alignItems: 'center',
      marginTop: 28,
    },
    wordmark: {
      fontFamily: 'Inter-ExtraBold',
      fontSize: 34,
      lineHeight: 42,
      letterSpacing: 3.5,
      color: '#FFFFFF',
      textShadowColor: 'rgba(11, 8, 32, 0.35)',
      textShadowOffset: {width: 0, height: 2},
      textShadowRadius: 8,
    },
    tagline: {
      fontFamily: 'Inter-Medium',
      fontSize: 13.5,
      lineHeight: 19,
      letterSpacing: 0.4,
      color: 'rgba(233, 236, 255, 0.85)',
      marginTop: 6,
    },
  });
