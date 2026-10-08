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
      width: '82%',
      maxHeight: '70%',
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.dark
        ? theme.colors.outline + '50'
        : theme.colors.outline + '30',
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.onSurface,
      textAlign: 'center',
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.dark
        ? theme.colors.outline + '50'
        : theme.colors.outline + '30',
    },
    body: {
      padding: 16,
    },
    label: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 6,
    },
    textInput: {
      padding: 12,
      marginBottom: 12,
      minHeight: 60,
      textAlignVertical: 'top',
      backgroundColor: theme.dark
        ? theme.colors.surfaceVariant + '80'
        : theme.colors.surface + '90',
      color: theme.colors.onSurface,
      fontSize: 16,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: theme.dark
        ? theme.colors.outline + '50'
        : theme.colors.outline + '30',
      borderRadius: 10,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: theme.dark
        ? theme.colors.outline + '50'
        : theme.colors.outline + '30',
      backgroundColor: theme.dark
        ? theme.colors.surfaceVariant + '60'
        : theme.colors.surface,
    },
    chipActive: {
      backgroundColor: theme.colors.primaryContainer,
      borderColor: theme.colors.primary,
    },
    chipText: {
      fontSize: 13,
      color: theme.colors.onSurface,
    },
    buttonContainer: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.dark
        ? theme.colors.outline + '50'
        : theme.colors.outline + '30',
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: theme.dark
        ? theme.colors.outline + '50'
        : theme.colors.outline + '30',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 16,
      fontWeight: '400',
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
  });
