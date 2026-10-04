import React, {useContext} from 'react';
import {Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';

import {DrsAiMark} from '../../../assets/onboarding/illustrations';
import {BrandGradient} from '../../../components';
import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {ROUTES} from '../../../utils/navigationConstants';
import {createStyles} from './styles';

const SPLASH_MIN_DWELL_MS = 600;

/**
 * Brand splash — post-hydration, pre-Onboarding-1. Renders the DRS AI
 * robot-head mark with the DRS AI wordmark on the brand gradient, then
 * transitions after `SPLASH_MIN_DWELL_MS`. Mirrors the native launch
 * screen (Android `bg_splash` / iOS LaunchScreen) so the hand-off from
 * native → JS is visually seamless.
 */
export const SplashScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  React.useEffect(() => {
    const t = setTimeout(() => {
      navigation.replace(ROUTES.ONBOARDING.STEP_1);
    }, SPLASH_MIN_DWELL_MS);
    return () => clearTimeout(t);
  }, [navigation]);

  return (
    <BrandGradient
      testID="onboarding-splash"
      style={styles.root}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 1}}>
      <DrsAiMark
        width={132}
        height={132}
        accessibilityLabel={l10n.onboarding.splash.brand}
        accessibilityRole="image"
      />
      <View style={styles.wordmarkBlock}>
        <Text style={styles.wordmark}>DRS AI</Text>
        <Text style={styles.tagline}>{l10n.onboarding.splash.tagline}</Text>
      </View>
    </BrandGradient>
  );
};
