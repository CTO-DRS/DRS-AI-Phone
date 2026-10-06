import React, {useState, useContext, useEffect, useMemo} from 'react';
import {
  FlatList,
  RefreshControl,
  Platform,
  Alert,
  View,
  ScrollView,
  Text,
  Pressable,
  TextInput,
} from 'react-native';
import {reaction} from 'mobx';
import {v4 as uuidv4} from 'uuid';
import 'react-native-get-random-values';
import {observer} from 'mobx-react-lite';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick, types} from '@react-native-documents/picker';
import {Portal, Snackbar} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {
  ModelIcon,
  SearchIcon,
  CloseIcon,
  DownloadIcon,
  TrashIcon,
  GridIcon,
} from '../../assets/icons';

import {
  DownloadErrorDialog,
  ErrorSnackbar,
  ModelSettingsSheet,
  ModelErrorReportSheet,
  RemoteModelSheet,
  ServerDetailsSheet,
} from '../../components';

import {
  uiStore,
  modelStore,
  hfStore,
  serverStore,
  modelHubStore,
} from '../../store';

import {L10nContext} from '../../utils';
import {Model, HuggingFaceModel, ModelFile} from '../../utils/types';
import {ErrorState} from '../../utils/errors';
import {
  ModelCategory,
  classifyModel,
  classifyHfModel,
  primaryCategory,
} from '../../utils/modelTaxonomy';
import {
  computeModelCompatibility,
  CompatibilityLevel,
} from '../../utils/compatibility';

import {ModelCard} from '../ModelsScreen/ModelCard';
import {FABGroup} from '../ModelsScreen/FABGroup';
import {HFModelSearch} from '../ModelsScreen/HFModelSearch';

import {createStyles} from './styles';
import {useHfCatalog} from './hooks/useHfCatalog';
import {gatherDeviceProfile, useDeviceProfile} from './hooks/useDeviceProfile';
import {
  HubCategoryGrid,
  HubCatalogCard,
  HubEmptyState,
  HubSkeletonCard,
  HubInlineStatus,
} from './components/HubPrimitives';
import {ModelDetailsSheet} from './components/ModelDetailsSheet';
import {DownloadConfirmDialog} from './components/DownloadConfirmDialog';
import {DownloadsSheet} from './components/DownloadsSheet';
import {StorageSheet} from './components/StorageSheet';
import {UpdatesSection, UpdateCandidate} from './components/UpdatesSection';
import {
  HubSearchResults,
  HubSortOption,
  sortHfModels,
} from './components/HubSearchResults';
import {CategoryBrowse} from './components/CategoryBrowse';
import {logger} from '../../utils/logger';

const SORT_OPTIONS: HubSortOption[] = [
  'recommended',
  'downloads',
  'newest',
  'name',
  'sizeAsc',
  'sizeDesc',
];

/**
 * Models Hub — the full model discovery/management center.
 *
 * Browse mode (default): device summary, category grid, favorites, recently
 * viewed, featured + recommended + newest HF rows, updates, installed models,
 * storage. Search mode: unified installed + HF results. Category mode:
 * per-category drill-down with live HF data.
 *
 * All legacy ModelsScreen functionality is preserved: local import, remote
 * servers, per-model settings, error orchestration, HF token search sheet.
 */
export const ModelsHubScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const t = (l10n as any).modelsHub ?? {};
  const {profile: device} = useDeviceProfile();

  // ── sheet / dialog state ──
  const [refreshing, setRefreshing] = useState(false);
  const [hfSearchVisible, setHFSearchVisible] = useState(false);
  const [isCopyingModel, setIsCopyingModel] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model | undefined>();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const [detailsVisible, setDetailsVisible] = useState(false);
  const [detailsModel, setDetailsModel] = useState<HuggingFaceModel | null>(
    null,
  );
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmModel, setConfirmModel] = useState<HuggingFaceModel | null>(
    null,
  );
  const [confirmFile, setConfirmFile] = useState<ModelFile | null>(null);
  const [downloadsVisible, setDownloadsVisible] = useState(false);
  const [storageVisible, setStorageVisible] = useState(false);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  // Remote model / server details sheets (legacy parity)
  const [remoteModelSheetVisible, setRemoteModelSheetVisible] = useState(false);
  const [serverDetailsSheetVisible, setServerDetailsSheetVisible] =
    useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  // Model error report sheet (legacy parity)
  const [isErrorReportVisible, setIsErrorReportVisible] = useState(false);
  const [errorToReport, setErrorToReport] = useState<ErrorState | null>(null);
  const [activeError, setActiveError] = useState<ErrorState | null>(null);
  const [isShowingErrorDialog, setIsShowingErrorDialog] = useState(false);

  // ── hub view state ──
  const hub = uiStore.pageStates.modelsHub;
  const query = hub.query;
  const activeCategory = hub.category;
  const sort = hub.sort as HubSortOption;

  // Catalog fetches (featured / recommended share trending data)
  const featured = useHfCatalog();
  const newest = useHfCatalog();

  useEffect(() => {
    featured.load({
      filter: 'gguf,conversational',
      sort: 'downloads',
      limit: 24,
    });
    newest.load({
      filter: 'gguf',
      sort: 'lastModified',
      direction: '-1',
      limit: 12,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Legacy error orchestration (same reaction as the classic screen).
  useEffect(() => {
    const errorDisposer = reaction(
      () => ({
        hfError: hfStore.error,
        downloadError: modelStore.downloadError,
        modelLoadError: modelStore.modelLoadError,
      }),
      data => {
        const hasDialogError =
          data.downloadError && data.downloadError.metadata?.modelId;
        setIsShowingErrorDialog(!!hasDialogError);
        if (hasDialogError) {
          setActiveError(null);
        } else if (data.modelLoadError) {
          setActiveError(data.modelLoadError);
        } else if (data.hfError) {
          setActiveError(data.hfError);
        } else if (data.downloadError) {
          setActiveError(data.downloadError);
        } else {
          setActiveError(null);
        }
      },
    );
    return () => {
      errorDisposer();
    };
  }, []);

  // ── derived data ──
  const installedModels = modelStore.displayModels;
  const activeModelId = modelStore.activeModel?.id;

  const installedCounts = useMemo(() => {
    const counts: Partial<Record<ModelCategory, number>> = {};
    for (const model of installedModels) {
      const cat = primaryCategory(classifyModel(model));
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [installedModels]);

  const compatForHf = (
    hfModel: HuggingFaceModel,
  ): CompatibilityLevel | undefined => {
    if (!device) {
      return undefined;
    }
    const sizes = (hfModel.siblings ?? [])
      .map(s => s.lfs?.size ?? s.size ?? 0)
      .filter(s => s > 0)
      .sort((a: number, b: number) => a - b);
    const best = sizes[0];
    if (!best) {
      return undefined;
    }
    return computeModelCompatibility({
      modelSizeBytes: best,
      estimatedMemoryBytes: Math.round(best * 1.2),
      engineSupported: true,
      device,
    }).level;
  };

  const recommended = useMemo(() => {
    if (!device || featured.models.length === 0) {
      return [];
    }
    const scored = featured.models
      .filter(m => {
        const sizes = (m.siblings ?? [])
          .map(s => s.lfs?.size ?? s.size ?? 0)
          .filter(s => s > 0)
          .sort((a: number, b: number) => a - b);
        return sizes[0] != null;
      })
      .map(m => {
        const best = (m.siblings ?? [])
          .map(s => s.lfs?.size ?? s.size ?? 0)
          .filter(s => s > 0)
          .sort((a: number, b: number) => a - b)[0];
        const check = computeModelCompatibility({
          modelSizeBytes: best,
          estimatedMemoryBytes: Math.round(best * 1.2),
          engineSupported: true,
          device,
        });
        return {m, check};
      })
      .filter(x => x.check.level === 'excellent' || x.check.level === 'good')
      .sort((a, b) => b.check.score - a.check.score)
      .slice(0, 8);
    return scored.map(x => x.m);
  }, [device, featured.models]);

  const favorites = modelHubStore.favorites;

  const favoriteModels = installedModels.filter(m => favorites.includes(m.id));

  // ── handlers (legacy parity) ──
  const onRefresh = async () => {
    setRefreshing(true);
    await gatherDeviceProfile(); // cached; refreshes tier if missing
    await modelStore.refreshDownloadStatuses();
    featured.load({
      filter: 'gguf,conversational',
      sort: 'downloads',
      limit: 24,
    });
    newest.load({
      filter: 'gguf',
      sort: 'lastModified',
      direction: '-1',
      limit: 12,
    });
    setRefreshing(false);
  };

  const handleOpenSettings = (model: Model) => {
    setSelectedModel(model);
    setSettingsVisible(true);
  };

  const handleCloseSettings = () => {
    setSettingsVisible(false);
    setSelectedModel(undefined);
  };

  const handleAddRemoteModel = () => {
    setRemoteModelSheetVisible(true);
  };

  const handleManageServers = () => {
    const servers = serverStore.servers;
    if (servers.length === 1) {
      handleOpenServerDetails(servers[0].id);
    } else if (servers.length > 1) {
      Alert.alert(l10n.settings.manageServers, undefined, [
        ...servers.map(server => ({
          text: server.name,
          onPress: () => handleOpenServerDetails(server.id),
        })),
        {text: l10n.common.cancel, style: 'cancel' as const},
      ]);
    }
  };

  const handleOpenServerDetails = (serverId: string) => {
    setSelectedServerId(serverId);
    setServerDetailsSheetVisible(true);
  };

  const handleDismissError = () => {
    hfStore.clearError();
    modelStore.clearDownloadError();
    modelStore.clearModelLoadError();
  };

  const handleRetryAction = () => {
    if (activeError?.context === 'search') {
      hfStore.fetchModels();
    } else if (activeError?.context === 'download') {
      modelStore.retryDownload();
    } else if (activeError?.context === 'modelInit') {
      const modelId = activeError.metadata?.modelId;
      if (modelId) {
        const model = modelStore.models.find(m => m.id === modelId);
        if (model) {
          modelStore.selectModel(model);
        }
      }
    }
    handleDismissError();
  };

  const handleReportModelError = () => {
    if (activeError?.context === 'modelInit') {
      setErrorToReport(activeError);
      setIsErrorReportVisible(true);
      handleDismissError();
    }
  };

  const handleCloseErrorReport = () => {
    setIsErrorReportVisible(false);
    setErrorToReport(null);
  };

  const handleAddLocalModel = async () => {
    if (isCopyingModel) {
      return;
    }
    pick({
      type: Platform.OS === 'ios' ? 'public.data' : types.allFiles,
    })
      .then(async res => {
        const [file] = res;
        if (file) {
          let fileName =
            file.name || file.uri.split('/').pop() || `file_${uuidv4()}`;

          const permanentDir = `${RNFS.DocumentDirectoryPath}/models/local`;
          let permanentPath = `${permanentDir}/${fileName}`;
          if (!(await RNFS.exists(permanentDir))) {
            await RNFS.mkdir(permanentDir);
          }

          if (await RNFS.exists(permanentPath)) {
            const choice = await new Promise<'replace' | 'keep' | 'cancel'>(
              resolve => {
                Alert.alert(
                  l10n.models.fileManagement.fileAlreadyExists,
                  l10n.models.fileManagement.fileAlreadyExistsMessage,
                  [
                    {
                      text: l10n.models.fileManagement.replace,
                      onPress: () => resolve('replace'),
                    },
                    {
                      text: l10n.models.fileManagement.keepBoth,
                      onPress: () => resolve('keep'),
                    },
                    {
                      text: l10n.common.cancel,
                      onPress: () => resolve('cancel'),
                      style: 'cancel',
                    },
                  ],
                );
              },
            );

            switch (choice) {
              case 'replace':
                await RNFS.unlink(permanentPath);
                modelStore.removeModelByFullPath(permanentPath);
                break;
              case 'keep': {
                let counter = 1;
                const nameParts = fileName.split('.');
                const ext = nameParts.length > 1 ? nameParts.pop() : '';
                const name = nameParts.join('.');
                do {
                  permanentPath = `${permanentDir}/${name}_${counter}.${ext}`;
                  counter++;
                } while (await RNFS.exists(permanentPath));
                break;
              }
              case 'cancel':
                logger.debug('File copy cancelled by user');
                return;
            }
          }

          try {
            setIsCopyingModel(true);
            await RNFS.copyFile(file.uri, permanentPath);
            await modelStore.addLocalModel(permanentPath);
          } catch (e) {
            Alert.alert(
              l10n.models.fileManagement.copyFailed,
              e instanceof Error ? e.message : String(e),
            );
          } finally {
            setIsCopyingModel(false);
          }
        }
      })
      .catch(e => logger.debug('No file picked, error: ', e.message));
  };

  // ── catalog interactions ──
  const openDetails = (hfModel: HuggingFaceModel) => {
    modelHubStore.recordView(hfModel.id);
    setDetailsModel(hfModel);
    setDetailsVisible(true);
  };

  const openDownloadDialog = (hfModel: HuggingFaceModel, file?: ModelFile) => {
    const chosen =
      file ??
      (hfModel.siblings ?? [])
        .filter((s: any) =>
          String(s.rfilename ?? '')
            .toLowerCase()
            .endsWith('.gguf'),
        )
        .sort(
          (a: any, b: any) =>
            (a.lfs?.size ?? a.size ?? 0) - (b.lfs?.size ?? b.size ?? 0),
        )[0] ??
      null;
    if (!chosen) {
      uiStore.showError(t.noDownloadableFile ?? 'No downloadable GGUF file');
      return;
    }
    setConfirmModel(hfModel);
    setConfirmFile(chosen);
    setConfirmVisible(true);
  };

  const handleUpdatePress = (candidate: UpdateCandidate) => {
    // Re-fetch the repo's live file list and open the confirm dialog for the
    // matching filename — the download replaces the old file at the same path.
    const synthetic: HuggingFaceModel = {
      ...(candidate.model.hfModel ?? ({} as HuggingFaceModel)),
      _id: candidate.model.id,
      id: `${candidate.model.author ?? ''}/${candidate.model.repo ?? ''}`.replace(
        /^\//,
        '',
      ),
      author: candidate.model.author ?? candidate.model.id.split('/')[0],
      gated: false,
      inference: '',
      lastModified: candidate.lastModified ?? '',
      likes: candidate.model.hfModel?.likes ?? 0,
      trendingScore: 0,
      private: false,
      sha: candidate.model.hfModel?.sha ?? candidate.model.hash ?? '',
      downloads: candidate.model.hfModel?.downloads ?? 0,
      tags: candidate.model.hfModel?.tags ?? [],
      library_name: 'gguf',
      createdAt: candidate.model.hfModel?.createdAt ?? '',
      model_id: candidate.model.id,
      siblings: [
        {
          rfilename: candidate.latestFilename ?? candidate.model.filename,
          size: candidate.latestSize ?? candidate.model.size,
          lfs: candidate.latestOid
            ? {
                oid: candidate.latestOid,
                size: candidate.latestSize ?? candidate.model.size,
                pointerSize: 0,
              }
            : undefined,
        } as any,
      ],
    };
    setDetailsVisible(false);
    openDownloadDialog(synthetic, synthetic.siblings[0] as ModelFile);
  };

  // ── render helpers ──
  const renderSectionHeader = (
    title: string,
    actionLabel?: string,
    onAction?: () => void,
  ) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction && (
        <Pressable hitSlop={6} onPress={onAction} accessibilityRole="button">
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );

  const renderHRow = (
    models: HuggingFaceModel[],
    onSelect: (m: HuggingFaceModel) => void,
    useCompat: boolean,
    loading: boolean,
    error: string | null | undefined,
    retry: () => void,
  ) => {
    if (loading) {
      return (
        <View style={{flexDirection: 'row', paddingHorizontal: 16}}>
          <HubSkeletonCard />
          <HubSkeletonCard />
        </View>
      );
    }
    if (models.length === 0) {
      return error ? (
        <HubInlineStatus error={error} onRetry={retry} retryLabel={t.retry} />
      ) : (
        <HubInlineStatus />
      );
    }
    return (
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={models}
        keyExtractor={m => m.id}
        contentContainerStyle={{paddingHorizontal: 16}}
        renderItem={({item}) => (
          <HubCatalogCard
            hfModel={item}
            categories={classifyHfModel(item)}
            compatibility={useCompat ? compatForHf(item) : undefined}
            onPress={() => onSelect(item)}
            onDownload={() => openDownloadDialog(item)}
          />
        )}
      />
    );
  };

  // ── Search mode ──
  if (query.trim().length > 0) {
    return (
      <View style={styles.container} testID="models-hub-screen">
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <SearchIcon
              width={18}
              height={18}
              stroke={theme.colors.onSurfaceVariant}
              fill="none"
            />
            <TextInput
              style={styles.searchInput}
              onChangeText={value =>
                uiStore.setValue('modelsHub', 'query', value)
              }
              placeholder={t.searchPlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={query}
              autoCapitalize="none"
              autoCorrect={false}
              testID="hub-search-input"
              accessibilityLabel={t.searchPlaceholder}
            />
            {query.length > 0 && (
              <Pressable
                hitSlop={8}
                onPress={() => uiStore.setValue('modelsHub', 'query', '')}>
                <CloseIcon
                  width={16}
                  height={16}
                  stroke={theme.colors.onSurfaceVariant}
                  fill="none"
                />
              </Pressable>
            )}
          </View>
        </View>
        <HubSearchResults
          query={query}
          sort={sort}
          onSelect={openDetails}
          onDownload={hfModel => openDownloadDialog(hfModel)}
        />
        <Portal>
          <DownloadErrorDialog
            visible={isShowingErrorDialog}
            onDismiss={() => {
              modelStore.clearDownloadError();
            }}
            error={modelStore.downloadError}
            model={
              modelStore.downloadError?.metadata?.modelId
                ? modelStore.models.find(
                    m => m.id === modelStore.downloadError?.metadata?.modelId,
                  )
                : undefined
            }
            onTryAgain={modelStore.retryDownload}
          />
        </Portal>
        {hubOverlays()}
      </View>
    );
  }

  // ── Category mode ──
  if (activeCategory && activeCategory !== 'all') {
    return (
      <View style={styles.container} testID="models-hub-screen">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {t.categories?.[activeCategory] ?? activeCategory}
          </Text>
          <Pressable
            hitSlop={8}
            onPress={() => uiStore.setValue('modelsHub', 'category', 'all')}>
            <CloseIcon
              width={18}
              height={18}
              stroke={theme.colors.onSurface}
              fill="none"
            />
          </Pressable>
        </View>
        <CategoryBrowse
          category={activeCategory as ModelCategory}
          sort={sort}
          onSelect={openDetails}
          onDownload={hfModel => openDownloadDialog(hfModel)}
        />
        {hubOverlays()}
      </View>
    );
  }

  // ── Browse mode ──
  const downloadsActive = modelStore.activeDownloads.length > 0;

  return (
    <View style={styles.container} testID="models-hub-screen">
      {!isShowingErrorDialog && activeError && (
        <ErrorSnackbar
          error={activeError}
          onDismiss={handleDismissError}
          onRetry={handleRetryAction}
          onReport={handleReportModelError}
        />
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
          />
        }>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{t.title}</Text>
          <Text style={styles.heroSubtitle}>{t.subtitle}</Text>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <SearchIcon
              width={18}
              height={18}
              stroke={theme.colors.onSurfaceVariant}
              fill="none"
            />
            <TextInput
              style={styles.searchInput}
              onChangeText={value =>
                uiStore.setValue('modelsHub', 'query', value)
              }
              placeholder={t.searchPlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={query}
              autoCapitalize="none"
              autoCorrect={false}
              testID="hub-search-input"
              accessibilityLabel={t.searchPlaceholder}
            />
            {query.length > 0 && (
              <Pressable
                hitSlop={8}
                onPress={() => uiStore.setValue('modelsHub', 'query', '')}>
                <CloseIcon
                  width={16}
                  height={16}
                  stroke={theme.colors.onSurfaceVariant}
                  fill="none"
                />
              </Pressable>
            )}
          </View>
          <Pressable
            testID="hub-downloads-button"
            onPress={() => setDownloadsVisible(true)}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={t.downloads?.title}>
            <DownloadIcon
              width={18}
              height={18}
              stroke={
                downloadsActive ? '#7C3AED' : theme.colors.onSurfaceVariant
              }
              fill="none"
            />
          </Pressable>
          <Pressable
            testID="hub-sort-button"
            onPress={() => setSortMenuVisible(!sortMenuVisible)}
            style={[
              styles.iconButton,
              sortMenuVisible && styles.iconButtonActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t.sort?.title}>
            <GridIcon
              width={18}
              height={18}
              stroke={theme.colors.onSurfaceVariant}
              fill="none"
            />
          </Pressable>
        </View>

        {sortMenuVisible && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 8,
              borderRadius: 14,
              backgroundColor: theme.colors.surfaceVariant,
              padding: 8,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
            }}>
            {SORT_OPTIONS.map(option => (
              <Pressable
                key={option}
                onPress={() => uiStore.setValue('modelsHub', 'sort', option)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 10,
                  backgroundColor:
                    sort === option ? theme.colors.surface : 'transparent',
                }}>
                <Text
                  style={{
                    ...theme.typography.captionM,
                    fontWeight: sort === option ? '700' : '400',
                    color:
                      sort === option
                        ? theme.colors.onSurface
                        : theme.colors.onSurfaceVariant,
                  }}>
                  {t.sort?.[option] ?? option}
                </Text>
              </Pressable>
            ))}
            {/* Wi-Fi only preference */}
            <Pressable
              onPress={() =>
                modelHubStore.setWifiOnly(!modelHubStore.wifiOnlyDownloads)
              }
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 10,
                backgroundColor: modelHubStore.wifiOnlyDownloads
                  ? '#2563EB22'
                  : 'transparent',
              }}>
              <Text
                style={{
                  ...theme.typography.captionM,
                  fontWeight: modelHubStore.wifiOnlyDownloads ? '700' : '400',
                  color: modelHubStore.wifiOnlyDownloads
                    ? '#2563EB'
                    : theme.colors.onSurfaceVariant,
                }}>
                {t.wifiOnly}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Device summary */}
        {device && (
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>{t.device?.ram}</Text>
                <Text style={styles.summaryStatValue}>
                  {device.ramBytes != null
                    ? `${(device.ramBytes / 1024 / 1024 / 1024).toFixed(0)} GB`
                    : t.notAvailable}
                </Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>{t.device?.storage}</Text>
                <Text
                  style={styles.summaryStatValue}
                  onPress={() => setStorageVisible(true)}>
                  {device.freeDiskBytes != null
                    ? `${(device.freeDiskBytes / 1024 / 1024 / 1024).toFixed(0)} GB`
                    : t.notAvailable}
                </Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>{t.device?.cpu}</Text>
                <Text style={styles.summaryStatValue}>
                  {device.cpuCores != null
                    ? `${device.cpuCores} cores`
                    : t.notAvailable}
                </Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>{t.device?.gpu}</Text>
                <Text
                  style={[
                    styles.summaryStatValue,
                    {
                      color: device.gpuSupported
                        ? '#059669'
                        : theme.colors.onSurface,
                    },
                  ]}>
                  {device.gpuSupported == null
                    ? t.notAvailable
                    : device.gpuSupported
                      ? t.device?.gpuOk
                      : t.device?.gpuNo}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Categories */}
        {renderSectionHeader(t.categoriesTitle)}
        <HubCategoryGrid
          installedCounts={installedCounts}
          onSelect={category =>
            uiStore.setValue('modelsHub', 'category', category)
          }
        />

        {/* Featured */}
        {renderSectionHeader(t.featuredTitle, t.seeAll, () =>
          uiStore.setValue('modelsHub', 'category', 'text'),
        )}
        {renderHRow(
          featured.models.slice(0, 8),
          openDetails,
          true,
          featured.isLoading,
          featured.error,
          () =>
            featured.load({
              filter: 'gguf,conversational',
              sort: 'downloads',
              limit: 24,
            }),
        )}

        {/* Recommended */}
        {recommended.length > 0 && renderSectionHeader(t.recommendedTitle)}
        {recommended.length > 0 &&
          renderHRow(recommended, openDetails, true, false, null, () => {})}

        {/* Recently added */}
        {renderSectionHeader(t.recentTitle)}
        {renderHRow(
          sortHfModels(newest.models, 'newest').slice(0, 8),
          openDetails,
          false,
          newest.isLoading,
          newest.error,
          () =>
            newest.load({
              filter: 'gguf',
              sort: 'lastModified',
              direction: '-1',
              limit: 12,
            }),
        )}

        {/* Favorites */}
        {favoriteModels.length > 0 && renderSectionHeader(t.favoritesTitle)}
        {favoriteModels.length > 0 && (
          <View style={{paddingHorizontal: 16, gap: 2}}>
            {favoriteModels.map(model => (
              <Text
                key={model.id}
                style={{
                  ...theme.typography.bodyS,
                  color: theme.colors.onSurfaceVariant,
                  paddingVertical: 4,
                }}
                numberOfLines={1}>
                ♥ {model.author ? `${model.author}/` : ''}
                {model.repo ?? model.name}
              </Text>
            ))}
          </View>
        )}

        {/* Installed */}
        {renderSectionHeader(t.installedTitle)}
        {installedModels.length === 0 ? (
          <HubEmptyState
            icon={ModelIcon}
            title={t.emptyTitle}
            hint={t.emptyHint}
            actionLabel={t.exploreAction}
            onAction={() => setHFSearchVisible(true)}
            testID="hub-installed-empty"
          />
        ) : (
          <View style={styles.installedList}>
            {installedModels.map(model => (
              <ModelCard
                key={model.id}
                model={model}
                activeModelId={activeModelId}
                onOpenSettings={() => handleOpenSettings(model)}
                onOpenServerDetails={handleOpenServerDetails}
              />
            ))}
          </View>
        )}

        {/* Updates */}
        <UpdatesSection onUpdate={handleUpdatePress} />

        {/* Storage entry */}
        <Pressable
          testID="hub-storage-entry"
          onPress={() => setStorageVisible(true)}
          style={[styles.card, {marginTop: 20}]}
          accessibilityRole="button"
          accessibilityLabel={t.storage?.title}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <View>
              <Text
                style={{
                  ...theme.typography.uiM,
                  fontWeight: '700',
                  color: theme.colors.onSurface,
                }}>
                {t.storage?.title}
              </Text>
              <Text
                style={{
                  ...theme.typography.captionM,
                  color: theme.colors.onSurfaceVariant,
                  marginTop: 2,
                }}>
                {t.storage?.entryHint}
              </Text>
            </View>
            <TrashIcon
              width={18}
              height={18}
              stroke={theme.colors.onSurfaceVariant}
              fill="none"
            />
          </View>
        </Pressable>
      </ScrollView>

      <Snackbar
        testID="copy-model-snackbar"
        visible={isCopyingModel}
        onDismiss={() => {}}
        duration={86400000}>
        {l10n.models.fileManagement.copyingModel}
      </Snackbar>

      <Portal>
        <DownloadErrorDialog
          visible={isShowingErrorDialog}
          onDismiss={() => {
            modelStore.clearDownloadError();
          }}
          error={modelStore.downloadError}
          model={
            modelStore.downloadError?.metadata?.modelId
              ? modelStore.models.find(
                  m => m.id === modelStore.downloadError?.metadata?.modelId,
                )
              : undefined
          }
          onTryAgain={modelStore.retryDownload}
        />
      </Portal>

      {hubOverlays()}
    </View>
  );

  // ── shared overlays (sheets + FAB), reused across all hub modes ──
  function hubOverlays() {
    return (
      <>
        <ModelDetailsSheet
          visible={detailsVisible}
          hfModel={detailsModel}
          onClose={() => setDetailsVisible(false)}
        />
        <DownloadConfirmDialog
          visible={confirmVisible}
          hfModel={confirmModel}
          modelFile={confirmFile}
          onClose={() => setConfirmVisible(false)}
        />
        <DownloadsSheet
          visible={downloadsVisible}
          onClose={() => setDownloadsVisible(false)}
        />
        <StorageSheet
          visible={storageVisible}
          onClose={() => setStorageVisible(false)}
        />
        <HFTokenSearchSheet />
        <FABGroup
          onAddHFModel={() => setHFSearchVisible(true)}
          onAddLocalModel={handleAddLocalModel}
          onAddRemoteModel={handleAddRemoteModel}
          onManageServers={handleManageServers}
          hasServers={serverStore.servers.length > 0}
        />
        <ModelSettingsSheet
          isVisible={settingsVisible}
          onClose={handleCloseSettings}
          model={selectedModel}
        />
        <ModelErrorReportSheet
          isVisible={isErrorReportVisible}
          onClose={handleCloseErrorReport}
          error={errorToReport}
        />
        <RemoteModelSheet
          isVisible={remoteModelSheetVisible}
          onDismiss={() => setRemoteModelSheetVisible(false)}
        />
        <ServerDetailsSheet
          isVisible={serverDetailsSheetVisible}
          onDismiss={() => {
            setServerDetailsSheetVisible(false);
            setSelectedServerId(null);
          }}
          serverId={selectedServerId}
        />
      </>
    );
  }

  /** The existing HF search sheet (advanced search + token management). */
  function HFTokenSearchSheet() {
    return (
      <HFModelSearch
        visible={hfSearchVisible}
        onDismiss={() => setHFSearchVisible(false)}
      />
    );
  }
});
