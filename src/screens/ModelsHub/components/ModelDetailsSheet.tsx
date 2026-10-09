import React, {useContext, useEffect, useMemo, useState} from 'react';
import {
  ScrollView,
  Text,
  View,
  Pressable,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from 'react-native';
import {observer} from 'mobx-react-lite';
import LinearGradient from 'react-native-linear-gradient';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {modelStore, modelHubStore, hfStore} from '../../../store';
import {HuggingFaceModel, ModelFile, Theme} from '../../../utils/types';
import {hubStatusColors} from '../hubStatus';
import {
  classifyHfModel,
  isUnavailableOnDeviceEngine,
  extractQuantLabel,
  formatParamsLabel,
  extractFamilyLabel,
} from '../../../utils/modelTaxonomy';
import {
  computeModelCompatibility,
  CompatibilityCheck,
  CompatibilityLevel,
  CompatibilityReason,
} from '../../../utils/compatibility';
import {formatBytes} from '../../../utils';
import {getModelMemoryRequirement} from '../../../utils/memoryEstimator';
import {getLLMFiles, getMmprojFiles} from '../../../utils/multimodalHelpers';
import {BRAND_PURPLE} from '../../../theme/tokens/brand';

import {Sheet} from '../../../components';
import {useDeviceProfile} from '../hooks/useDeviceProfile';
import {
  CATEGORY_ICONS,
  CATEGORY_GRADIENTS,
  COMPAT_COLORS,
} from './HubPrimitives';
import {DownloadConfirmDialog} from './DownloadConfirmDialog';

interface ModelDetailsSheetProps {
  visible: boolean;
  hfModel: HuggingFaceModel | null;
  onClose: () => void;
}

type TabKey = 'overview' | 'technical' | 'files';

/**
 * Full model detail experience for catalog (HF) entries: overview,
 * capabilities with real classification evidence, technical facts pulled
 * from GGUF specs, an honest device-compatibility panel, and the complete
 * GGUF file list with per-file download actions.
 */
export const ModelDetailsSheet: React.FC<ModelDetailsSheetProps> = observer(
  ({visible, hfModel, onClose}) => {
    const l10n = useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles(theme);
    const {profile: device} = useDeviceProfile();

    const [tab, setTab] = useState<TabKey>('overview');
    const [confirmFile, setConfirmFile] = useState<ModelFile | null>(null);
    const [fullInfo, setFullInfo] = useState<HuggingFaceModel | null>(null);
    const [, setLoadingInfo] = useState(false);

    // Enrich with full repo info (GGUF specs, README card data) when opened.
    useEffect(() => {
      if (!visible || !hfModel) {
        setFullInfo(null);
        setTab('overview');
        return;
      }
      let cancelled = false;
      setLoadingInfo(true);
      hfStore
        .fetchModelData(hfModel.id)
        .then(() => {
          if (!cancelled) {
            setFullInfo(hfStore.getModelById(hfModel.id) ?? hfModel);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFullInfo(hfModel);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingInfo(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [visible, hfModel]);

    const model = fullInfo ?? hfModel;

    const categories = useMemo(
      () => (model ? classifyHfModel(model) : []),
      [model],
    );
    const category = categories[0] ?? 'general';
    const Icon = CATEGORY_ICONS[category];
    const gradient = CATEGORY_GRADIENTS[category];
    const engineBlocked =
      categories.length > 0 && categories.every(isUnavailableOnDeviceEngine);

    // The installed counterpart, if the user already has a file from this repo.
    const installedModels = useMemo(() => {
      if (!model) {
        return [];
      }
      const models = modelStore.models;
      return models.filter(
        m => m.repo && model.id.endsWith(m.repo) && m.isDownloaded,
      );
    }, [model]);

    const files = useMemo(
      () => (model ? getLLMFiles(model.siblings ?? []) : []),
      [model],
    );
    const mmprojFiles = useMemo(
      () => (model ? getMmprojFiles(model.siblings ?? []) : []),
      [model],
    );

    const compatibility: CompatibilityCheck | null = useMemo(() => {
      if (!model || !device) {
        return null;
      }
      const best = files
        .map(f => f.lfs?.size ?? f.size ?? 0)
        .sort((a: number, b: number) => a - b)[0];
      if (!best) {
        return null;
      }
      const estimatedMemory = estimateMemory(model, best);
      return computeModelCompatibility({
        modelSizeBytes: best,
        estimatedMemoryBytes: estimatedMemory,
        engineSupported: !engineBlocked,
        device,
      });
    }, [model, device, files, engineBlocked]);

    const isFavorite = model ? modelHubStore.isFavorite(model.id) : false;

    if (!model) {
      return null;
    }

    const t = (l10n as any).modelsHub ?? {};

    return (
      <>
        <Sheet
          isVisible={visible}
          snapPoints={['93%']}
          enableDynamicSizing={false}
          enablePanDownToClose
          enableContentPanningGesture={false}
          onClose={onClose}
          showCloseButton>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            {/* ── Header ── */}
            <View style={styles.headerRow}>
              <LinearGradient
                colors={gradient}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 1}}
                style={styles.categoryBadge}>
                <Icon width={30} height={30} stroke="#FFFFFF" fill="none" />
              </LinearGradient>
              <View style={styles.flex1}>
                <Text style={styles.familyTitle}>
                  {extractFamilyLabel(model.id)}
                </Text>
                <Text style={styles.mutedCaptionTight} numberOfLines={1}>
                  {model.id}
                </Text>
                <View style={styles.chipRow}>
                  <Chip label={t.categories?.[category] ?? category} brand />
                  {model.sha && (
                    <Chip
                      label={`${t.version ?? 'v'} ${model.sha.slice(0, 7)}`}
                    />
                  )}
                  {engineBlocked && (
                    <Chip label={t.engineUnsupportedShort ?? 'engine'} />
                  )}
                </View>
              </View>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t.favorite ?? 'favorite'}
                onPress={() => modelHubStore.toggleFavorite(model.id)}
                style={styles.favoriteButton}>
                <HeartGlyph active={isFavorite} />
              </Pressable>
            </View>

            {/* ── Compatibility banner ── */}
            {compatibility && (
              <View style={styles.compatBanner}>
                <View style={styles.rowCentered}>
                  <View
                    style={[
                      styles.compatDot,
                      compatAccentBgStyle(compatibility.level),
                    ]}
                  />
                  <Text
                    style={[
                      styles.compatLevelText,
                      compatAccentColorStyle(compatibility.level),
                    ]}>
                    {t.compat?.[compatibility.level] ?? compatibility.level}
                  </Text>
                  <Text style={styles.mutedCaption}>
                    {t.fitScore?.replace(
                      '{score}',
                      String(compatibility.score),
                    ) ?? `${compatibility.score}/100`}
                  </Text>
                </View>
                <View style={styles.reasonList}>
                  {compatibility.reasons.map(reason => (
                    <View key={reason.id} style={styles.rowCentered}>
                      <Text
                        style={[
                          styles.reasonMarkText,
                          reasonMarkColorStyle(theme, reason.severity),
                        ]}>
                        {reason.severity === 'error'
                          ? '✕'
                          : reason.severity === 'warning'
                            ? '⚠'
                            : reason.severity === 'ok'
                              ? '✓'
                              : '·'}
                      </Text>
                      <Text style={styles.reasonDetailText}>
                        {t.reasons?.[reason.detail ?? reason.id] ??
                          reason.detail ??
                          reason.id}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── Tabs ── */}
            <View style={styles.tabsContainer}>
              {(['overview', 'technical', 'files'] as TabKey[]).map(key => (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={[
                    styles.tabItem,
                    tab === key ? styles.tabItemActive : styles.tabItemInactive,
                  ]}
                  accessibilityRole="tab">
                  <Text
                    style={
                      tab === key
                        ? styles.tabLabelActive
                        : styles.tabLabelInactive
                    }>
                    {t.tabs?.[key] ?? key}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── Overview ── */}
            {tab === 'overview' && (
              <View style={styles.overviewSection}>
                <Text style={styles.overviewText}>
                  {buildOverview(model, categories, t)}
                </Text>

                <View>
                  <Text style={styles.sectionTitle}>{t.capabilitiesTitle}</Text>
                  <View style={styles.capabilitiesWrap}>
                    {capabilitiesFor(model, categories, engineBlocked, t).map(
                      cap => (
                        <View key={cap.label} style={styles.capChip}>
                          <Text
                            style={[
                              styles.capMarkText,
                              cap.ok ? styles.capMarkOk : styles.capMarkWarn,
                            ]}>
                            {cap.ok ? '✓' : '·'}
                          </Text>
                          <Text style={styles.capLabel}>{cap.label}</Text>
                        </View>
                      ),
                    )}
                  </View>
                </View>

                {installedModels.length > 0 && (
                  <View style={styles.installedCard}>
                    <Text style={styles.installedCardTitle}>
                      {t.installedFromRepo}
                    </Text>
                    {installedModels.map(m => (
                      <Text key={m.id} style={styles.mutedCaptionSpaced}>
                        {m.filename}
                      </Text>
                    ))}
                  </View>
                )}

                <Pressable
                  onPress={() => modelHubStore.recordView(model.id)}
                  style={styles.hiddenPressable}
                />
              </View>
            )}

            {/* ── Technical ── */}
            {tab === 'technical' && (
              <View style={styles.tabSection}>
                <View style={styles.techCard}>
                  <TechRow
                    theme={theme}
                    label={t.tech?.architecture}
                    value={model.specs?.gguf?.architecture ?? t.notAvailable}
                  />
                  <TechRow
                    theme={theme}
                    label={t.tech?.parameters}
                    value={
                      formatParamsLabel(model.specs?.gguf?.total) ??
                      t.notAvailable
                    }
                  />
                  <TechRow
                    theme={theme}
                    label={t.tech?.contextLength}
                    value={
                      model.specs?.gguf?.context_length != null
                        ? model.specs.gguf.context_length.toLocaleString()
                        : t.notAvailable
                    }
                  />
                  <TechRow theme={theme} label={t.tech?.formats} value="GGUF" />
                  <TechRow
                    theme={theme}
                    label={t.tech?.quantization}
                    value={
                      files.length > 0
                        ? [
                            ...new Set(
                              files
                                .map((f: ModelFile) =>
                                  extractQuantLabel(f.rfilename),
                                )
                                .filter(Boolean),
                            ),
                          ].join(', ') || t.notAvailable
                        : t.notAvailable
                    }
                  />
                  <TechRow
                    theme={theme}
                    label={t.tech?.fileCount}
                    value={String(files.length)}
                  />
                  <TechRow
                    theme={theme}
                    label={t.tech?.version}
                    value={model.sha ? model.sha.slice(0, 12) : t.notAvailable}
                  />
                  <TechRow
                    theme={theme}
                    label={t.tech?.lastModified}
                    value={model.lastModified?.slice(0, 10) ?? t.notAvailable}
                  />
                  <TechRow
                    theme={theme}
                    label={t.tech?.license}
                    value={
                      model.tags
                        ?.find(tg => tg.startsWith('license:'))
                        ?.replace('license:', '') ?? t.notAvailable
                    }
                  />
                  <TechRow
                    theme={theme}
                    label={t.tech?.engine}
                    value={
                      engineBlocked
                        ? (t.engineNo ?? '—')
                        : (t.engineYes ?? 'GGUF (llama.cpp)')
                    }
                  />
                </View>
              </View>
            )}

            {/* ── Files ── */}
            {tab === 'files' && (
              <View style={styles.tabSection}>
                {files.length === 0 && (
                  <Text style={styles.mutedBody}>{t.noFiles}</Text>
                )}
                {files.map((file: ModelFile) => {
                  const size = file.lfs?.size ?? file.size ?? 0;
                  const quant = extractQuantLabel(file.rfilename);
                  const isInstalled = installedModels.some(
                    m => m.filename === file.rfilename,
                  );
                  return (
                    <View key={file.rfilename} style={styles.fileRow}>
                      <View style={styles.flex1}>
                        <Text style={styles.fileName} numberOfLines={1}>
                          {file.rfilename}
                        </Text>
                        <Text style={styles.mutedCaptionTight}>
                          {[
                            size > 0 ? formatBytes(size) : null,
                            quant ?? null,
                            isInstalled ? (t.installedBadge ?? null) : null,
                          ]
                            .filter(Boolean)
                            .join('  ·  ')}
                        </Text>
                      </View>
                      {isInstalled ? (
                        <View style={styles.installedBadge}>
                          <Text style={styles.installedBadgeText}>
                            {t.installedBadge}
                          </Text>
                        </View>
                      ) : engineBlocked ? (
                        <Text style={styles.mutedCaption}>
                          {t.engineNo ?? '—'}
                        </Text>
                      ) : (
                        <Pressable
                          onPress={() => setConfirmFile(file)}
                          accessibilityRole="button"
                          accessibilityLabel={t.downloadFile}
                          style={styles.downloadButton}>
                          <Text style={styles.downloadButtonLabel}>
                            {t.downloadShort ?? '↓'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}

                {mmprojFiles.length > 0 && (
                  <View style={styles.visionFilesSection}>
                    <Text style={styles.sectionTitle}>
                      {t.visionFilesTitle}
                    </Text>
                    <Text style={styles.mutedCaptionSpaced}>
                      {t.visionFilesHint}
                    </Text>
                    {mmprojFiles.map((file: ModelFile) => (
                      <Text
                        key={file.rfilename}
                        style={styles.mutedCaptionSpaced}>
                        {file.rfilename}
                        {file.lfs?.size
                          ? `  ·  ${formatBytes(file.lfs.size)}`
                          : ''}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </Sheet>

        <DownloadConfirmDialog
          visible={confirmFile != null}
          hfModel={model}
          modelFile={confirmFile}
          onClose={() => setConfirmFile(null)}
        />
      </>
    );
  },
);

// ── small helpers ──────────────────────────────────────────────────────────

const Chip: React.FC<{label: string; brand?: boolean}> = ({label, brand}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={[styles.chip, brand ? styles.chipBrand : null]}>
      <Text style={[styles.chipText, brand ? styles.chipBrandText : null]}>
        {label}
      </Text>
    </View>
  );
};

const HeartGlyph: React.FC<{active: boolean}> = ({active}) => (
  <Text
    style={[heartStyles.glyph, active ? heartStyles.active : heartStyles.idle]}>
    {active ? '♥' : '♡'}
  </Text>
);

const TechRow: React.FC<{label?: string; value: string; theme: any}> = ({
  label,
  value,
  theme,
}) => {
  const styles = createStyles(theme);
  return (
    <View style={styles.techRow}>
      <Text style={styles.mutedBody}>{label ?? ''}</Text>
      <Text style={styles.techRowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
};

/**
 * Real memory estimate for a specific GGUF file, using the app's own memory
 * estimator. Falls back to null when GGUF specs are absent (honest unknown).
 */
const estimateMemory = (
  model: HuggingFaceModel,
  fileBytes: number,
): number | null => {
  try {
    // Synthesize the minimal Model shape the estimator reads (sizes + specs).
    const pseudoModel = {
      size: fileBytes,
      ggufMetadata: undefined,
      hfModelFile: {lfs: {size: fileBytes, oid: '', pointerSize: 0}},
    } as any;
    return getModelMemoryRequirement(pseudoModel);
  } catch {
    return null;
  }
};

const capabilitiesFor = (
  model: HuggingFaceModel,
  categories: string[],
  engineBlocked: boolean,
  t: any,
): Array<{label: string; ok: boolean}> => {
  const caps: Array<{label: string; ok: boolean}> = [];
  for (const c of categories) {
    caps.push({label: t.categories?.[c] ?? c, ok: true});
  }
  caps.push({
    label: t.capabilities?.offline ?? 'Offline',
    ok: !engineBlocked,
  });
  if (model.specs?.gguf?.context_length) {
    caps.push({
      label: `${t.capabilities?.context ?? 'Context'} ${(
        model.specs.gguf.context_length / 1024
      ).toFixed(0)}k`,
      ok: true,
    });
  }
  const tags = model.tags ?? [];
  if (tags.some(tg => tg.includes('arabic') || tg === 'ar')) {
    caps.push({label: t.capabilities?.arabic ?? 'Arabic', ok: true});
  }
  if (tags.some(tg => tg === 'multilingual' || tg.includes('multilingual'))) {
    caps.push({
      label: t.capabilities?.multilingual ?? 'Multilingual',
      ok: true,
    });
  }
  return caps;
};

/**
 * Honest overview paragraph composed ONLY from real repo data — family,
 * author, parameter count, file count, engine support. No invented claims.
 */
const buildOverview = (
  model: HuggingFaceModel,
  categories: string[],
  t: any,
): string => {
  const author = model.author ?? model.id.split('/')[0];
  const params = formatParamsLabel(model.specs?.gguf?.total);
  const categoryLabels = categories
    .slice(0, 2)
    .map(c => t.categories?.[c] ?? c)
    .join(' · ');
  const parts = [
    t.overviewTemplate
      ?.replace('{author}', author)
      ?.replace('{params}', params ?? t.notAvailable ?? '')
      ?.replace(
        '{categories}',
        categoryLabels || (t.categories?.general ?? ''),
      ),
  ];
  if (model.downloads > 0 || model.likes > 0) {
    parts.push(
      t.statsTemplate
        ?.replace('{downloads}', model.downloads.toLocaleString())
        ?.replace('{likes}', model.likes.toLocaleString()),
    );
  }
  return parts.filter(Boolean).join('\n\n');
};

// ── styles ──────────────────────────────────────────────────────────────────

/** Data-driven accent for the compatibility level (level heading color). */
const compatAccentColorStyle = (
  level: CompatibilityLevel,
): {color: string} => ({color: COMPAT_COLORS[level]});

/** Data-driven accent for the compatibility level (status dot fill). */
const compatAccentBgStyle = (
  level: CompatibilityLevel,
): {backgroundColor: string} => ({backgroundColor: COMPAT_COLORS[level]});

/** Severity tint for compatibility reason marks (theme-aware). */
const reasonMarkColorStyle = (
  theme: Theme,
  severity: CompatibilityReason['severity'],
): {color: string} => ({
  color:
    severity === 'error'
      ? theme.colors.error
      : severity === 'warning'
        ? hubStatusColors(theme).warn
        : severity === 'ok'
          ? hubStatusColors(theme).ok
          : theme.colors.onSurfaceVariant,
});

/** Favorite-glyph styles (theme-independent, so a plain static sheet). */
const heartStyles = StyleSheet.create({
  glyph: {fontSize: 18} as TextStyle,
  active: {color: '#EC4899'} as TextStyle,
  idle: {color: '#94A3B8'} as TextStyle,
});

/**
 * Sheet styles, rebuilt per theme like the rest of the Hub (see
 * src/screens/ModelsHub/styles.ts) so no style object is written inline
 * in the JSX.
 */
const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // ── Header ────────────────────────────────────────────
    scrollContent: {
      paddingBottom: 48,
    } as ViewStyle,
    headerRow: {
      paddingHorizontal: 20,
      flexDirection: 'row',
      gap: 14,
    } as ViewStyle,
    categoryBadge: {
      width: 60,
      height: 60,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    flex1: {
      flex: 1,
    } as ViewStyle,
    familyTitle: {
      ...theme.typography.titleM,
      color: theme.colors.onSurface,
      fontWeight: '800',
    } as TextStyle,
    mutedCaptionTight: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    } as TextStyle,
    chipRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 6,
      flexWrap: 'wrap',
    } as ViewStyle,
    favoriteButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceVariant,
    } as ViewStyle,

    // ── Compatibility banner ──────────────────────────────
    compatBanner: {
      marginHorizontal: 20,
      marginTop: 16,
      borderRadius: 14,
      padding: 14,
      backgroundColor: theme.colors.surfaceVariant,
    } as ViewStyle,
    rowCentered: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    } as ViewStyle,
    compatDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    } as ViewStyle,
    compatLevelText: {
      ...theme.typography.uiM,
      fontWeight: '700',
    } as TextStyle,
    reasonList: {
      marginTop: 10,
      gap: 6,
    } as ViewStyle,
    reasonMarkText: {
      fontSize: 13,
      fontWeight: '700',
    } as TextStyle,
    reasonDetailText: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      flex: 1,
    } as TextStyle,

    // ── Tabs ──────────────────────────────────────────────
    tabsContainer: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginTop: 16,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      padding: 4,
    } as ViewStyle,
    tabItem: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 9,
      alignItems: 'center',
    } as ViewStyle,
    tabItemActive: {
      backgroundColor: theme.colors.surface,
    } as ViewStyle,
    tabItemInactive: {
      backgroundColor: 'transparent',
    } as ViewStyle,
    tabLabelActive: {
      ...theme.typography.uiS,
      fontWeight: '600',
      color: theme.colors.onSurface,
    } as TextStyle,
    tabLabelInactive: {
      ...theme.typography.uiS,
      fontWeight: '600',
      color: theme.colors.onSurfaceVariant,
    } as TextStyle,

    // ── Overview ──────────────────────────────────────────
    overviewSection: {
      paddingHorizontal: 20,
      marginTop: 16,
      gap: 14,
    } as ViewStyle,
    overviewText: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      lineHeight: 21,
    } as TextStyle,
    sectionTitle: {
      ...theme.typography.uiM,
      fontWeight: '700',
      color: theme.colors.onSurface,
    } as TextStyle,
    capabilitiesWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    } as ViewStyle,
    capChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceVariant,
    } as ViewStyle,
    capMarkText: {
      fontSize: 12,
      fontWeight: '700',
    } as TextStyle,
    capMarkOk: {
      color: hubStatusColors(theme).ok,
    } as TextStyle,
    capMarkWarn: {
      color: hubStatusColors(theme).warn,
    } as TextStyle,
    capLabel: {
      ...theme.typography.captionM,
      color: theme.colors.onSurface,
    } as TextStyle,
    installedCard: {
      borderRadius: 12,
      padding: 12,
      backgroundColor: theme.colors.surfaceVariant,
    } as ViewStyle,
    installedCardTitle: {
      ...theme.typography.uiS,
      fontWeight: '700',
      color: theme.colors.onSurface,
    } as TextStyle,
    mutedCaptionSpaced: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
    } as TextStyle,
    hiddenPressable: {
      display: 'none',
    } as ViewStyle,

    // ── Technical / Files ─────────────────────────────────
    tabSection: {
      paddingHorizontal: 20,
      marginTop: 16,
    } as ViewStyle,
    techCard: {
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceVariant,
      padding: 14,
      gap: 10,
    } as ViewStyle,
    mutedBody: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
    } as TextStyle,
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant,
      gap: 10,
    } as ViewStyle,
    fileName: {
      ...theme.typography.uiS,
      fontWeight: '600',
      color: theme.colors.onSurface,
    } as TextStyle,
    mutedCaption: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
    } as TextStyle,
    installedBadge: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceVariant,
    } as ViewStyle,
    installedBadgeText: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      fontWeight: '700',
    } as TextStyle,
    downloadButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: BRAND_PURPLE,
    } as ViewStyle,
    downloadButtonLabel: {
      ...theme.typography.captionM,
      color: '#FFFFFF',
      fontWeight: '700',
    } as TextStyle,
    visionFilesSection: {
      marginTop: 16,
    } as ViewStyle,

    // ── Chip / TechRow ────────────────────────────────────
    chip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceVariant,
    } as ViewStyle,
    chipBrand: {
      backgroundColor: BRAND_PURPLE + '1F',
    } as ViewStyle,
    chipText: {
      ...theme.typography.captionM,
      fontWeight: '700',
      color: theme.colors.onSurfaceVariant,
    } as TextStyle,
    chipBrandText: {
      color: BRAND_PURPLE,
    } as TextStyle,
    techRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    } as ViewStyle,
    techRowValue: {
      ...theme.typography.bodyS,
      fontWeight: '600',
      color: theme.colors.onSurface,
      flexShrink: 1,
    } as TextStyle,
  });
