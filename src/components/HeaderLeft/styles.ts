import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  menuIcon: {
    // Minimum 44pt touch target for iOS accessibility guidelines
    height: 44,
    width: 44,
    marginHorizontal: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  halo: {
    borderRadius: 14,
    backgroundColor: '#7C3AED',
  },
});
