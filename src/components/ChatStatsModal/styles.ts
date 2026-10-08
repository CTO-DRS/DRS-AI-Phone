import {StyleSheet} from 'react-native';
import {MD3Theme} from 'react-native-paper';

export const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
      width: '84%',
      maxHeight: '75%',
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.dark
        ? theme.colors.outline + '50'
        : theme.colors.outline + '30',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.dark
        ? theme.colors.outline + '50'
        : theme.colors.outline + '30',
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.onSurface,
      flex: 1,
    },
    scroll: {
      flexGrow: 0,
    },
    scrollContent: {
      padding: 16,
    },
    statsList: {
      marginBottom: 12,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.dark
        ? theme.colors.outline + '30'
        : theme.colors.outline + '20',
    },
    statLabel: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    statValue: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    label: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 6,
    },
    topicsTitle: {
      marginTop: 4,
    },
    hint: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      paddingVertical: 12,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: theme.dark
        ? theme.colors.surfaceVariant + '80'
        : theme.colors.surfaceVariant + '60',
    },
    chipText: {
      fontSize: 13,
      color: theme.colors.onSurface,
    },
  });
