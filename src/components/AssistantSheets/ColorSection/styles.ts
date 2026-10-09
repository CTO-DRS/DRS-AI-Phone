import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    pickerContainer: {
      flexDirection: 'row',
      paddingVertical: 8,
      gap: 12,
    },
    colorButtonContainer: {
      width: 28,
      height: 28,
      borderRadius: 100,
      borderWidth: 1,
      // Theme-aware chrome (v1.36.0): hardcoded near-black border on a
      // hardcoded white disc glared on the dark-themed sheet.
      borderColor: theme.colors.outlineVariant,
      padding: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceContainerHighest,
    },
    colorButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      overflow: 'hidden',
      flexDirection: 'row',
      transform: [{rotate: '45deg'}],
    },
    colorHalf: {
      width: '50%',
      height: '100%',
    },
    rightHalf: {
      borderLeftWidth: 0.5,
      borderLeftColor: theme.colors.outlineVariant,
    },
    selectedColorButtonContainer: {
      width: 30,
      height: 30,
      borderColor: theme.colors.onBackground,
      borderWidth: 2.5,
      shadowColor: theme.colors.onBackground,
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.3,
      shadowRadius: 2,
      elevation: 3,
    },
  });
