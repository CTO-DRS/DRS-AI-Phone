import React, {useContext} from 'react';
import {Animated, Easing, StyleSheet, TouchableOpacity} from 'react-native';
import {DrawerNavigationProp} from '@react-navigation/drawer';
import {useNavigation} from '@react-navigation/native';

import {styles} from './styles';
import {MenuIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

/**
 * Drawer trigger with a soft brand-accent halo that blooms behind the
 * glyph on press. Keeps the 44pt accessibility touch target.
 */
export const HeaderLeft: React.FC = () => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const navigation = useNavigation<DrawerNavigationProp<any>>();

  const press = React.useRef(new Animated.Value(0)).current;

  const animateTo = (toValue: number) =>
    Animated.timing(press, {
      toValue,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const haloOpacity = press.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.14],
  });
  const haloScale = press.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });
  const glyphNudge = press.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1.5],
  });

  return (
    <TouchableOpacity
      style={styles.menuIcon}
      testID="menu-button"
      accessibilityLabel={l10n.common.openDrawer}
      accessibilityRole="button"
      onPress={() => navigation.openDrawer()}
      onPressIn={() => animateTo(1)}
      onPressOut={() => animateTo(0)}
      activeOpacity={1}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          styles.halo,
          {opacity: haloOpacity, transform: [{scale: haloScale}]},
        ]}
      />
      <Animated.View style={{transform: [{translateX: glyphNudge}]}}>
        <MenuIcon stroke={theme.colors.primary} />
      </Animated.View>
    </TouchableOpacity>
  );
};
