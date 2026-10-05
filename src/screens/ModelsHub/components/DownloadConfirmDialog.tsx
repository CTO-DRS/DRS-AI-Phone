import React, {useContext, useEffect, useMemo, useState} from 'react';
import {View, Text, Pressable, ScrollView} from 'react-native';
import {observer} from 'mobx-react-lite';
import LinearGradient from 'react-native-linear-gradient';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {modelStore, modelHubStore, uiStore} from '../../../store';
import {HuggingFaceModel, ModelFile} from '../../../utils/types';
import {
  classifyHfModel,
  isUnavailableOnDeviceEngine,
  extractQuantLabel,
} from '../../../utils/modelTaxonomy';
import {formatBytes, getVisionModelSizeBreakdown} from '../../../utils';
import {isVisionRepo} from '../../../utils/multimodalHelpers';

import {Sheet} from '../../../components';
import {getFreeDiskBytes} from '../hooks/useDeviceProfile';
import {CATEGORY_ICONS, CATEGORY_GRADIENTS} from './HubPrimitives';

const BRAND_COLORS = ['#7C3AED', '#2563EB'];

const FactRow: React.FC<{label: string; value: string; theme: any}> = ({
  label,
  value,
  theme,
}) => (
  <View
    style={{flexDirection: 'row', justifyContent: 'space-between', gap: 12}}>
    <Text
      style={{...theme.typography.bodyS, color: theme.colors.onSurfaceVariant}}>
      {label}
    </Text>
    <Text
      style={{
        ...theme.typography.bodyS,
        fontWeight: '600',
        color: theme.colors.onSurface,
        flexShrink: 1,
      }}
      numberOfLines={1}>
      {value}
    </Text>
  </View>
);

interface DownloadConfirmDialogProps {
  visible: boolean;
  hfModel: HuggingFaceModel | null;
  modelFile: ModelFile | null;
  onClose: () => void;
}

type StorageStatus = 'checking' | 'ok' | 'insufficient';

/**
 * Modern download confirmation sheet.
 *
 * Shows what the user is about to download (real repo/file data), what it
 * needs (size, extra mmproj files, RAM), and performs a REAL storage check
 * against the device's current free space before the download is allowed.
 * A Wi-Fi-only preference with an active cellular connection is surfaced
 * honestly: the download will be queued by the OS until Wi-Fi returns.
 */
export const DownloadConfirmDialog: React.FC<DownloadConfirmDialogProps> =
  observer(({visible, hfModel, modelFile, onClose}) => {
    const l10n = useContext(L10nContext);
    const theme = useTheme();

    const [storageStatus, setStorageStatus] =
      useState<StorageStatus>('checking');
    const [freeBytes, setFreeBytes] = useState<number | null>(null);
    const [starting, setStarting] = useState(false);

    const category = hfModel
      ? (classifyHfModel(hfModel)[0] ?? 'general')
      : 'general';
    const Icon = CATEGORY_ICONS[category];
    const gradient = CATEGORY_GRADIENTS[category];
    const engineBlocked = hfModel
      ? classifyHfModel(hfModel).length > 0 &&
        classifyHfModel(hfModel).every(isUnavailableOnDeviceEngine)
      : false;

    const fileSize = modelFile?.lfs?.size ?? modelFile?.size ?? 0;

    // Extra mmproj payload the app will chain-download for vision repos.
    const visionExtra = useMemo(() => {
      if (!hfModel || !isVisionRepo(hfModel.siblings ?? [])) {
        return 0;
      }
      try {
        const breakdown = getVisionModelSizeBreakdown(
          modelFile as any,
          hfModel as any,
        );
        return Math.max(0, breakdown?.projectionSize ?? 0);
      } catch {
        return 0;
      }
    }, [hfModel, modelFile]);

    const totalRequired = fileSize + visionExtra;

    useEffect(() => {
      if (!visible) {
        return;
      }
      setStorageStatus('checking');
      let cancelled = false;
      (async () => {
        const free = await getFreeDiskBytes();
        if (cancelled) {
          return;
        }
        setFreeBytes(free);
        // 1.1x headroom over the raw payload for temp/merge overhead.
        const needed = totalRequired * 1.1;
        if (free == null) {
          setStorageStatus('ok'); // cannot verify — let the engine's own check decide
        } else if (free >= needed) {
          setStorageStatus('ok');
        } else {
          setStorageStatus('insufficient');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [visible, totalRequired]);

    if (!hfModel || !modelFile) {
      return null;
    }

    const paramsLabel =
      hfModel.specs?.gguf?.total != null
        ? `${(hfModel.specs.gguf.total / 1_000_000_000).toFixed(1)}B`
        : null;
    const quant = extractQuantLabel(modelFile.rfilename);
    const family = hfModel.specs?.gguf?.architecture;

    const handleConfirm = async () => {
      if (starting || engineBlocked) {
        return;
      }
      setStarting(true);
      try {
        await modelStore.downloadHFModel(hfModel, modelFile, {
          enableVision: true,
        });
        uiStore.showSuccess(
          (l10n as any).modelsHub?.downloadStarted ?? 'Download started',
        );
        onClose();
      } catch {
        // downloadHFModel surfaces its own error state (snackbar/dialog).
      } finally {
        setStarting(false);
      }
    };

    const deficit = freeBytes != null ? totalRequired * 1.1 - freeBytes : 0;

    return (
      <Sheet
        isVisible={visible}
        snapPoints={['82%']}
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={onClose}
        showCloseButton>
        <ScrollView
          contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 32}}>
          {/* Header */}
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
            <LinearGradient
              colors={gradient}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon width={26} height={26} stroke="#FFFFFF" fill="none" />
            </LinearGradient>
            <View style={{flex: 1}}>
              <Text
                style={{
                  ...theme.typography.titleM,
                  color: theme.colors.onSurface,
                  fontWeight: '700',
                }}
                numberOfLines={2}>
                {hfModel.id.split('/').pop() ?? hfModel.id}
              </Text>
              <Text
                style={{
                  ...theme.typography.captionM,
                  color: theme.colors.onSurfaceVariant,
                  marginTop: 2,
                }}
                numberOfLines={1}>
                {hfModel.author ?? hfModel.id.split('/')[0]}
                {quant ? `  ·  ${quant}` : ''}
                {paramsLabel ? `  ·  ${paramsLabel}` : ''}
              </Text>
            </View>
          </View>

          {/* What is this model */}
          <View style={{marginTop: 18}}>
            <Text
              style={{
                ...theme.typography.uiM,
                color: theme.colors.onSurface,
                fontWeight: '700',
              }}>
              {(l10n as any).modelsHub?.dialog?.aboutTitle}
            </Text>
            <Text
              style={{
                ...theme.typography.bodyS,
                color: theme.colors.onSurfaceVariant,
                marginTop: 6,
                lineHeight: 20,
              }}>
              {(l10n as any).modelsHub?.dialog?.aboutTemplate
                ?.replace(
                  '{family}',
                  family ??
                    (l10n as any).modelsHub?.dialog?.familyUnknown ??
                    'GGUF',
                )
                .replace(
                  '{author}',
                  hfModel.author ?? hfModel.id.split('/')[0],
                )}
            </Text>
          </View>

          {/* Facts grid */}
          <View
            style={{
              marginTop: 16,
              borderRadius: 14,
              backgroundColor: theme.colors.surfaceVariant,
              padding: 14,
              gap: 8,
            }}>
            <FactRow
              label={(l10n as any).modelsHub?.dialog?.file ?? ''}
              value={modelFile.rfilename}
              theme={theme}
            />
            <FactRow
              label={(l10n as any).modelsHub?.dialog?.downloadSize ?? ''}
              value={
                fileSize > 0
                  ? formatBytes(fileSize)
                  : ((l10n as any).modelsHub?.notAvailable ?? '')
              }
              theme={theme}
            />
            {visionExtra > 0 && (
              <FactRow
                label={(l10n as any).modelsHub?.dialog?.extraVisionFiles ?? ''}
                value={formatBytes(visionExtra)}
                theme={theme}
              />
            )}
            <FactRow
              label={(l10n as any).modelsHub?.dialog?.storageAfter ?? ''}
              value={
                totalRequired > 0
                  ? formatBytes(totalRequired)
                  : ((l10n as any).modelsHub?.notAvailable ?? '')
              }
              theme={theme}
            />
            <FactRow
              label={(l10n as any).modelsHub?.dialog?.offline ?? ''}
              value={(l10n as any).modelsHub?.dialog?.offlineYes ?? ''}
              theme={theme}
            />
            {hfModel.specs?.gguf?.context_length != null && (
              <FactRow
                label={(l10n as any).modelsHub?.dialog?.context ?? ''}
                value={hfModel.specs.gguf.context_length.toLocaleString()}
                theme={theme}
              />
            )}
          </View>

          {/* Storage check */}
          <View
            style={{
              marginTop: 14,
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor:
                storageStatus === 'insufficient'
                  ? theme.colors.error
                  : theme.colors.outlineVariant,
              backgroundColor:
                storageStatus === 'insufficient'
                  ? theme.colors.errorContainer
                  : theme.colors.surface,
            }}>
            <Text
              style={{
                ...theme.typography.uiM,
                fontWeight: '700',
                color:
                  storageStatus === 'insufficient'
                    ? theme.colors.error
                    : theme.colors.onSurface,
              }}>
              {storageStatus === 'checking'
                ? (l10n as any).modelsHub?.storage?.checking
                : storageStatus === 'ok'
                  ? (l10n as any).modelsHub?.storage?.enough
                  : (l10n as any).modelsHub?.storage?.notEnough}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 8,
              }}>
              <Text
                style={{
                  ...theme.typography.bodyS,
                  color: theme.colors.onSurfaceVariant,
                }}>
                {(l10n as any).modelsHub?.storage?.required}
              </Text>
              <Text
                style={{
                  ...theme.typography.bodyS,
                  fontWeight: '600',
                  color: theme.colors.onSurface,
                }}>
                {formatBytes(totalRequired * 1.1)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 4,
              }}>
              <Text
                style={{
                  ...theme.typography.bodyS,
                  color: theme.colors.onSurfaceVariant,
                }}>
                {(l10n as any).modelsHub?.storage?.available}
              </Text>
              <Text
                style={{
                  ...theme.typography.bodyS,
                  fontWeight: '600',
                  color: theme.colors.onSurface,
                }}>
                {freeBytes != null
                  ? formatBytes(freeBytes)
                  : ((l10n as any).modelsHub?.notAvailable ?? '')}
              </Text>
            </View>
            {storageStatus === 'insufficient' && (
              <Text
                style={{
                  ...theme.typography.bodyS,
                  color: theme.colors.error,
                  marginTop: 8,
                }}>
                {(l10n as any).modelsHub?.storage?.deficit?.replace(
                  '{amount}',
                  formatBytes(deficit),
                )}
              </Text>
            )}
          </View>

          {/* Wi-Fi only preference note */}
          {modelHubStore.wifiOnlyDownloads && (
            <View
              style={{
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderRadius: 12,
                padding: 12,
                backgroundColor: theme.colors.surfaceVariant,
              }}>
              <Text
                style={{
                  ...theme.typography.bodyS,
                  color: theme.colors.onSurfaceVariant,
                  flex: 1,
                }}>
                {(l10n as any).modelsHub?.dialog?.wifiOnlyWaiting}
              </Text>
            </View>
          )}

          {/* Engine unsupported notice */}
          {engineBlocked && (
            <View
              style={{
                marginTop: 10,
                borderRadius: 12,
                padding: 12,
                backgroundColor: theme.colors.errorContainer,
              }}>
              <Text
                style={{
                  ...theme.typography.bodyS,
                  color: theme.colors.onErrorContainer,
                }}>
                {(l10n as any).modelsHub?.dialog?.engineUnsupported}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              marginTop: 20,
            }}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={{
                flex: 1,
                height: 48,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surfaceVariant,
              }}>
              <Text
                style={{
                  ...theme.typography.uiM,
                  fontWeight: '600',
                  color: theme.colors.onSurface,
                }}>
                {l10n.common.cancel}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={
                storageStatus === 'checking' || engineBlocked || starting
              }
              accessibilityRole="button"
              style={{flex: 2}}>
              <LinearGradient
                colors={BRAND_COLORS}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
                style={{
                  height: 48,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity:
                    storageStatus === 'checking' || engineBlocked || starting
                      ? 0.5
                      : 1,
                }}>
                <Text
                  style={{
                    ...theme.typography.uiM,
                    fontWeight: '700',
                    color: '#FFFFFF',
                  }}>
                  {starting
                    ? (l10n as any).modelsHub?.dialog?.starting
                    : (l10n as any).modelsHub?.dialog?.confirmDownload}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </Sheet>
    );
  });
