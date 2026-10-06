import React, {useContext, useEffect, useMemo} from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  RefreshControl,
  TextStyle,
  ViewStyle,
} from 'react-native';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {modelStore} from '../../../store';
import {HuggingFaceModel, Model, Theme} from '../../../utils/types';
import {
  ModelCategory,
  classifyHfModel,
  isUnavailableOnDeviceEngine,
  primaryCategory,
} from '../../../utils/modelTaxonomy';
import {computeModelCompatibility} from '../../../utils/compatibility';

import {useHfCatalog} from '../hooks/useHfCatalog';
import {useDeviceProfile} from '../hooks/useDeviceProfile';
import {sortHfModels, HubSortOption} from './HubSearchResults';
import {HubCatalogCard, HubEmptyState, HubInlineStatus} from './HubPrimitives';

/** Real HF query strategy per category (all fetch live repo data). */
const CATEGORY_QUERY: Record<
  ModelCategory,
  {search?: string; filter?: string; sort: string}
> = {
  text: {filter: 'gguf,conversational', sort: 'downloads'},
  vision: {filter: 'gguf,image-text-to-text', sort: 'downloads'},
  reasoning: {search: 'reasoning', filter: 'gguf', sort: 'downloads'},
  coding: {search: 'coder', filter: 'gguf', sort: 'downloads'},
  multimodal: {filter: 'gguf,any-to-any', sort: 'downloads'},
  embedding: {search: 'embedding', filter: 'gguf', sort: 'downloads'},
  translation: {filter: 'gguf,translation', sort: 'downloads'},
  audio: {filter: 'gguf,automatic-speech-recognition', sort: 'downloads'},
  image: {search: 'stable-diffusion', filter: 'gguf', sort: 'downloads'},
  video: {search: 'text-to-video', filter: 'gguf', sort: 'downloads'},
  general: {filter: 'gguf,conversational', sort: 'downloads'},
};

interface CategoryBrowseProps {
  category: ModelCategory;
  sort: HubSortOption;
  onSelect: (hfModel: HuggingFaceModel) => void;
  onDownload: (hfModel: HuggingFaceModel) => void;
}

/**
 * Category drill-down: installed models of this category first, then live
 * HuggingFace results fetched with the category's real query. Engine-blocked
 * categories render an honest notice instead of download buttons.
 */
export const CategoryBrowse: React.FC<CategoryBrowseProps> = observer(
  ({category, sort, onSelect, onDownload}) => {
    const l10n = useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles(theme);
    const t = (l10n as any).modelsHub ?? {};
    const {profile: device} = useDeviceProfile();
    const catalog = useHfCatalog();

    useEffect(() => {
      const q = CATEGORY_QUERY[category];
      catalog.load({...q, limit: 20});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category]);

    const engineBlocked = isUnavailableOnDeviceEngine(category);

    const displayModels = modelStore.displayModels;
    const installedOfCategory = useMemo(
      () =>
        displayModels.filter(
          m => primaryCategory(classifyModelSafe(m)) === category,
        ),
      [category, displayModels],
    );

    const remote = useMemo(() => {
      const filtered = catalog.models.filter(m => {
        const cats = classifyHfModel(m);
        return cats.length === 0
          ? category === 'general'
          : cats.includes(category);
      });
      return sortHfModels(filtered, sort);
    }, [catalog.models, sort, category]);

    const compatFor = (hfModel: HuggingFaceModel) => {
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
        engineSupported: !engineBlocked,
        device,
      }).level;
    };

    return (
      <FlatList
        data={remote}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <View style={styles.resultCardWrapper}>
            <HubCatalogCard
              hfModel={item}
              categories={classifyHfModel(item)}
              compatibility={compatFor(item)}
              onPress={() => onSelect(item)}
              onDownload={engineBlocked ? undefined : () => onDownload(item)}
            />
          </View>
        )}
        onEndReachedThreshold={0.6}
        onEndReached={() => catalog.loadMore()}
        refreshControl={
          <RefreshControl
            refreshing={catalog.isLoading}
            onRefresh={() => {
              const q = CATEGORY_QUERY[category];
              catalog.load({...q, limit: 20});
            }}
            colors={[theme.colors.primary]}
          />
        }
        ListHeaderComponent={
          <View>
            {engineBlocked && (
              <View style={styles.engineNotice}>
                <Text style={styles.engineNoticeText}>
                  {t.categoryEngineNotice}
                </Text>
              </View>
            )}

            {installedOfCategory.length > 0 && (
              <View style={styles.installedSection}>
                <Text style={styles.installedSectionTitle}>
                  {t.categoryInstalledSection}
                </Text>
                {installedOfCategory.map((m: Model) => (
                  <Text
                    key={m.id}
                    style={styles.installedModelRow}
                    numberOfLines={1}>
                    {m.isDownloaded ? '✓ ' : '· '}
                    {m.author ? `${m.author}/` : ''}
                    {m.repo ?? m.name}
                  </Text>
                ))}
              </View>
            )}

            <Text style={styles.remoteSectionTitle}>
              {t.categoryRemoteSection}
            </Text>

            {catalog.isLoading && <HubInlineStatus loading />}
            {!catalog.isLoading && catalog.error != null && (
              <HubInlineStatus
                error={catalog.error}
                onRetry={() => {
                  const q = CATEGORY_QUERY[category];
                  catalog.load({...q, limit: 20});
                }}
              />
            )}
            {!catalog.isLoading && !catalog.error && remote.length === 0 && (
              <HubEmptyState
                title={t.search?.noResults ?? ''}
                hint={t.search?.noResultsHint ?? ''}
                testID="category-empty"
              />
            )}
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    );
  },
);

// classifyModel wrapper that tolerates remote-only records.
const classifyModelSafe = (m: Model) =>
  classifyHfModel({
    id: `${m.author ?? ''}/${m.repo ?? m.name ?? ''}`,
    tags: m.hfModel?.tags,
    specs: m.hfModel?.specs,
  });

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    resultCardWrapper: {
      marginBottom: 10,
      marginHorizontal: 16,
    } as ViewStyle,
    engineNotice: {
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: 12,
      padding: 12,
      backgroundColor: theme.colors.surfaceVariant,
    } as ViewStyle,
    engineNoticeText: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      lineHeight: 19,
    } as TextStyle,
    installedSection: {
      marginBottom: 12,
    } as ViewStyle,
    installedSectionTitle: {
      ...theme.typography.uiM,
      fontWeight: '700',
      color: theme.colors.onSurface,
      paddingHorizontal: 20,
      marginBottom: 6,
    } as TextStyle,
    installedModelRow: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      paddingHorizontal: 20,
      paddingVertical: 4,
    } as TextStyle,
    remoteSectionTitle: {
      ...theme.typography.uiM,
      fontWeight: '700',
      color: theme.colors.onSurface,
      paddingHorizontal: 20,
      marginTop: 4,
      marginBottom: 10,
    } as TextStyle,
    listContent: {
      paddingBottom: 120,
    } as ViewStyle,
  });
