import {StyleSheet, TextStyle, ViewStyle} from 'react-native';

import {Theme} from '../../utils/types';
import {BRAND_PURPLE, BRAND_BLUE} from '../../theme/tokens/brand';

/**
 * Models Hub styling — premium, gradient-tinted surfaces built on the brand
 * identity. All spacing/radius values come from the theme tokens where the
 * token exists, so the Hub stays consistent with the rest of the app.
 */
export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    } as ViewStyle,
    scrollContent: {
      paddingBottom: 120,
    } as ViewStyle,

    // ── Hero ──────────────────────────────────────────────
    hero: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    } as ViewStyle,
    heroTitle: {
      ...theme.typography.titleL,
      color: theme.colors.onBackground,
      fontWeight: '700',
    } as TextStyle,
    heroSubtitle: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
      lineHeight: 20,
    } as TextStyle,

    // ── Search ────────────────────────────────────────────
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    } as ViewStyle,
    searchInputContainer: {
      flex: 1,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      height: 44,
    } as ViewStyle,
    searchInput: {
      flex: 1,
      color: theme.colors.onSurface,
      fontSize: 15,
      paddingVertical: 0,
      textAlignVertical: 'center',
    } as TextStyle,
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceVariant,
    } as ViewStyle,
    iconButtonActive: {
      backgroundColor: BRAND_PURPLE + '22',
    } as ViewStyle,

    // ── Section headers ───────────────────────────────────
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginTop: 20,
      marginBottom: 10,
    } as ViewStyle,
    sectionTitle: {
      ...theme.typography.titleM,
      color: theme.colors.onBackground,
      fontWeight: '700',
    } as TextStyle,
    sectionAction: {
      ...theme.typography.uiM,
      color: BRAND_BLUE,
      fontWeight: '600',
    } as TextStyle,

    // ── Cards ─────────────────────────────────────────────
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      marginHorizontal: 16,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outlineVariant,
      // Soft elevation without heavy shadows (Android-friendly)
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 10,
      shadowOffset: {width: 0, height: 4},
      elevation: 1,
    } as ViewStyle,

    // ── Category grid ─────────────────────────────────────
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 12,
      gap: 10,
    } as ViewStyle,
    categoryTile: {
      width: '31%',
      flexGrow: 1,
      aspectRatio: 1.35,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outlineVariant,
      padding: 10,
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    } as ViewStyle,
    categoryIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    categoryTileLabel: {
      ...theme.typography.uiS,
      color: theme.colors.onSurface,
      fontWeight: '600',
    } as TextStyle,
    categoryTileCount: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
    } as TextStyle,

    // ── Catalog cards (horizontal rows) ───────────────────
    hCard: {
      width: 220,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outlineVariant,
      padding: 12,
      marginRight: 10,
    } as ViewStyle,
    hCardIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    } as ViewStyle,
    hCardName: {
      ...theme.typography.titleS,
      color: theme.colors.onSurface,
      fontWeight: '700',
    } as TextStyle,
    hCardAuthor: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      marginTop: 1,
    } as TextStyle,
    hCardMeta: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      marginTop: 6,
    } as TextStyle,
    hCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    } as ViewStyle,
    compatDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 5,
    } as ViewStyle,
    compatText: {
      ...theme.typography.captionM,
      fontWeight: '600',
    } as TextStyle,

    // ── Badges / chips ────────────────────────────────────
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceVariant,
      alignSelf: 'flex-start',
    } as ViewStyle,
    badgeText: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      fontWeight: '600',
    } as TextStyle,
    badgeBrand: {
      backgroundColor: BRAND_PURPLE + '1F',
    } as ViewStyle,
    badgeBrandText: {
      color: BRAND_PURPLE,
    } as TextStyle,

    // ── Installed rows ────────────────────────────────────
    installedList: {
      paddingHorizontal: 16,
      gap: 4,
    } as ViewStyle,

    // ── Empty / skeleton / error states ───────────────────
    emptyState: {
      alignItems: 'center',
      paddingVertical: 36,
      paddingHorizontal: 32,
    } as ViewStyle,
    emptyStateTitle: {
      ...theme.typography.titleM,
      color: theme.colors.onSurface,
      fontWeight: '700',
      marginTop: 12,
      textAlign: 'center',
    } as TextStyle,
    emptyStateHint: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      marginTop: 6,
      textAlign: 'center',
      lineHeight: 19,
    } as TextStyle,
    skeletonBlock: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 12,
    } as ViewStyle,
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: theme.colors.errorContainer,
    } as ViewStyle,
    offlineText: {
      ...theme.typography.uiS,
      color: theme.colors.onErrorContainer,
      flex: 1,
    } as TextStyle,

    // ── Device / storage summary card ─────────────────────
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    } as ViewStyle,
    summaryStat: {
      flex: 1,
    } as ViewStyle,
    summaryStatLabel: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
    } as TextStyle,
    summaryStatValue: {
      ...theme.typography.titleM,
      color: theme.colors.onSurface,
      fontWeight: '700',
      marginTop: 2,
    } as TextStyle,
    summaryStatValueGpuOk: {
      color: '#059669',
    } as TextStyle,
    summaryStatValueGpuNo: {
      color: theme.colors.onSurface,
    } as TextStyle,

    // ── Horizontal catalog rows ───────────────────────────
    skeletonRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
    } as ViewStyle,
    hRowContent: {
      paddingHorizontal: 16,
    } as ViewStyle,

    // ── Sort menu chips ───────────────────────────────────
    sortMenu: {
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceVariant,
      padding: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    } as ViewStyle,
    sortChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
    } as ViewStyle,
    sortChipActive: {
      backgroundColor: theme.colors.surface,
    } as ViewStyle,
    sortChipInactive: {
      backgroundColor: 'transparent',
    } as ViewStyle,
    sortChipTextActive: {
      ...theme.typography.captionM,
      fontWeight: '700',
      color: theme.colors.onSurface,
    } as TextStyle,
    sortChipTextInactive: {
      ...theme.typography.captionM,
      fontWeight: '400',
      color: theme.colors.onSurfaceVariant,
    } as TextStyle,

    // ── Wi-Fi-only preference chip ────────────────────────
    wifiChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
    } as ViewStyle,
    wifiChipActive: {
      backgroundColor: '#2563EB22',
    } as ViewStyle,
    wifiChipInactive: {
      backgroundColor: 'transparent',
    } as ViewStyle,
    wifiChipTextActive: {
      ...theme.typography.captionM,
      fontWeight: '700',
      color: '#2563EB',
    } as TextStyle,
    wifiChipTextInactive: {
      ...theme.typography.captionM,
      fontWeight: '400',
      color: theme.colors.onSurfaceVariant,
    } as TextStyle,

    // ── Favorites list ────────────────────────────────────
    favoritesList: {
      paddingHorizontal: 16,
      gap: 2,
    } as ViewStyle,
    favoriteModelRow: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      paddingVertical: 4,
    } as TextStyle,

    // ── Storage entry card ────────────────────────────────
    storageEntry: {
      marginTop: 20,
    } as ViewStyle,
    storageEntryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    } as ViewStyle,
    storageEntryTitle: {
      ...theme.typography.uiM,
      fontWeight: '700',
      color: theme.colors.onSurface,
    } as TextStyle,
    storageEntryHint: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    } as TextStyle,
  });
