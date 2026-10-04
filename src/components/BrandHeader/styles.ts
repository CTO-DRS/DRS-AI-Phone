import {StyleSheet} from 'react-native';

export const createStyles = () =>
  StyleSheet.create({
    container: {
      borderRadius: 16,
      marginHorizontal: 12,
      marginTop: 8,
      marginBottom: 4,
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    logoCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logo: {
      width: 34,
      height: 34,
    },
    textCol: {
      flexShrink: 1,
    },
    wordmark: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    tagline: {
      color: 'rgba(255, 255, 255, 0.85)',
      fontSize: 12,
      marginTop: 2,
    },
  });
