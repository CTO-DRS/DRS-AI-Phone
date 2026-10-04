import React, {useContext, useEffect, useRef} from 'react';
import {Animated, Easing, View} from 'react-native';

import {observer} from 'mobx-react';
import {Button, Text} from 'react-native-paper';

import {createStyles} from './styles';

import {AlertIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {chatSessionStore, modelStore} from '../../store';
import {L10nContext} from '../../utils';
import {MessageType, ModelOrigin} from '../../utils/types';
import {resolveBannerVariant} from '../../utils/bannerVariantResolver';
import {talentRegistry} from '../../services/talents';
import {t} from '../../locales';
import {BRAND_BLUE} from '../../theme/tokens/brand';

interface BannerRowProps {
  messages: MessageType.Any[];
  htmlPreviewCount: number;
  // True when at least one larger context tier fits the device. Gates the
  // increase CTA's visibility (the sheet owns the actual target).
  canIncrease: boolean;
  onIncreaseContext: () => void;
  onNewChat: () => void;
}

// Append an 8-bit alpha to a theme hex color (#RRGGBB or #RRGGBBAA) so the
// banner sits as a soft wash of the accent rather than a saturated fill.
const withAlpha = (hex: string, alphaHex: string): string =>
  (hex.length === 9 ? hex.slice(0, 7) : hex) + alphaHex;

// Heavy-talent name for the full-banner sub-copy: the newest assistant turn's
// first tool call whose engine declares a recommended context. Declarative
// only — never moves the banner trigger.
function deriveHeavyTalentName(
  messages: MessageType.Any[],
): string | undefined {
  const latestTurn = messages.find(m => m.type === 'assistant_turn') as
    | MessageType.AssistantTurn
    | undefined;
  for (const step of latestTurn?.steps ?? []) {
    for (const call of step.toolCalls ?? []) {
      const name = call.function?.name;
      if (name && talentRegistry.get(name)?.recommendedContextTokens != null) {
        return name;
      }
    }
  }
  return undefined;
}

const Meter: React.FC<{
  ratio: number;
  tint: string;
  styles: ReturnType<typeof createStyles>;
}> = ({ratio, tint, styles}) => (
  <View
    style={styles.bannerMeter}
    testID="banner-meter"
    accessibilityElementsHidden
    importantForAccessibility="no">
    <View
      style={[
        styles.bannerMeterFill,
        {
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          backgroundColor: tint,
        },
      ]}
    />
  </View>
);

/** Circular badge cradling the alert glyph — softens the warning tone. */
const AlertBadge: React.FC<{
  stroke: string;
  background: string;
  styles: ReturnType<typeof createStyles>;
}> = ({stroke, background, styles}) => (
  <View style={[styles.bannerIconBadge, {backgroundColor: background}]}>
    <AlertIcon width={14} height={14} stroke={stroke} />
  </View>
);

/** Rounded pill that carries the context percentage. */
const PercentPill: React.FC<{
  label: string;
  color: string;
  background: string;
  styles: ReturnType<typeof createStyles>;
  testID?: string;
}> = ({label, color, background, styles, testID}) => (
  <View style={[styles.bannerPercentPill, {backgroundColor: background}]}>
    <Text style={[styles.bannerPercent, {color}]} testID={testID}>
      {label}
    </Text>
  </View>
);

/**
 * The single chat-input banner slot. Renders the one variant resolved from the
 * completion snapshot and current model state, or the existing HTML soft-cap
 * sub-case. Dismiss writes back to the store; recovery CTAs are handled by
 * the host.
 *
 * Creative pass: the banner now enters with a soft drop-and-fade, sits as a
 * rounded card, and carries its accent as a glowing meter + pill instead of
 * flat top/bottom rules.
 */
export const BannerRow: React.FC<BannerRowProps> = observer(
  ({messages, htmlPreviewCount, canIncrease, onIncreaseContext, onNewChat}) => {
    const theme = useTheme();
    const styles = createStyles({theme});
    const l10n = useContext(L10nContext);

    const entrance = useRef(new Animated.Value(0)).current;

    const error = theme.colors.error;
    const tint = {
      warning: {
        backgroundColor: withAlpha(error, '14'),
        borderColor: withAlpha(error, '40'),
      },
      full: {
        backgroundColor: withAlpha(error, '22'),
        borderColor: withAlpha(error, '66'),
      },
      neutral: {
        backgroundColor: theme.colors.surfaceVariant,
        borderColor: theme.colors.outline,
      },
    };

    const isRemote = modelStore.activeModel?.origin === ModelOrigin.REMOTE;

    const effectiveNCtx = modelStore.activeModelCaps.effectiveContextLength;

    const {variant, heavyTalentName, ratio} = resolveBannerVariant(
      chatSessionStore.lastCompletionResult,
      {
        effectiveNCtx,
        isRemote,
        htmlPreviewCount,
        activeModelId: modelStore.activeModelId,
        dismissed: chatSessionStore.dismissedBannerVariants,
        heavyTalentName: deriveHeavyTalentName(messages),
      },
    );

    useEffect(() => {
      if (variant === 'none') {
        return;
      }
      Animated.parallel([
        Animated.timing(entrance, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return () => entrance.setValue(0);
    }, [variant, entrance]);

    const entranceStyle = {
      opacity: entrance,
      transform: [
        {
          translateY: entrance.interpolate({
            inputRange: [0, 1],
            outputRange: [-10, 0],
          }),
        },
      ],
    };

    if (variant === 'none') {
      return null;
    }

    if (variant === 'html-soft-cap') {
      return (
        <Animated.View
          testID="soft-cap-warning"
          style={[styles.softCapBanner, entranceStyle]}>
          <Text style={styles.softCapBannerText}>
            {l10n.chat.softCapWarning}
          </Text>
        </Animated.View>
      );
    }

    if (variant === 'context-warning') {
      const percent = Math.round((ratio ?? 0) * 100);
      return (
        <Animated.View
          testID="context-warning-banner"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.banner, tint.warning, entranceStyle]}>
          <View style={styles.bannerHeader}>
            <AlertBadge
              stroke={error}
              background={withAlpha(error, '1A')}
              styles={styles}
            />
            <Text style={[styles.bannerText, styles.bannerHeaderText]}>
              {l10n.chat.contextWarning}
            </Text>
            <PercentPill
              label={`${percent}%`}
              color={error}
              background={withAlpha(error, '1A')}
              styles={styles}
              testID="banner-percent"
            />
          </View>
          {ratio != null ? (
            <Meter ratio={ratio} tint={error} styles={styles} />
          ) : null}
          <View style={styles.bannerActions}>
            {canIncrease ? (
              <Button
                compact
                mode="text"
                testID="context-warning-increase"
                onPress={onIncreaseContext}>
                {l10n.chat.contextMoreRoom}
              </Button>
            ) : null}
            <Button
              compact
              mode="text"
              testID="context-banner-dismiss"
              onPress={() =>
                chatSessionStore.setBannerDismissed('context-warning')
              }>
              {l10n.chat.contextBannerDismiss}
            </Button>
          </View>
        </Animated.View>
      );
    }

    if (variant === 'context-remote-hedged') {
      return (
        <Animated.View
          testID="context-remote-hedged-banner"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.banner, tint.neutral, entranceStyle]}>
          <View style={styles.bannerHeader}>
            <AlertBadge
              stroke={BRAND_BLUE}
              background={withAlpha(BRAND_BLUE, '1A')}
              styles={styles}
            />
            <Text style={[styles.bannerText, styles.bannerHeaderText]}>
              {l10n.chat.contextRemoteHedged}
            </Text>
          </View>
          <View style={styles.bannerActions}>
            <Button
              compact
              mode="text"
              testID="context-banner-dismiss"
              onPress={() =>
                chatSessionStore.setBannerDismissed('context-remote-hedged')
              }>
              {l10n.chat.contextBannerDismiss}
            </Button>
          </View>
        </Animated.View>
      );
    }

    // context-full (dismissable per draft).
    const talentNames = l10n.components.assistantSheet.talentNames;
    const heavyTalentLabel = heavyTalentName
      ? (talentNames[heavyTalentName as keyof typeof talentNames] ??
        heavyTalentName)
      : undefined;
    // Remote wins over every local variant: the escalated and heavy-talent
    // copies both carry the "increase the context size" advice, but a remote
    // model has no in-app context control, so remote always gets the single
    // remote copy (no increase clause) regardless of failure count / talent.
    const fullText = isRemote
      ? l10n.chat.contextFullRemote
      : heavyTalentLabel
        ? t(l10n.chat.contextFullHeavyTalent, {talent: heavyTalentLabel})
        : chatSessionStore.consecutiveFullFailures >= 2
          ? l10n.chat.contextFullEscalated
          : l10n.chat.contextFull;

    return (
      <Animated.View
        testID="context-full-banner"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.banner, tint.full, entranceStyle]}>
        <View style={styles.bannerHeader}>
          <AlertBadge
            stroke={error}
            background={withAlpha(error, '1F')}
            styles={styles}
          />
          <Text style={[styles.bannerText, styles.bannerHeaderText]}>
            {fullText}
          </Text>
          {ratio != null ? (
            <PercentPill
              label={`${Math.round(ratio * 100)}%`}
              color={error}
              background={withAlpha(error, '1F')}
              styles={styles}
              testID="banner-percent"
            />
          ) : null}
        </View>
        {ratio != null ? (
          <Meter ratio={ratio} tint={error} styles={styles} />
        ) : null}
        <View style={styles.bannerActions}>
          {canIncrease ? (
            <Button
              compact
              mode="text"
              testID="context-full-increase"
              onPress={onIncreaseContext}>
              {l10n.chat.contextMoreRoom}
            </Button>
          ) : null}
          <Button
            compact
            mode="text"
            testID="context-full-new-chat"
            onPress={onNewChat}>
            {l10n.chat.contextNewChat}
          </Button>
          <Button
            compact
            mode="text"
            testID="context-banner-dismiss"
            onPress={() => chatSessionStore.setBannerDismissed('context-full')}>
            {l10n.chat.contextBannerDismiss}
          </Button>
        </View>
      </Animated.View>
    );
  },
);
