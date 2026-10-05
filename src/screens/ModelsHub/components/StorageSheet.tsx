import React, {useContext, useEffect, useState} from 'react';
import {ScrollView, Text, View, Pressable, Alert} from 'react-native';
import {observer} from 'mobx-react-lite';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {useTheme} from '../../../hooks';
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

    return (
      <Sheet
        isVisible={visible}
        snapPoints={['85%']}
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={onClose}
        showCloseButton>
        <ScrollView
          contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 40}}>
          {/* Totals */}
          <View
            style={{
              flexDirection: 'row',
              borderRadius: 16,
              backgroundColor: theme.colors.surfaceVariant,
              padding: 16,
              gap: 12,
            }}>
            <View style={{flex: 1}}>
              <Text
                style={{
                  ...theme.typography.captionM,
                  color: theme.colors.onSurfaceVariant,
                }}>
                {t.storage?.used}
              </Text>
              <Text
                style={{
                  ...theme.typography.titleM,
                  fontWeight: '800',
                  color: theme.colors.onSurface,
                  marginTop: 2,
                }}>
                {stats.loading ? '…' : usedLabel}
              </Text>
            </View>
            <View style={{flex: 1}}>
              <Text
                style={{
                  ...theme.typography.captionM,
                  color: theme.colors.onSurfaceVariant,
                }}>
                {t.storage?.available}
              </Text>
              <Text
                style={{
                  ...theme.typography.titleM,
                  fontWeight: '800',
                  color: '#059669',
                  marginTop: 2,
                }}>
                {stats.loading ? '…' : freeLabel}
              </Text>
            </View>
          </View>

          {/* Per-category distribution */}
          {categoryEntries.length > 0 && (
            <View style={{marginTop: 18}}>
              <Text
                style={{
                  ...theme.typography.uiM,
                  fontWeight: '700',
                  color: theme.colors.onSurface,
                }}>
                {t.storage?.distribution}
              </Text>
              <View style={{marginTop: 10, gap: 8}}>
                {categoryEntries.map(([cat, bytes]) => {
                  const ratio =
                    stats.totalUsedBytes > 0 ? bytes / stats.totalUsedBytes : 0;
                  const gradient =
                    CATEGORY_GRADIENTS[
                      cat as keyof typeof CATEGORY_GRADIENTS
                    ] ?? CATEGORY_GRADIENTS.general;
                  return (
                    <View key={cat}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                        }}>
                        <Text
                          style={{
                            ...theme.typography.captionM,
                            color: theme.colors.onSurfaceVariant,
                          }}>
                          {t.categories?.[cat] ?? cat}
                        </Text>
                        <Text
                          style={{
                            ...theme.typography.captionM,
                            fontWeight: '700',
                            color: theme.colors.onSurface,
                          }}>
                          {formatBytes(bytes)}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: theme.colors.surfaceVariant,
                          marginTop: 4,
                          overflow: 'hidden',
                        }}>
                        <View
                          style={{
                            width: `${Math.max(2, ratio * 100)}%`,
                            height: '100%',
                            borderRadius: 3,
                            backgroundColor: gradient[0],
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Largest models */}
          {stats.largest.length > 0 && (
            <View style={{marginTop: 20}}>
              <Text
                style={{
                  ...theme.typography.uiM,
                  fontWeight: '700',
                  color: theme.colors.onSurface,
                }}>
                {t.storage?.largest}
              </Text>
              <View style={{marginTop: 8}}>
                {stats.largest.map(({model, bytes}) => (
                  <View
                    key={model.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
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
                        {extractFamilyLabel(model.repo ?? model.name)}
                      </Text>
                      <Text
                        style={{
                          ...theme.typography.captionM,
                          color: theme.colors.onSurfaceVariant,
                          marginTop: 2,
                        }}>
                        {model.filename} · {formatBytes(bytes)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => deleteModel(model)}
                      accessibilityRole="button"
                      accessibilityLabel={l10n.common.delete}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 10,
                        backgroundColor: theme.colors.errorContainer,
                      }}>
                      <Text
                        style={{
                          ...theme.typography.captionM,
                          fontWeight: '700',
                          color: theme.colors.error,
                        }}>
                        {l10n.common.delete}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Orphan cleanup */}
          <View style={{marginTop: 20}}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
              <Text
                style={{
                  ...theme.typography.uiM,
                  fontWeight: '700',
                  color: theme.colors.onSurface,
                }}>
                {t.storage?.orphans}
              </Text>
              {stats.orphans.length > 0 && (
                <Pressable
                  onPress={cleanOrphans}
                  accessibilityRole="button"
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 10,
                    backgroundColor: theme.colors.surfaceVariant,
                  }}>
                  <Text
                    style={{
                      ...theme.typography.captionM,
                      fontWeight: '700',
                      color: theme.colors.onSurface,
                    }}>
                    {t.storage?.cleanNow}
                  </Text>
                </Pressable>
              )}
            </View>
            <Text
              style={{
                ...theme.typography.captionM,
                color: theme.colors.onSurfaceVariant,
                marginTop: 4,
              }}>
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
