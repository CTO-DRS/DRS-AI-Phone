import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scroll: {
      padding: 16,
      gap: 8,
    },
    description: {
      ...theme.fonts.bodyMedium,
      color: theme.colors.onBackground,
      opacity: 0.8,
      marginBottom: 4,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
    },
    button: {
      flex: 1,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      marginTop: 8,
    },
    reportText: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurface,
      fontFamily: 'monospace',
      fontSize: 11,
    },
    empty: {
      ...theme.fonts.bodyMedium,
      color: theme.colors.onSurface,
      opacity: 0.6,
    },
    eventRow: {
      marginBottom: 10,
    },
    eventTime: {
      ...theme.fonts.labelSmall,
      color: theme.colors.primary,
      fontFamily: 'monospace',
    },
    eventMsg: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurface,
      marginTop: 2,
    },
    eventDetail: {
      ...theme.fonts.labelSmall,
      color: theme.colors.onSurface,
      opacity: 0.7,
      fontFamily: 'monospace',
      fontSize: 10,
      marginTop: 4,
      paddingLeft: 8,
    },
  });
