import React from 'react';
import {View} from 'react-native';
import {observer} from 'mobx-react';

import {OnboardingScaffold} from '../components/OnboardingScaffold';
import {OnboardingBottomBar} from '../components/OnboardingBottomBar';
import {OnboardingContent} from '../components/OnboardingContent';
import {ItalicAccentTitle} from '../components/ItalicAccentTitle';
import {HighlightText} from '../components/HighlightText';
import {RobotMascot} from '../illustrations/AnimatedRobot';
import {useOnboardingHandlers} from '../useOnboardingHandlers';
import {styles} from './styles';

export const Onboarding4Screen: React.FC = observer(() => {
  const {l10n, next, goBack} = useOnboardingHandlers(4);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={4}
      illustration={
        <View style={styles.illustrationWrap}>
          <RobotMascot size={150} mood="shield" badge="shield" />
        </View>
      }
      content={
        <OnboardingContent
          eyebrow={t.screen4.eyebrow}
          title={
            <ItalicAccentTitle
              title={t.screen4.title}
              accent={t.screen4.titleAccent}
            />
          }
          body={
            <HighlightText
              body={t.screen4.body}
              phrases={[t.screen4.highlight]}
            />
          }
        />
      }
      bottomBar={
        <OnboardingBottomBar
          primaryLabel={t.screen4.cta}
          onPrimary={next}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
