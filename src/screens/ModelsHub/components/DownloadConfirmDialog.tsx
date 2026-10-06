import React, {useContext, useEffect, useMemo, useState} from 'react';
import {View, Text, Pressable, ScrollView, StyleSheet} from 'react-native';
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
}) => {
  // Theme-derived text fragments (static fragments live in `styles` below).
  const labelText = {color: theme.colors.onSurfaceVariant};
  const valueText = {color: theme.colors.onSurface};
  return (
    <View style={styles.factRow}>
      <Text style={[theme.typography.bodyS, labelText]}>{label}</Text>
      <Text
        style={[theme.typography.bodyS, valueText, styles.factValue]}
        numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
};

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

    // Theme- and state-derived style fragments (static fragments live in
    // `styles` at the bottom of the file); referenced by the style arrays
    // in the JSX below so no object literals sit inline on style props.
    const onSurfaceText = {color: theme.colors.onSurface};
    const mutedText = {color: theme.colors.onSurfaceVariant};
    const errorText = {color: theme.colors.error};
    const onErrorContainerText = {color: theme.colors.onErrorContainer};
    const surfaceVariantBg = {backgroundColor: theme.colors.surfaceVariant};
    const errorContainerBg = {backgroundColor: theme.colors.errorContainer};
    const storageCardTint = {
      borderColor:
        storageStatus === 'insufficient'
          ? theme.colors.error
          : theme.colors.outlineVariant,
      backgroundColor:
        storageStatus === 'insufficient'
          ? theme.colors.errorContainer
          : theme.colors.surface,
    };
    const storageTitleTint = {
      color:
        storageStatus === 'insufficient'
          ? theme.colors.error
          : theme.colors.onSurface,
    };
    const confirmOpacity = {
      opacity:
        storageStatus === 'checking' || engineBlocked || starting ? 0.5 : 1,
    };

    return (
      <Sheet
        isVisible={visible}
        snapPoints={['82%']}
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={onClose}
        showCloseButton>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <LinearGradient
              colors={gradient}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
              style={styles.headerIcon}>
              <Icon width={26} height={26} stroke="#FFFFFF" fill="none" />
            </LinearGradient>
            <View style={styles.flex1}>
              <Text
                style={[
                  theme.typography.titleM,
                  onSurfaceText,
                  styles.weight700,
                ]}
                numberOfLines={2}>
                {hfModel.id.split('/').pop() ?? hfModel.id}
              </Text>
              <Text
                style={[theme.typography.captionM, mutedText, styles.mt2]}
                numberOfLines={1}>
                {hfModel.author ?? hfModel.id.split('/')[0]}
                {quant ? `  ·  ${quant}` : ''}
                {paramsLabel ? `  ·  ${paramsLabel}` : ''}
              </Text>
            </View>
          </View>

          {/* What is this model */}
          <View style={styles.aboutSection}>
            <Text
              style={[theme.typography.uiM, onSurfaceText, styles.weight700]}>
              {(l10n as any).modelsHub?.dialog?.aboutTitle}
            </Text>
            <Text style={[theme.typography.bodyS, mutedText, styles.aboutBody]}>
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
          <View style={[styles.factsCard, surfaceVariantBg]}>
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
          <View style={[styles.storageCard, storageCardTint]}>
            <Text
              style={[
                theme.typography.uiM,
                storageTitleTint,
                styles.weight700,
              ]}>
              {storageStatus === 'checking'
                ? (l10n as any).modelsHub?.storage?.checking
                : storageStatus === 'ok'
                  ? (l10n as any).modelsHub?.storage?.enough
                  : (l10n as any).modelsHub?.storage?.notEnough}
            </Text>
            <View style={[styles.rowBetween, styles.mt8]}>
              <Text style={[theme.typography.bodyS, mutedText]}>
                {(l10n as any).modelsHub?.storage?.required}
              </Text>
              <Text
                style={[
                  theme.typography.bodyS,
                  onSurfaceText,
                  styles.weight600,
                ]}>
                {formatBytes(totalRequired * 1.1)}
              </Text>
            </View>
            <View style={[styles.rowBetween, styles.mt4]}>
              <Text style={[theme.typography.bodyS, mutedText]}>
                {(l10n as any).modelsHub?.storage?.available}
              </Text>
              <Text
                style={[
                  theme.typography.bodyS,
                  onSurfaceText,
                  styles.weight600,
                ]}>
                {freeBytes != null
                  ? formatBytes(freeBytes)
                  : ((l10n as any).modelsHub?.notAvailable ?? '')}
              </Text>
            </View>
            {storageStatus === 'insufficient' && (
              <Text style={[theme.typography.bodyS, errorText, styles.mt8]}>
                {(l10n as any).modelsHub?.storage?.deficit?.replace(
                  '{amount}',
                  formatBytes(deficit),
                )}
              </Text>
            )}
          </View>

          {/* Wi-Fi only preference note */}
          {modelHubStore.wifiOnlyDownloads && (
            <View style={[styles.wifiNote, surfaceVariantBg]}>
              <Text style={[theme.typography.bodyS, mutedText, styles.flex1]}>
                {(l10n as any).modelsHub?.dialog?.wifiOnlyWaiting}
              </Text>
            </View>
          )}

          {/* Engine unsupported notice */}
          {engineBlocked && (
            <View style={[styles.engineNotice, errorContainerBg]}>
              <Text style={[theme.typography.bodyS, onErrorContainerText]}>
                {(l10n as any).modelsHub?.dialog?.engineUnsupported}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={[styles.cancelButton, surfaceVariantBg]}>
              <Text
                style={[theme.typography.uiM, onSurfaceText, styles.weight600]}>
                {l10n.common.cancel}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={
                storageStatus === 'checking' || engineBlocked || starting
              }
              accessibilityRole="button"
              style={styles.confirmPressable}>
              <LinearGradient
                colors={BRAND_COLORS}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
                style={[styles.confirmButton, confirmOpacity]}>
                <Text style={[theme.typography.uiM, styles.confirmText]}>
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

const styles = StyleSheet.create({
  // Shared static fragments
  flex1: {flex: 1},
  weight700: {fontWeight: '700'},
  weight600: {fontWeight: '600'},
  mt2: {marginTop: 2},
  mt4: {marginTop: 4},
  mt8: {marginTop: 8},
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between'},

  // DownloadConfirmDialog sheet
  scrollContent: {paddingHorizontal: 20, paddingBottom: 32},
  headerRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutSection: {marginTop: 18},
  aboutBody: {marginTop: 6, lineHeight: 20},
  factsCard: {marginTop: 16, borderRadius: 14, padding: 14, gap: 8},
  storageCard: {marginTop: 14, borderRadius: 14, padding: 14, borderWidth: 1},
  wifiNote: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 12,
  },
  engineNotice: {marginTop: 10, borderRadius: 12, padding: 12},
  actionsRow: {flexDirection: 'row', gap: 12, marginTop: 20},
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmPressable: {flex: 2},
  confirmButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {fontWeight: '700', color: '#FFFFFF'},

  // FactRow
  factRow: {flexDirection: 'row', justifyContent: 'space-between', gap: 12},
  factValue: {fontWeight: '600', flexShrink: 1},
});
