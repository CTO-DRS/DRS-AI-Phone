import React, {useContext, useEffect, useRef} from 'react';
import {Animated, Easing, View} from 'react-native';
import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';

import {styles} from './styles';
import {chatSessionStore, modelStore} from '../../store';
import {L10nContext} from '../../utils';

/** Live "model ready" pulse dot. */
const ModelStatusDot: React.FC<{active: boolean}> = ({active}) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1.9],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: active ? [0.4, 0] : [0, 0],
  });

  if (!active) {
    return <View style={[styles.dot, styles.dotIdle]} />;
  }

  return (
    <View style={styles.dotWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.dotHalo,
          {transform: [{scale: haloScale}], opacity: haloOpacity},
        ]}
      />
      <View style={styles.dot} />
    </View>
  );
};

export const ChatHeaderTitle: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const activeSessionId = chatSessionStore.activeSessionId;
  const activeSession = chatSessionStore.sessions.find(
    session => session.id === activeSessionId,
  );
  const activeModel = modelStore.activeModel;
  const hasModel = Boolean(activeModel?.name);

  return (
    <View style={styles.container}>
      <Text numberOfLines={1} variant="titleSmall" style={styles.sessionTitle}>
        {activeSession?.title || l10n.components.chatHeaderTitle.defaultTitle}
      </Text>
      {hasModel && (
        <View style={styles.modelRow}>
          <ModelStatusDot active={true} />
          <Text numberOfLines={1} variant="bodySmall" style={styles.modelName}>
            {activeModel?.name}
          </Text>
        </View>
      )}
    </View>
  );
});
