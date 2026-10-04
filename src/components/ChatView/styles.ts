import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    flatList: {
      height: '100%',
      // flex: 1,
    },
    flatListContentContainer: {
      flexGrow: 1,
    },
    footer: {
      height: 16,
    },
    footerLoadingPage: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
      height: 32,
    },
    header: {
      height: 4,
    },
    menu: {
      width: 170,
    },
    scrollToBottomButton: {
      position: 'absolute',
      right: 16,
      backgroundColor: theme.colors.primary,
      width: 35,
      height: 35,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    suggestedPromptsOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      zIndex: 9,
      backgroundColor: 'transparent',
    },
    inputContainer: {
      borderTopLeftRadius: theme.borders.inputBorderRadius,
      borderTopRightRadius: theme.borders.inputBorderRadius,
      position: 'absolute',
      zIndex: 10,
      left: 0,
      right: 0,
      bottom: 0,
      ...(!theme.dark
        ? {
            boxShadow: `0px -2px 8px ${theme.colors.shadow}1A`,
          }
        : {}),
    },
    chatContainer: {
      flex: 1,
      position: 'relative',
      backgroundColor: theme.colors.background,
      zIndex: 0,
    },
    headerWrapper: {
      zIndex: 100,
    },
    customBottomComponent: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    },
    softCapBanner: {
      marginHorizontal: 12,
      marginTop: 4,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      alignSelf: 'center' as const,
      backgroundColor: theme.colors.surfaceVariant,
      borderWidth: 1,
      borderColor: theme.colors.outline,
    },
    softCapBannerText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center' as const,
    },
    banner: {
      marginHorizontal: 12,
      marginVertical: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
    },
    bannerIconBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    bannerText: {
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.onSurfaceVariant,
    },
    bannerHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
    },
    bannerHeaderText: {
      flex: 1,
      flexShrink: 1,
    },
    bannerPercent: {
      fontSize: 12,
      fontWeight: '700' as const,
      fontVariant: ['tabular-nums'],
    },
    bannerPercentPill: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
      minWidth: 40,
      alignItems: 'center' as const,
    },
    bannerMeter: {
      height: 5,
      borderRadius: 3,
      backgroundColor: theme.colors.surfaceDisabled,
      overflow: 'hidden' as const,
      marginTop: 10,
      alignSelf: 'stretch' as const,
      width: '100%' as const,
    },
    bannerMeterFill: {
      height: 5,
      borderRadius: 3,
    },
    bannerActions: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      alignItems: 'center' as const,
      justifyContent: 'flex-end' as const,
      marginTop: 2,
    },
  });
