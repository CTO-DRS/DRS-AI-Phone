import React, {useContext, useEffect, useMemo} from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  TextStyle,
  ViewStyle,
} from 'react-native';
import {observer} from 'mobx-react-lite';
import debounce from 'lodash/debounce';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {hfStore, modelStore} from '../../../store';
import {HuggingFaceModel, Theme} from '../../../utils/types';
import {classifyHfModel} from '../../../utils/modelTaxonomy';
import {
  AlertTriangleSmIcon,
  SearchIcon as SearchGlyph,
} from '../../../assets/icons';

import {HubCatalogCard, HubEmptyState, HubSkeletonCard} from './HubPrimitives';

const DEBOUNCE_DELAY = 500;

export type HubSortOption =
  | 'recommended'
  | 'downloads'
  | 'newest'
  | 'name'
  | 'sizeAsc'
  | 'sizeDesc';

export const sortHfModels = (
  models: HuggingFaceModel[],
  sort: HubSortOption,
): HuggingFaceModel[] => {
  const withSize = models.map(m => {
    const sizes = (m.siblings ?? [])
      .map(s => s.lfs?.size ?? s.size ?? 0)
      .filter(s => s > 0)
      .sort((a, b) => a - b);
    return {m, size: sizes[0] ?? Number.MAX_SAFE_INTEGER};
  });
  switch (sort) {
    case 'name':
      withSize.sort((a, b) => a.m.id.localeCompare(b.m.id));
      break;
    case 'sizeAsc':
      withSize.sort((a, b) => a.size - b.size);
      break;
    case 'sizeDesc':
      withSize.sort((a, b) => b.size - a.size);
      break;
    case 'downloads':
      withSize.sort((a, b) => (b.m.downloads ?? 0) - (a.m.downloads ?? 0));
      break;
    case 'newest':
      withSize.sort((a, b) =>
        (b.m.lastModified ?? '').localeCompare(a.m.lastModified ?? ''),
      );
      break;
    default:
      break;
  }
  return withSize.map(x => x.m);
};

interface HubSearchResultsProps {
  query: string;
  sort: HubSortOption;
  onSelect: (hfModel: HuggingFaceModel) => void;
  onDownload: (hfModel: HuggingFaceModel) => void;
}

/**
 * Unified search over installed models and HuggingFace (driven through the
 * existing hfStore session so the HF search sheet and hub stay in sync).
 */
export const HubSearchResults: React.FC<HubSearchResultsProps> = observer(
  ({query, sort, onSelect, onDownload}) => {
    const l10n = useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles(theme);
    const t = (l10n as any).modelsHub ?? {};

    // Debounced HF search through the shared store session.
    const debouncedFetch = useMemo(
      () =>
        debounce((q: string) => {
          hfStore.setSearchQuery(q);
          hfStore.fetchModels();
        }, DEBOUNCE_DELAY),
      [],
    );

    useEffect(() => {
      debouncedFetch(query);
      return () => {
        debouncedFetch.cancel();
      };
    }, [query, debouncedFetch]);

    const localMatches = modelStore.displayModels.filter(m =>
      `${m.author} ${m.repo ?? ''} ${m.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    const remoteResults = sortHfModels(hfStore.models, sort);

    const renderItem = ({item}: {item: HuggingFaceModel}) => {
      const categories = classifyHfModel(item);
      return (
        <HubCatalogCard
          hfModel={item}
          categories={categories}
          onPress={() => onSelect(item)}
          onDownload={() => onDownload(item)}
        />
      );
    };

    return (
      <FlatList
        data={remoteResults}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View>
            {localMatches.length > 0 && (
              <View style={styles.localMatchesSection}>
                <Text style={styles.localSectionTitle}>
                  {t.search?.installedSection}
                </Text>
                {localMatches.map(m => (
                  <Text
                    key={m.id}
                    style={styles.localMatchRow}
                    numberOfLines={1}>
                    {m.isDownloaded ? '✓ ' : '· '}
                    {m.author ? `${m.author}/` : ''}
                    {m.repo ?? m.name}
                  </Text>
                ))}
              </View>
            )}
            <Text style={styles.hfSectionTitle}>{t.search?.hfSection}</Text>
            {hfStore.isLoading &&
              [1, 2, 3].map(i => <HubSkeletonCard key={i} />)}
          </View>
        }
        ListEmptyComponent={
          !hfStore.isLoading && remoteResults.length === 0 ? (
            <HubEmptyState
              icon={hfStore.error ? AlertTriangleSmIcon : SearchGlyph}
              title={
                hfStore.error
                  ? (t.search?.errorTitle ?? '')
                  : (t.search?.noResults ?? '')
              }
              hint={
                hfStore.error
                  ? hfStore.error.message
                  : (t.search?.noResultsHint ?? '')
              }
              testID="hub-search-empty"
            />
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
      />
    );
  },
);

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    localMatchesSection: {
      marginTop: 8,
    } as ViewStyle,
    localSectionTitle: {
      ...theme.typography.uiM,
      fontWeight: '700',
      color: theme.colors.onSurface,
      paddingHorizontal: 20,
    } as TextStyle,
    localMatchRow: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      paddingHorizontal: 20,
      paddingVertical: 6,
    } as TextStyle,
    hfSectionTitle: {
      ...theme.typography.uiM,
      fontWeight: '700',
      color: theme.colors.onSurface,
      paddingHorizontal: 20,
      marginTop: 10,
      marginBottom: 8,
    } as TextStyle,
    listContent: {
      paddingBottom: 120,
    } as ViewStyle,
  });
