import React, {useContext, useEffect, useState} from 'react';
import {
  ScrollView,
  Text,
  View,
  Pressable,
  Alert,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import {observer} from 'mobx-react-lite';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {useTheme} from '../../../hooks';
import {hubStatusColors} from '../hubStatus';
import {L10nContext} from '../../../utils';
import {modelStore} from '../../../store';
import {Model} from '../../../utils/types';
import {formatBytes} from '../../../utils';
import {
  modelPrimaryCategory,
  extractFamilyLabel,
} from '../../../utils/modelTaxonomy';

import {Sheet} from '../../../components';
import {getFreeDiskBytes} from '../hooks/useDeviceProfile';
import {CATEGORY_GRADIENTS} from './HubPrimitives';

interface StorageSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface StorageStats {
  totalUsedBytes: number;
  freeBytes: number | null;
  perCategory: Record<string, number>;
  largest: Array<{model: Model; bytes: number}>;
  orphans: Array<{path: string; size: number}>;
  loading: boolean;
}

const MODELS_ROOT = (): string => `${RNFS.DocumentDirectoryPath}/models`;

/**
 * Storage manager for installed models: real on-disk sizes (stat of every
 * registered model file), per-category rollup, orphan/incomplete file sweep
 * of the models directory, and per-model delete actions.
 */
export const StorageSheet: React.FC<StorageSheetProps> = observer(
  ({visible, onClose}) => {
    const l10n = useContext(L10nContext);
    const theme = useTheme();
    const t = (l10n as any).modelsHub ?? {};
    const [stats, setStats] = useState<StorageStats>({
      totalUsedBytes: 0,
      freeBytes: null,
      perCategory: {},
      largest: [],
      orphans: [],
      loading: true,
    });

    useEffect(() => {
      if (!visible) {
        return;
      }
      let cancelled = false;
      (async () => {
        setStats(s => ({...s, loading: true}));
        const downloaded = modelStore.models.filter(m => m.isDownloaded);
        const perCategory: Record<string, number> = {};
        const sized: Array<{model: Model; bytes: number}> = [];
        let totalUsed = 0;

        for (const model of downloaded) {
          try {
            const fullPath = await modelStore.getModelFullPath(model);
            if (await RNFS.exists(fullPath)) {
              const stat = await RNFS.stat(fullPath);
              const bytes = Number(stat.size) || 0;
              totalUsed += bytes;
              sized.push({model, bytes});
              const cat = modelPrimaryCategory(model);
              perCategory[cat] = (perCategory[cat] ?? 0) + bytes;
            }
          } catch {
            // Missing file — refreshDownloadStatuses will reconcile elsewhere.
          }
        }

        // Orphan sweep: any file under models/ that no registered model claims.
        const orphans: Array<{path: string; size: number}> = [];
        try {
          const claimed = new Set<string>();
          for (const model of modelStore.models) {
            if (model.fullPath) {
              claimed.add(model.fullPath);
            }
          }
          const walk = async (dir: string) => {
            const items = await RNFS.readDir(dir);
            for (const item of items) {
              if (item.isDirectory()) {
                await walk(item.path);
              } else if (!claimed.has(item.path)) {
                // Skip active partial downloads (they belong to running jobs).
                orphans.push({path: item.path, size: Number(item.size) || 0});
              }
            }
          };
          if (await RNFS.exists(MODELS_ROOT())) {
            await walk(MODELS_ROOT());
          }
        } catch {
          // Best-effort scan; absence of results is acceptable.
        }
        orphans.sort((a, b) => b.size - a.size);

        const free = await getFreeDiskBytes();
        sized.sort((a, b) => b.bytes - a.bytes);
        if (!cancelled) {
          setStats({
            totalUsedBytes: totalUsed,
            freeBytes: free,
            perCategory,
            largest: sized.slice(0, 5),
            orphans: orphans.slice(0, 20),
            loading: false,
          });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [visible]);

    const deleteModel = (model: Model) => {
      Alert.alert(
        t.storage?.deleteTitle ?? '',
        `${extractFamilyLabel(model.repo ?? model.name)} — ${formatBytes(model.size)}`,
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: () => {
              modelStore.deleteModel(model);
            },
          },
        ],
      );
    };

    const cleanOrphans = () => {
      const {orphans} = stats;
      if (orphans.length === 0) {
        return;
      }
      Alert.alert(
        t.storage?.cleanTitle ?? '',
        t.storage?.cleanMessage?.replace('{count}', String(orphans.length)) ??
          '',
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: t.storage?.cleanConfirm ?? l10n.common.delete,
            style: 'destructive',
            onPress: async () => {
              for (const orphan of orphans) {
                try {
                  if (await RNFS.exists(orphan.path)) {
                    await RNFS.unlink(orphan.path);
                  }
                } catch {
                  // ignore individual failures
                }
              }
              setStats(s => ({...s, orphans: []}));
            },
          },
        ],
      );
    };

    const categoryEntries = Object.entries(stats.perCategory).sort(
      (a, b) => b[1] - a[1],
    );
    const usedLabel = formatBytes(stats.totalUsedBytes);
    const freeLabel =
      stats.freeBytes != null ? formatBytes(stats.freeBytes) : t.notAvailable;

    // Theme-derived style fragments (static fragments live in `styles` at
    // the bottom of the file); referenced by the style arrays in the JSX
    // below so no object literals sit inline on style props.
    const onSurfaceText = {color: theme.colors.onSurface};
    const mutedText = {color: theme.colors.onSurfaceVariant};
    const errorText = {color: theme.colors.error};
    const surfaceVariantBg = {backgroundColor: theme.colors.surfaceVariant};
    const errorContainerBg = {backgroundColor: theme.colors.errorContainer};
    const rowDivider = {borderBottomColor: theme.colors.outlineVariant};

    return (
      <Sheet
        isVisible={visible}
        snapPoints={['85%']}
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={onClose}
        showCloseButton>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Totals */}
          <View style={[styles.totalsCard, surfaceVariantBg]}>
            <View style={styles.flex1}>
              <Text style={[theme.typography.captionM, mutedText]}>
                {t.storage?.used}
              </Text>
              <Text
                style={[
                  theme.typography.titleM,
                  onSurfaceText,
                  styles.statValue,
                ]}>
                {stats.loading ? '…' : usedLabel}
              </Text>
            </View>
            <View style={styles.flex1}>
              <Text style={[theme.typography.captionM, mutedText]}>
                {t.storage?.available}
              </Text>
              <Text
                style={[
                  theme.typography.titleM,
                  styles.freeValue,
                  // Module-level styles can't see the theme; the status ink
                  // is applied inline (v1.36.0 dark-contrast fix).
                  {color: hubStatusColors(theme).ok},
                ]}>
                {stats.loading ? '…' : freeLabel}
              </Text>
            </View>
          </View>

          {/* Per-category distribution */}
          {categoryEntries.length > 0 && (
            <View style={styles.distributionSection}>
              <Text
                style={[theme.typography.uiM, onSurfaceText, styles.weight700]}>
                {t.storage?.distribution}
              </Text>
              <View style={styles.categoryList}>
                {categoryEntries.map(([cat, bytes]) => {
                  const ratio =
                    stats.totalUsedBytes > 0 ? bytes / stats.totalUsedBytes : 0;
                  const gradient =
                    CATEGORY_GRADIENTS[
                      cat as keyof typeof CATEGORY_GRADIENTS
                    ] ?? CATEGORY_GRADIENTS.general;
                  const barFillStyle: ViewStyle = {
                    width: `${Math.max(2, ratio * 100)}%`,
                    backgroundColor: gradient[0],
                  };
                  return (
                    <View key={cat}>
                      <View style={styles.rowBetween}>
                        <Text style={[theme.typography.captionM, mutedText]}>
                          {t.categories?.[cat] ?? cat}
                        </Text>
                        <Text
                          style={[
                            theme.typography.captionM,
                            onSurfaceText,
                            styles.weight700,
                          ]}>
                          {formatBytes(bytes)}
                        </Text>
                      </View>
                      <View style={[styles.barTrack, surfaceVariantBg]}>
                        <View style={[barFillStyle, styles.barFill]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Largest models */}
          {stats.largest.length > 0 && (
            <View style={styles.section}>
              <Text
                style={[theme.typography.uiM, onSurfaceText, styles.weight700]}>
                {t.storage?.largest}
              </Text>
              <View style={styles.mt8}>
                {stats.largest.map(({model, bytes}) => (
                  <View key={model.id} style={[styles.modelRow, rowDivider]}>
                    <View style={styles.flex1}>
                      <Text
                        style={[
                          theme.typography.uiS,
                          onSurfaceText,
                          styles.weight600,
                        ]}
                        numberOfLines={1}>
                        {extractFamilyLabel(model.repo ?? model.name)}
                      </Text>
                      <Text
                        style={[
                          theme.typography.captionM,
                          mutedText,
                          styles.mt2,
                        ]}>
                        {model.filename} · {formatBytes(bytes)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => deleteModel(model)}
                      accessibilityRole="button"
                      accessibilityLabel={l10n.common.delete}
                      style={[styles.chipButton, errorContainerBg]}>
                      <Text
                        style={[
                          theme.typography.captionM,
                          errorText,
                          styles.weight700,
                        ]}>
                        {l10n.common.delete}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Orphan cleanup */}
          <View style={styles.section}>
            <View style={styles.rowBetweenCenter}>
              <Text
                style={[theme.typography.uiM, onSurfaceText, styles.weight700]}>
                {t.storage?.orphans}
              </Text>
              {stats.orphans.length > 0 && (
                <Pressable
                  onPress={cleanOrphans}
                  accessibilityRole="button"
                  style={[styles.chipButton, surfaceVariantBg]}>
                  <Text
                    style={[
                      theme.typography.captionM,
                      onSurfaceText,
                      styles.weight700,
                    ]}>
                    {t.storage?.cleanNow}
                  </Text>
                </Pressable>
              )}
            </View>
            <Text style={[theme.typography.captionM, mutedText, styles.mt4]}>
              {stats.orphans.length > 0
                ? t.storage?.orphansFound
                    ?.replace('{count}', String(stats.orphans.length))
                    ?.replace(
                      '{size}',
                      formatBytes(
                        stats.orphans.reduce((acc, o) => acc + o.size, 0),
                      ),
                    )
                : t.storage?.orphansNone}
            </Text>
          </View>
        </ScrollView>
      </Sheet>
    );
  },
);

const styles = StyleSheet.create({
  // Shared static fragments
  flex1: {flex: 1},
  weight700: {fontWeight: '700'},
  weight600: {fontWeight: '600'},
  mt2: {marginTop: 2},
  mt4: {marginTop: 4},
  mt8: {marginTop: 8},
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between'},

  // StorageSheet
  scrollContent: {paddingHorizontal: 20, paddingBottom: 40},
  totalsCard: {flexDirection: 'row', borderRadius: 16, padding: 16, gap: 12},
  statValue: {fontWeight: '800', marginTop: 2},
  freeValue: {fontWeight: '800', color: '#059669', marginTop: 2},
  distributionSection: {marginTop: 18},
  categoryList: {marginTop: 10, gap: 8},
  barTrack: {height: 6, borderRadius: 3, marginTop: 4, overflow: 'hidden'},
  barFill: {height: '100%', borderRadius: 3},
  section: {marginTop: 20},
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  chipButton: {paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10},
  rowBetweenCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
