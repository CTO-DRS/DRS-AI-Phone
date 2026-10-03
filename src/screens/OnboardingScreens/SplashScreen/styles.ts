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
  });
