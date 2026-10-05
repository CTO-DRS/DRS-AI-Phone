import React, {useState, useEffect, useCallback, useContext} from 'react';
import {
  View,
  FlatList,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {PlusIcon} from '../../assets/icons';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {handleAssistantByType} from '../../utils/assistant-type-guards';
import {L10nContext} from '../../utils';
import {chunkIntoRows, computeAssistantGridLayout} from './assistantGridLayout';

import type {AssistantGridItem} from './assistantGridLayout';

// Components
import {
  BottomActionBar,
  BottomActionType,
  CompactAuthBar,
  ExpandableSearch,
  FilterChips,
  FilterType,
  AssistantGridRow,
  ProfileSheet,
} from './components';

import {SectionDivider} from '../../components/AssistantSheets/SectionDivider';

// Unified assistant sheet component
import {AssistantSheet} from '../../components/AssistantSheets';
import {AuthSheet, AssistantDetailSheet} from '../../components/Drshub';

// Assistant template factories
import {
  createNewAssistant,
  createNewRoleplayAssistant,
  createNewVideoAssistant,
  prepareAssistantForEditing,
} from '../../utils/assistant-templates';

// Services and stores
import {authService, syncService} from '../../services';
import {assistantStore, Assistant} from '../../store';
import {hasVideoCapability} from '../../utils/assistant-capabilities';

import type {DrshubAssistant} from '../../types/drshub';

const SectionGrid: React.FC<{
  section: {title: string; data: AssistantGridItem[]};
  columns: number;
  cardWidth: number;
  onAssistantPress: (assistant: AssistantGridItem) => void;
}> = ({section, columns, cardWidth, onAssistantPress}) => (
  <View>
    {section.title ? <SectionDivider label={section.title} /> : null}
    {chunkIntoRows(section.data, columns).map(row => (
      <AssistantGridRow
        key={row.key}
        row={row}
        cardWidth={cardWidth}
        onAssistantPress={onAssistantPress}
      />
    ))}
  </View>
);

export const AssistantsScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const {width: windowWidth} = useWindowDimensions();

  // Navigation state
  const [activeAction, setActiveAction] = useState<BottomActionType>('search');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Search state
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchResults, setSearchResults] = useState<DrshubAssistant[]>([]);

  // Sheet states
  const [showProfile, setShowProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showAssistantDetail, setShowAssistantDetail] = useState(false);
  const [selectedAssistant, setSelectedAssistant] =
    useState<DrshubAssistant | null>(null);

  // Unified assistant sheet state
  const [showAssistantSheet, setShowAssistantSheet] = useState(false);
  const [currentAssistant, setCurrentAssistant] =
    useState<Partial<Assistant> | null>(null);

  // Loading state
  const [refreshing, setRefreshing] = useState(false);

  // Auth bar state
  const [showAuthBar, setShowAuthBar] = useState(true);

  useEffect(() => {
    const runInitialSetup = async () => {
      try {
        // Start sync service if user is authenticated
        if (authService.isAuthenticated) {
          const needsSync = await syncService.needsSync();
          if (needsSync) {
            console.log('Syncing with Drshub...');
            await syncService.syncAll();
          }
        }
      } catch (error) {
        console.error('Error during initial setup:', error);
      }
    };

    runInitialSetup();
  }, []);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const handleCreateAssistant = (type: 'assistant' | 'roleplay' | 'video') => {
    let newAssistant: Partial<Assistant>;

    switch (type) {
      case 'assistant':
        newAssistant = createNewAssistant();
        break;
      case 'roleplay':
        newAssistant = createNewRoleplayAssistant();
        break;
      case 'video':
        newAssistant = createNewVideoAssistant();
        break;
      default:
        newAssistant = createNewAssistant();
    }

    setCurrentAssistant(newAssistant);
    setShowAssistantSheet(true);
  };

  const loadData = async () => {
    try {
      // Load public assistants for browsing
      await assistantStore.searchDrshubAssistants({
        sortBy: 'newest',
        limit: 20,
      });
      if (authService.isAuthenticated) {
        await Promise.all([
          assistantStore.loadUserLibrary(),
          assistantStore.loadUserCreatedAssistants(),
        ]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleActionPress = (action: BottomActionType) => {
    setActiveAction(action);

    switch (action) {
      case 'search':
        setIsSearchExpanded(!isSearchExpanded);
        break;
      case 'profile':
        if (authService.isAuthenticated) {
          setShowProfile(true);
        } else {
          setShowAuth(true);
        }
        break;
    }
  };

  const handleAssistantPress = (assistant: DrshubAssistant | Assistant) => {
    handleAssistantByType(assistant, {
      onLocalAssistant: localAssistant => {
        // Local assistant - handle edit
        handleEditAssistant(localAssistant);
      },
      onDrshubAssistant: drshubAssistant => {
        // Drshub assistant - show detail sheet
        setSelectedAssistant(drshubAssistant);
        setShowAssistantDetail(true);
      },
    });
  };

  const handleEditAssistant = (assistant: Assistant) => {
    const preparedAssistant = prepareAssistantForEditing(assistant);
    setCurrentAssistant(preparedAssistant);
    setShowAssistantSheet(true);
  };

  // Get filtered data based on current filter and search
  const getFilteredData = (): (DrshubAssistant | Assistant)[] => {
    if (isSearchExpanded && searchResults.length > 0) {
      return searchResults;
    }

    const localAssistants = assistantStore.getLocalAssistants();
    const downloadedAssistants = assistantStore.getDownloadedDrshubAssistants();
    const hubAssistants = assistantStore.cachedDrshubAssistants;

    switch (activeFilter) {
      case 'my-assistants':
        return [
          ...localAssistants,
          ...downloadedAssistants,
          ...assistantStore.userLibrary,
          ...assistantStore.userCreatedAssistants,
        ];
      case 'local':
        return [...localAssistants, ...downloadedAssistants];
      case 'video':
        return [
          ...localAssistants.filter(p => hasVideoCapability(p)),
          ...downloadedAssistants.filter(p => hasVideoCapability(p)),
          ...hubAssistants.filter(p =>
            p.categories?.some(c => c.name.toLowerCase().includes('video')),
          ),
        ];
      case 'free':
        return [
          ...localAssistants,
          ...hubAssistants.filter(p => p.price_cents === 0),
        ];
      case 'premium':
        return hubAssistants.filter(p => p.price_cents > 0);
      case 'all':
      default:
        return [...localAssistants, ...downloadedAssistants, ...hubAssistants];
    }
  };

  const getSectionedData = (): Array<{
    title: string;
    data: (DrshubAssistant | Assistant)[];
  }> => {
    if (isSearchExpanded && searchResults.length > 0) {
      return [{title: '', data: searchResults}];
    }

    const localAssistants = assistantStore.getLocalAssistants();
    const downloadedAssistants = assistantStore.getDownloadedDrshubAssistants();
    const hubAssistants = assistantStore.cachedDrshubAssistants;

    switch (activeFilter) {
      case 'all': {
        const sections: Array<{
          title: string;
          data: (DrshubAssistant | Assistant)[];
        }> = [];

        // Add local assistants section (includes both local and downloaded assistants)
        const allLocalAssistants = [
          ...localAssistants,
          ...downloadedAssistants,
        ];
        if (allLocalAssistants.length > 0) {
          sections.push({
            title: l10n.assistantsScreen.sectionTitles.myAssistantsLocal,
            data: allLocalAssistants,
          });
        }
        // if authenticated
        if (authService.isAuthenticated) {
          const allLibraryAssistants = [
            ...assistantStore.userLibrary,
            ...assistantStore.userCreatedAssistants,
          ];
          if (allLibraryAssistants.length > 0) {
            sections.push({
              title: l10n.assistantsScreen.sectionTitles.myLibrary,
              data: allLibraryAssistants,
            });
          }
        }

        // Add downloadable assistants section if there are any
        if (hubAssistants.length > 0) {
          sections.push({
            title: l10n.assistantsScreen.sectionTitles.discoverAssistants,
            data: hubAssistants,
          });
        }

        return sections;
      }
      case 'my-assistants': {
        const sections: Array<{
          title: string;
          data: (DrshubAssistant | Assistant)[];
        }> = [];

        // Add local assistants section (includes both local and downloaded assistants)
        const allLocalAssistants = [
          ...localAssistants,
          ...downloadedAssistants,
        ];
        if (allLocalAssistants.length > 0) {
          sections.push({
            title: l10n.assistantsScreen.sectionTitles.myAssistantsLocal,
            data: allLocalAssistants,
          });
        }

        // if authenticated
        if (authService.isAuthenticated) {
          const allLibraryAssistants = [
            ...assistantStore.userLibrary,
            ...assistantStore.userCreatedAssistants,
          ];
          if (allLibraryAssistants.length > 0) {
            sections.push({
              title: l10n.assistantsScreen.sectionTitles.myLibrary,
              data: allLibraryAssistants,
            });
          }
        }

        return sections;
      }
      default:
        // For other filters, use single section without header
        return [{title: '', data: getFilteredData()}];
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <PlusIcon stroke={theme.colors.onSurfaceVariant} width={48} height={48} />
      <Text style={styles.emptyStateText}>
        {activeFilter === 'local' || activeFilter === 'my-assistants'
          ? l10n.assistantsScreen.emptyLocal
          : l10n.assistantsScreen.emptyFiltered}
      </Text>
    </View>
  );

  const {columns, cardWidth} = computeAssistantGridLayout(windowWidth);
  const filteredData = getFilteredData();
  const rows = chunkIntoRows(filteredData, columns);
  const sectionedData = getSectionedData();
  const shouldUseSections =
    (activeFilter === 'all' || activeFilter === 'my-assistants') &&
    sectionedData.length > 1;

  return (
    <View style={styles.container}>
      {/* Compact Auth Bar - Only for unauthenticated users and when not dismissed */}
      {!authService.isAuthenticated && showAuthBar && (
        <CompactAuthBar
          isAuthenticated={authService.isAuthenticated}
          onSignInPress={() => setShowAuth(true)}
          onProfilePress={() => setShowProfile(true)}
          onDismiss={() => setShowAuthBar(false)}
        />
      )}

      {/* Expandable Search */}
      <ExpandableSearch
        isExpanded={isSearchExpanded}
        onToggle={() => setIsSearchExpanded(!isSearchExpanded)}
        onSearchResults={setSearchResults}
      />

      {/* Filter Chips */}
      <FilterChips
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        isAuthenticated={authService.isAuthenticated}
      />

      {/* Main Content */}
      {shouldUseSections ? (
        <ScrollView
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}>
          {sectionedData.length === 0
            ? renderEmptyState()
            : sectionedData.map((section, index) => (
                <SectionGrid
                  key={`section-${index}`}
                  section={section}
                  columns={columns}
                  cardWidth={cardWidth}
                  onAssistantPress={handleAssistantPress}
                />
              ))}
        </ScrollView>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={row => row.key}
          renderItem={({item}) => (
            <AssistantGridRow
              row={item}
              cardWidth={cardWidth}
              onAssistantPress={handleAssistantPress}
            />
          )}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          testID="assistants-flat-list"
        />
      )}

      {/* Bottom Action Bar */}
      <BottomActionBar
        activeAction={activeAction}
        onActionPress={handleActionPress}
        onCreateAssistant={handleCreateAssistant}
        isAuthenticated={authService.isAuthenticated}
      />

      {/* Sheets */}

      {/* Profile Sheet */}
      {showProfile && (
        <ProfileSheet
          isVisible={showProfile}
          onClose={() => setShowProfile(false)}
          onSignInPress={() => setShowAuth(true)}
        />
      )}

      {/* Auth Sheet */}
      {showAuth && (
        <AuthSheet isVisible={showAuth} onClose={() => setShowAuth(false)} />
      )}

      {/* Drshub's Assistant Detail Sheet */}
      {selectedAssistant && (
        <AssistantDetailSheet
          isVisible={showAssistantDetail}
          assistant={selectedAssistant}
          onSignInPress={() => setShowAuth(true)}
          onClose={() => {
            setShowAssistantDetail(false);
            setSelectedAssistant(null);
          }}
        />
      )}

      {/* Unified Assistant Creation/Editing Sheet */}
      {showAssistantSheet && currentAssistant && (
        <AssistantSheet
          isVisible={showAssistantSheet}
          onClose={() => {
            setShowAssistantSheet(false);
            setCurrentAssistant(null);
          }}
          assistant={currentAssistant}
        />
      )}
    </View>
  );
});

export default AssistantsScreen;
