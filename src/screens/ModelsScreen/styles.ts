import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    container: {
      flex: 1,
      padding: 2,
      backgroundColor: theme.colors.surface,
    },
    listContainer: {
      paddingBottom: 150,
      flexGrow: 1,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
      paddingHorizontal: 32,
      gap: 8,
    },
    emptyStateTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.onSurface,
      textAlign: 'center',
    },
    emptyStateHint: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 22,
    },
    header: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant,
    },
    filterContainer: {
      flexDirection: 'row',
      padding: 4,
      gap: 1,
      justifyContent: 'flex-end',
    },
    filterIcon: {
      borderRadius: 8,
      marginHorizontal: 2,
    },
  });
