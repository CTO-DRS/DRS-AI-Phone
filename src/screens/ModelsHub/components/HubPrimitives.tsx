import React, {memo, useContext} from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from 'react-native';
import {LinearGradient} from 'react-native-linear-gradient';
import {observer} from 'mobx-react';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {
  ModelCategory,
  HUB_CATEGORY_ORDER,
  isUnavailableOnDeviceEngine,
} from '../../../utils/modelTaxonomy';
import {CompatibilityLevel} from '../../../utils/compatibility';
import {HuggingFaceModel, Model, ModelFile, Theme} from '../../../utils/types';
import {modelHubStore} from '../../../store';
import {hubStatusColors} from '../hubStatus';
import {formatBytes} from '../../../utils';
import {extractFamilyLabel} from '../../../utils/modelTaxonomy';

import {
  ChatIcon,
  EyeIcon,
  AtomIcon,
  CodeIcon,
  ModelIcon,
  GlobeIcon,
  GridIcon,
  SpeakerIcon,
  CameraIcon,
  VideoRecorderIcon,
  HeartIcon,
  DownloadIcon,
  CheckCircleIcon,
  CloudIcon,
} from '../../../assets/icons';

import {createStyles} from '../styles';

/** Category → icon mapping kept next to the taxonomy for cohesion. */
export const CATEGORY_ICONS: Record<ModelCategory, React.ComponentType<any>> = {
  text: ChatIcon,
  vision: EyeIcon,
  reasoning: AtomIcon,
  coding: CodeIcon,
  multimodal: ModelIcon,
  embedding: GridIcon,
  translation: GlobeIcon,
  audio: SpeakerIcon,
  image: CameraIcon,
  video: VideoRecorderIcon,
  general: ModelIcon,
};

/** Per-category gradient pairs (brand-adjacent hues, one hue per family). */
export const CATEGORY_GRADIENTS: Record<ModelCategory, [string, string]> = {
  text: ['#7C3AED', '#2563EB'],
  vision: ['#0EA5E9', '#6366F1'],
  reasoning: ['#8B5CF6', '#EC4899'],
  coding: ['#059669', '#0EA5E9'],
  multimodal: ['#6366F1', '#EC4899'],
  embedding: ['#0D9488', '#6366F1'],
  translation: ['#2563EB', '#06B6D4'],
  audio: ['#F59E0B', '#EF4444'],
  image: ['#EC4899', '#F59E0B'],
  video: ['#EF4444', '#8B5CF6'],
  general: ['#64748B', '#94A3B8'],
};

// ── Category grid ──────────────────────────────────────────────────────────

interface CategoryGridProps {
  installedCounts: Partial<Record<ModelCategory, number>>;
  onSelect: (category: ModelCategory) => void;
}

export const HubCategoryGrid: React.FC<CategoryGridProps> = observer(
  ({installedCounts, onSelect}) => {
    const l10n = useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles(theme);
    const categories = HUB_CATEGORY_ORDER.filter(c => c !== 'multimodal');

    return (
      <View style={styles.categoryGrid}>
        {categories.map(category => {
          const Icon = CATEGORY_ICONS[category];
          const [from, to] = CATEGORY_GRADIENTS[category];
          const count = installedCounts[category] ?? 0;
          // i18n key: modelsHub.categories.<category>
          const label =
            (l10n as any).modelsHub?.categories?.[category] ?? category;
          return (
            <Pressable
              key={category}
              testID={`category-tile-${category}`}
              onPress={() => onSelect(category)}
              android_ripple={{color: theme.colors.outlineVariant}}
              style={({pressed}) => [
                styles.categoryTile,
                pressed && {opacity: 0.85},
              ]}>
              <LinearGradient
                colors={[from, to]}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 1}}
                style={styles.categoryIconWrap}>
                <Icon width={18} height={18} stroke="#FFFFFF" fill="none" />
              </LinearGradient>
              <View>
                <Text style={styles.categoryTileLabel} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={styles.categoryTileCount}>
                  {count > 0
                    ? (
                        (l10n as any).modelsHub?.installedCount ?? '{count}'
                      ).replace('{count}', String(count))
                    : ((l10n as any).modelsHub?.discover ?? '')}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  },
);

// ── Compatibility dot ──────────────────────────────────────────────────────

export const COMPAT_COLORS: Record<CompatibilityLevel, string> = {
  excellent: '#059669',
  good: '#0EA5E9',
  limited: '#F59E0B',
  notRecommended: '#EF4444',
  unknown: '#94A3B8',
};

/**
 * Theme-paired TEXT ink for compatibility levels (v1.36.0). The map above
 * stays for saturated fills (dots/badges); labels rendered as text on themed
 * cards must use the theme-aware palette or they collapse on dark canvas.
 */
export const compatTextInk = (
  theme: Theme,
  level: CompatibilityLevel | null,
): string => {
  const palette = hubStatusColors(theme);
  switch (level) {
    case 'excellent':
      return palette.ok;
    case 'good':
      return palette.info;
    case 'limited':
      return palette.warn;
    case 'notRecommended':
      return palette.danger;
    default:
      return palette.neutral;
  }
};

// ── Catalog card (HF repo card) ────────────────────────────────────────────

export interface CatalogCardProps {
  hfModel: HuggingFaceModel;
  categories: ModelCategory[];
  compatibility?: CompatibilityLevel;
  onPress: () => void;
  onDownload?: () => void;
  sizeLabel?: string;
}

export const HubCatalogCard: React.FC<CatalogCardProps> = memo(
  ({hfModel, categories, compatibility, onPress, onDownload, sizeLabel}) => {
    const l10n = useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles(theme);
    const category = categories[0] ?? 'general';
    const Icon = CATEGORY_ICONS[category];
    const [from, to] = CATEGORY_GRADIENTS[category];
    const isFavorite = modelHubStore.isFavorite(hfModel.id);
    const engineBlocked =
      categories.length > 0 && categories.every(isUnavailableOnDeviceEngine);

    const compatDotStyle = {
      backgroundColor: compatibility ? COMPAT_COLORS[compatibility] : '#94A3B8',
    };
    const compatTextStyle = {
      color: compatTextInk(theme, compatibility ?? null),
    };

    // i18n: modelsHub.compat.<level>
    const compatLabel =
      compatibility != null
        ? ((l10n as any).modelsHub?.compat?.[compatibility] ?? compatibility)
        : null;

    return (
      <Pressable
        testID={`catalog-card-${hfModel.id}`}
        onPress={onPress}
        android_ripple={{color: theme.colors.outlineVariant}}
        style={({pressed}) => [styles.hCard, pressed && {opacity: 0.9}]}>
        <View style={primitiveStyles.cardHeaderRow}>
          <LinearGradient
            colors={[from, to]}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 1}}
            style={styles.hCardIconWrap}>
            <Icon width={20} height={20} stroke="#FFFFFF" fill="none" />
          </LinearGradient>
          <Pressable
            hitSlop={10}
            onPress={() => modelHubStore.toggleFavorite(hfModel.id)}
            accessibilityRole="button"
            accessibilityLabel={
              (l10n as any).modelsHub?.favorite ?? 'favorite'
            }>
            <HeartIcon
              width={20}
              height={20}
              stroke={isFavorite ? '#EC4899' : theme.colors.onSurfaceVariant}
              fill={isFavorite ? '#EC4899' : 'none'}
            />
          </Pressable>
        </View>

        <Text style={styles.hCardName} numberOfLines={2}>
          {extractFamilyLabel(hfModel.id)}
        </Text>
        <Text style={styles.hCardAuthor} numberOfLines={1}>
          {hfModel.author ?? hfModel.id.split('/')[0]}
        </Text>

        <Text style={styles.hCardMeta}>
          {[
            sizeLabel,
            hfModel.downloads > 0
              ? `${formatCompact(hfModel.downloads)} ↓`
              : null,
            hfModel.likes > 0 ? `${formatCompact(hfModel.likes)} ★` : null,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>

        <View style={styles.hCardRow}>
          {compatLabel ? (
            <View style={primitiveStyles.compatRow}>
              <View style={[styles.compatDot, compatDotStyle]} />
              <Text
                style={[styles.compatText, compatTextStyle]}
                numberOfLines={1}>
                {compatLabel}
              </Text>
            </View>
          ) : (
            <View />
          )}
          {onDownload &&
            (engineBlocked ? (
              <CloudIcon
                width={20}
                height={20}
                stroke={theme.colors.onSurfaceVariant}
                fill="none"
              />
            ) : (
              <Pressable
                hitSlop={8}
                onPress={onDownload}
                accessibilityRole="button"
                accessibilityLabel={(l10n as any).models?.buttons?.download}>
                <DownloadIcon
                  width={20}
                  height={20}
                  stroke={theme.colors.primary}
                  fill="none"
                />
              </Pressable>
            ))}
        </View>
      </Pressable>
    );
  },
);

// ── Skeleton card ──────────────────────────────────────────────────────────

export const HubSkeletonCard: React.FC<{width?: number}> = ({width = 220}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const skeletonWidthStyle = {width};
  return (
    <View
      style={[
        styles.hCard,
        skeletonWidthStyle,
        primitiveStyles.skeletonCardDim,
      ]}
      testID="hub-skeleton-card">
      <View style={[styles.skeletonBlock, primitiveStyles.skeletonAvatar]} />
      <View style={[styles.skeletonBlock, primitiveStyles.skeletonTitle]} />
      <View style={[styles.skeletonBlock, primitiveStyles.skeletonLineShort]} />
      <View style={[styles.skeletonBlock, primitiveStyles.skeletonLineLong]} />
    </View>
  );
};

// ── Empty state ────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ComponentType<any>;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export const HubEmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
  testID,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const emptyActionBg = {backgroundColor: theme.colors.primary};
  const emptyActionText = {color: theme.colors.onPrimary};
  return (
    <View style={styles.emptyState} testID={testID}>
      {Icon && (
        <Icon
          width={44}
          height={44}
          stroke={theme.colors.onSurfaceVariant}
          fill="none"
        />
      )}
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {hint && <Text style={styles.emptyStateHint}>{hint}</Text>}
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          android_ripple={{color: theme.colors.outlineVariant}}
          style={[primitiveStyles.emptyAction, emptyActionBg]}
          accessibilityRole="button">
          <Text style={[emptyActionText, primitiveStyles.textSemibold]}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
};

// ── Inline section spinner / error row ─────────────────────────────────────

export const HubInlineStatus: React.FC<{
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}> = observer(({loading, error, onRetry, retryLabel}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);
  const retryTextStyle = {color: theme.colors.primary};
  if (loading) {
    return (
      <View style={primitiveStyles.statusLoadingWrap}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={primitiveStyles.statusErrorWrap}>
        <Text style={styles.emptyStateHint}>{error}</Text>
        {onRetry && (
          <Pressable
            onPress={onRetry}
            hitSlop={8}
            style={primitiveStyles.retryGap}>
            <Text style={[retryTextStyle, primitiveStyles.textSemibold]}>
              {retryLabel ?? (l10n as any).modelsHub?.retry ?? 'Retry'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }
  return null;
});

// ── helpers ────────────────────────────────────────────────────────────────

export const formatCompact = (n: number): string => {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${n}`;
};

/** Best GGUF size label for an HF repo (smallest valid file — real data). */
export const bestFileSizeLabel = (hfModel: HuggingFaceModel): string | null => {
  const gguf = (hfModel.siblings ?? []).filter((s: any) =>
    String(s.rfilename ?? '')
      .toLowerCase()
      .endsWith('.gguf'),
  );
  const sizes = gguf
    .map((s: any) => s.lfs?.size ?? s.size ?? 0)
    .filter((s: number) => s > 0)
    .sort((a: number, b: number) => a - b);
  if (sizes.length === 0) {
    return null;
  }
  return formatBytes(sizes[0]);
};

/** Pick the best downloadable GGUF file: smallest is friendliest by default. */
export const bestGGUFFile = (hfModel: HuggingFaceModel): ModelFile | null => {
  const gguf = (hfModel.siblings ?? [])
    .filter((s: any) =>
      String(s.rfilename ?? '')
        .toLowerCase()
        .endsWith('.gguf'),
    )
    .sort(
      (a: any, b: any) =>
        (a.lfs?.size ?? a.size ?? 0) - (b.lfs?.size ?? b.size ?? 0),
    );
  return gguf[0] ?? null;
};

/** Installed-model favorite helper uses the same id the hub records. */
export const modelHubId = (model: Model): string => model.id;

export const InstalledBadge: React.FC<{label: string}> = ({label}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={[styles.badge, styles.badgeBrand]}>
      <CheckCircleIcon width={12} height={12} stroke="#7C3AED" fill="none" />
      <Text style={[styles.badgeText, styles.badgeBrandText]}>{label}</Text>
    </View>
  );
};

const primitiveStyles = StyleSheet.create({
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compatRow: {flexDirection: 'row', alignItems: 'center'},
  skeletonCardDim: {opacity: 0.6},
  skeletonAvatar: {width: 40, height: 40, borderRadius: 12},
  skeletonTitle: {height: 14, marginTop: 12, width: '80%'},
  skeletonLineShort: {height: 10, marginTop: 8, width: '50%'},
  skeletonLineLong: {height: 10, marginTop: 10, width: '65%'},
  emptyAction: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  textSemibold: {fontWeight: '600'},
  statusLoadingWrap: {paddingVertical: 24, alignItems: 'center'},
  statusErrorWrap: {paddingVertical: 16, alignItems: 'center'},
  retryGap: {marginTop: 8},
});
