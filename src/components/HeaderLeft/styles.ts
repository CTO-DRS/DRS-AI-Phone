import {StyleSheet} from 'react-native';

import {BRAND_PURPLE} from '../../theme/tokens/brand';

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
    backgroundColor: BRAND_PURPLE,
  },
});
