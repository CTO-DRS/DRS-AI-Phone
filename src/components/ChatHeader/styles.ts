import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';
import {EdgeInsets} from 'react-native-safe-area-context';

export const createStyles = ({
  theme,
  insets,
  headerHeight,
}: {
  theme: Theme;
  insets: EdgeInsets;
  headerHeight: number;
}) =>
  StyleSheet.create({
    container: {
      height: headerHeight,
      paddingTop: insets.top,
      backgroundColor: theme.colors.background,
    },
    brandWash: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.8,
    },
    contentRow: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    leftSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexShrink: 1,
    },
    menuIcon: {
      height: 40,
      width: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    brandHairline: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 1.5,
      opacity: 0.55,
    },
    headerWithoutDivider: {
      elevation: 0,
      shadowOpacity: 0,
      borderBottomWidth: 0,
      // Opaque theme surface — NEVER transparent. The header sits above a
      // root container that is tinted with the active assistant's accent
      // color (see ChatView `inputBackgroundColor`); a transparent header
      // would expose that tint and put theme `onSurface` text on an
      // assistant-controlled background. With Pip (#FAFAFA) in dark theme
      // this rendered near-white text on a near-white bar — the reported
      // "white screen, all texts disappear" bug (v1.35.0).
      backgroundColor: theme.colors.background,
    },
    headerWithDivider: {
      backgroundColor: theme.colors.background,
    },
  });
