import * as React from 'react';
import {
  GestureResponderEvent,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';

import {BrandGradient} from '../BrandGradient';
import {useTheme} from '../../hooks';

import {L10nContext} from '../../utils';
import {SendIcon} from '../../assets/icons';

export interface SendButtonPropsAdditionalProps {
  touchableOpacityProps?: TouchableOpacityProps;
  color?: string;
}

export interface SendButtonProps extends SendButtonPropsAdditionalProps {
  /** Callback for send button tap event */
  onPress: () => void;
}

export const SendButton = ({
  onPress,
  color,
  touchableOpacityProps,
}: SendButtonProps) => {
  const l10n = React.useContext(L10nContext);
  const theme = useTheme();
  const handlePress = (event: GestureResponderEvent) => {
    onPress();
    touchableOpacityProps?.onPress?.(event);
  };

  return (
    <TouchableOpacity
      accessibilityLabel={l10n.components.sendButton.accessibilityLabel}
      accessibilityRole="button"
      testID="send-button"
      {...touchableOpacityProps}
      onPress={handlePress}
      style={styles.sendButton}>
      {theme.icons?.sendButtonIcon?.() ?? (
        <BrandGradient circle={36} style={styles.gradient}>
          <SendIcon stroke={color ?? '#FFFFFF'} width={22} height={22} />
        </BrandGradient>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  sendButton: {
    marginLeft: 16,
    // Minimum 40pt touch target for accessibility
    minHeight: 40,
    minWidth: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    // Soft elevation so the gradient chip reads as a raised action.
    shadowColor: '#7C3AED',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
});
