import React, {useContext, useEffect, useMemo, useState} from 'react';
import {ScrollView, Text, View, Pressable} from 'react-native';
import {observer} from 'mobx-react-lite';
import LinearGradient from 'react-native-linear-gradient';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {modelStore, modelHubStore, hfStore} from '../../../store';
import {HuggingFaceModel, ModelFile} from '../../../utils/types';
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
} from '../../../utils/compatibility';
import {formatBytes} from '../../../utils';
import {getModelMemoryRequirement} from '../../../utils/memoryEstimator';
import {getLLMFiles, getMmprojFiles} from '../../../utils/multimodalHelpers';

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
            contentContainerStyle={{paddingBottom: 48}}
            keyboardShouldPersistTaps="handled">
            {/* ── Header ── */}
            <View
              style={{paddingHorizontal: 20, flexDirection: 'row', gap: 14}}>
              <LinearGradient
                colors={gradient}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 1}}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon width={30} height={30} stroke="#FFFFFF" fill="none" />
              </LinearGradient>
              <View style={{flex: 1}}>
                <Text
                  style={{
                    ...theme.typography.titleM,
                    color: theme.colors.onSurface,
                    fontWeight: '800',
                  }}>
                  {extractFamilyLabel(model.id)}
                </Text>
                <Text
                  style={{
                    ...theme.typography.captionM,
                    color: theme.colors.onSurfaceVariant,
                    marginTop: 2,
                  }}
                  numberOfLines={1}>
                  {model.id}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 6,
                    marginTop: 6,
                    flexWrap: 'wrap',
                  }}>
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
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.surfaceVariant,
                }}>
                <HeartGlyph active={isFavorite} />
              </Pressable>
            </View>

            {/* ── Compatibility banner ── */}
            {compatibility && (
              <View
                style={{
                  marginHorizontal: 20,
                  marginTop: 16,
                  borderRadius: 14,
                  padding: 14,
                  backgroundColor: theme.colors.surfaceVariant,
                }}>
                <View
                  style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: COMPAT_COLORS[compatibility.level],
                    }}
                  />
                  <Text
                    style={{
                      ...theme.typography.uiM,
                      fontWeight: '700',
                      color: COMPAT_COLORS[compatibility.level],
                    }}>
                    {t.compat?.[compatibility.level] ?? compatibility.level}
                  </Text>
                  <Text
                    style={{
                      ...theme.typography.captionM,
                      color: theme.colors.onSurfaceVariant,
                    }}>
                    {t.fitScore?.replace(
                      '{score}',
                      String(compatibility.score),
                    ) ?? `${compatibility.score}/100`}
                  </Text>
                </View>
                <View style={{marginTop: 10, gap: 6}}>
                  {compatibility.reasons.map(reason => (
                    <View
                      key={reason.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                      <Text
                        style={{
                          fontSize: 13,
                          color:
                            reason.severity === 'error'
                              ? theme.colors.error
                              : reason.severity === 'warning'
                                ? '#F59E0B'
                                : reason.severity === 'ok'
                                  ? '#059669'
                                  : theme.colors.onSurfaceVariant,
                          fontWeight: '700',
                        }}>
                        {reason.severity === 'error'
                          ? '✕'
                          : reason.severity === 'warning'
                            ? '⚠'
                            : reason.severity === 'ok'
                              ? '✓'
                              : '·'}
                      </Text>
                      <Text
                        style={{
                          ...theme.typography.bodyS,
                          color: theme.colors.onSurfaceVariant,
                          flex: 1,
                        }}>
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
            <View
              style={{
                flexDirection: 'row',
                marginHorizontal: 20,
                marginTop: 16,
                borderRadius: 12,
                backgroundColor: theme.colors.surfaceVariant,
                padding: 4,
              }}>
              {(['overview', 'technical', 'files'] as TabKey[]).map(key => (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 9,
                    alignItems: 'center',
                    backgroundColor:
                      tab === key ? theme.colors.surface : 'transparent',
                  }}
                  accessibilityRole="tab">
                  <Text
                    style={{
                      ...theme.typography.uiS,
                      fontWeight: '600',
                      color:
                        tab === key
                          ? theme.colors.onSurface
                          : theme.colors.onSurfaceVariant,
                    }}>
                    {t.tabs?.[key] ?? key}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── Overview ── */}
            {tab === 'overview' && (
              <View style={{paddingHorizontal: 20, marginTop: 16, gap: 14}}>
                <Text
                  style={{
                    ...theme.typography.bodyS,
                    color: theme.colors.onSurfaceVariant,
                    lineHeight: 21,
                  }}>
                  {buildOverview(model, categories, t)}
                </Text>

                <View>
                  <Text
                    style={{
                      ...theme.typography.uiM,
                      fontWeight: '700',
                      color: theme.colors.onSurface,
                    }}>
                    {t.capabilitiesTitle}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 8,
                    }}>
                    {capabilitiesFor(model, categories, engineBlocked, t).map(
                      cap => (
                        <View
                          key={cap.label}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 10,
                            backgroundColor: theme.colors.surfaceVariant,
                          }}>
                          <Text
                            style={{
                              fontSize: 12,
                              color: cap.ok ? '#059669' : '#F59E0B',
                              fontWeight: '700',
                            }}>
                            {cap.ok ? '✓' : '·'}
                          </Text>
                          <Text
                            style={{
                              ...theme.typography.captionM,
                              color: theme.colors.onSurface,
                            }}>
                            {cap.label}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                </View>

                {installedModels.length > 0 && (
                  <View
                    style={{
                      borderRadius: 12,
                      padding: 12,
                      backgroundColor: theme.colors.surfaceVariant,
                    }}>
                    <Text
                      style={{
                        ...theme.typography.uiS,
                        fontWeight: '700',
                        color: theme.colors.onSurface,
                      }}>
                      {t.installedFromRepo}
                    </Text>
                    {installedModels.map(m => (
                      <Text
                        key={m.id}
                        style={{
                          ...theme.typography.captionM,
                          color: theme.colors.onSurfaceVariant,
                          marginTop: 4,
                        }}>
                        {m.filename}
                      </Text>
                    ))}
                  </View>
                )}

                <Pressable
                  onPress={() => modelHubStore.recordView(model.id)}
                  style={{display: 'none'}}
                />
              </View>
            )}

            {/* ── Technical ── */}
            {tab === 'technical' && (
              <View style={{paddingHorizontal: 20, marginTop: 16}}>
                <View
                  style={{
                    borderRadius: 14,
                    backgroundColor: theme.colors.surfaceVariant,
                    padding: 14,
                    gap: 10,
                  }}>
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
              <View style={{paddingHorizontal: 20, marginTop: 16}}>
                {files.length === 0 && (
                  <Text
                    style={{
                      ...theme.typography.bodyS,
                      color: theme.colors.onSurfaceVariant,
                    }}>
                    {t.noFiles}
                  </Text>
                )}
                {files.map((file: ModelFile) => {
                  const size = file.lfs?.size ?? file.size ?? 0;
                  const quant = extractQuantLabel(file.rfilename);
                  const isInstalled = installedModels.some(
                    m => m.filename === file.rfilename,
                  );
                  return (
                    <View
                      key={file.rfilename}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.outlineVariant,
                        gap: 10,
                      }}>
                      <View style={{flex: 1}}>
                        <Text
                          style={{
                            ...theme.typography.uiS,
                            fontWeight: '600',
                            color: theme.colors.onSurface,
                          }}
                          numberOfLines={1}>
                          {file.rfilename}
                        </Text>
                        <Text
                          style={{
                            ...theme.typography.captionM,
                            color: theme.colors.onSurfaceVariant,
                            marginTop: 2,
                          }}>
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
                        <View
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            borderRadius: 10,
                            backgroundColor: theme.colors.surfaceVariant,
                          }}>
                          <Text
                            style={{
                              ...theme.typography.captionM,
                              color: theme.colors.onSurfaceVariant,
                              fontWeight: '700',
                            }}>
                            {t.installedBadge}
                          </Text>
                        </View>
                      ) : engineBlocked ? (
                        <Text
                          style={{
                            ...theme.typography.captionM,
                            color: theme.colors.onSurfaceVariant,
                          }}>
                          {t.engineNo ?? '—'}
                        </Text>
                      ) : (
                        <Pressable
                          onPress={() => setConfirmFile(file)}
                          accessibilityRole="button"
                          accessibilityLabel={t.downloadFile}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 10,
                            backgroundColor: '#7C3AED',
                          }}>
                          <Text
                            style={{
                              ...theme.typography.captionM,
                              color: '#FFFFFF',
                              fontWeight: '700',
                            }}>
                            {t.downloadShort ?? '↓'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}

                {mmprojFiles.length > 0 && (
                  <View style={{marginTop: 16}}>
                    <Text
                      style={{
                        ...theme.typography.uiM,
                        fontWeight: '700',
                        color: theme.colors.onSurface,
                      }}>
                      {t.visionFilesTitle}
                    </Text>
                    <Text
                      style={{
                        ...theme.typography.captionM,
                        color: theme.colors.onSurfaceVariant,
                        marginTop: 4,
                      }}>
                      {t.visionFilesHint}
                    </Text>
                    {mmprojFiles.map((file: ModelFile) => (
                      <Text
                        key={file.rfilename}
                        style={{
                          ...theme.typography.captionM,
                          color: theme.colors.onSurfaceVariant,
                          marginTop: 4,
                        }}>
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
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: brand ? '#7C3AED1F' : theme.colors.surfaceVariant,
      }}>
      <Text
        style={{
          ...theme.typography.captionM,
          fontWeight: '700',
          color: brand ? '#7C3AED' : theme.colors.onSurfaceVariant,
        }}>
        {label}
      </Text>
    </View>
  );
};

const HeartGlyph: React.FC<{active: boolean}> = ({active}) => (
  <Text style={{fontSize: 18, color: active ? '#EC4899' : '#94A3B8'}}>
    {active ? '♥' : '♡'}
  </Text>
);

const TechRow: React.FC<{label?: string; value: string; theme: any}> = ({
  label,
  value,
  theme,
}) => (
  <View
    style={{flexDirection: 'row', justifyContent: 'space-between', gap: 12}}>
    <Text
      style={{...theme.typography.bodyS, color: theme.colors.onSurfaceVariant}}>
      {label ?? ''}
    </Text>
    <Text
      style={{
        ...theme.typography.bodyS,
        fontWeight: '600',
        color: theme.colors.onSurface,
        flexShrink: 1,
      }}
      numberOfLines={2}>
      {value}
    </Text>
  </View>
);

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
