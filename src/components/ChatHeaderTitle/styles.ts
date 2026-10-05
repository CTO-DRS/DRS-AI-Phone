import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexShrink: 1,
    },
    sessionTitle: {
      fontWeight: '600' as const,
    },
    modelRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginTop: 2,
    },
    modelName: {
      flexShrink: 1,
      letterSpacing: 0.2,
    },
    dotWrap: {
      width: 8,
      height: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.colors.bgStatusActive,
    },
    dotIdle: {
      backgroundColor: theme.colors.bgStatusIdle,
    },
    dotHalo: {
      position: 'absolute' as const,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.bgStatusActive,
    },
  });
