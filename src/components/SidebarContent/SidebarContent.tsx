import React, {useCallback, useContext, useEffect, useState} from 'react';
import {
  TouchableOpacity,
  View,
  Alert,
  SectionList,
  TextInput,
} from 'react-native';
import {observer} from 'mobx-react';
import {Divider, Drawer, Text} from 'react-native-paper';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {DrawerContentComponentProps} from '@react-navigation/drawer';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {chatSessionStore, SessionMetaData} from '../../store';
import {Menu, RenameModal, Checkbox, BrandHeader} from '..';
import {
  BenchmarkIcon,
  ChatIcon,
  ChartBarIcon,
  CloseIcon,
  EditIcon,
  FileTextIcon,
  FolderIcon,
  ModelIcon,
  AssistantIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
  AppInfoIcon,
  MessageCircleLgIcon,
} from '../../assets/icons';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {ROUTES} from '../../utils/navigationConstants';
import {
  exportChatSession,
  exportChatSessionAsPdf,
} from '../../utils/exportUtils';
import {ChatStatsModal, FolderModal, TagsModal} from '..';

// Check if app is in debug mode
const isDebugMode = __DEV__;

/**
 * Extract the searchable text of a session (message bodies only — reasoning
 * and tool plumbing are intentionally excluded so search stays predictable).
 */
export const extractSessionSearchText = (session: SessionMetaData): string => {
  const parts: string[] = [];
  for (const message of session.messages) {
    if (message.type === 'text') {
      parts.push(message.text);
    } else if (message.type === 'assistant_turn') {
      for (const step of message.steps) {
        if (step.content) {
          parts.push(step.content);
        }
      }
    }
  }
  return parts.join('\n').toLowerCase();
};

// Session item props interface
interface SessionItemProps {
  session: SessionMetaData;
  isActive: boolean;
  isPinned: boolean;
  onPress: (sessionId: string) => void;
  onLongPress: (sessionId: string, event: any) => void;
  menuVisible: string | null;
  menuPosition: {x: number; y: number};
  onMenuDismiss: () => void;
  onPressPin: (sessionId: string) => void;
  onPressRename: (session: SessionMetaData) => void;
  onPressDelete: (sessionId: string) => void;
  onPressExport: (sessionId: string) => void;
  onPressExportPdf: (sessionId: string) => void;
  onPressStats: (session: SessionMetaData) => void;
  onPressFolder: (session: SessionMetaData) => void;
  onPressTags: (session: SessionMetaData) => void;
  onPressSelect: (sessionId: string) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelection: (sessionId: string) => void;
  theme: any;
  styles: any;
  l10n: any;
}

// Memoized session item component
const SessionItem = React.memo<SessionItemProps>(
  ({
    session,
    isActive,
    isPinned,
    onPress,
    onLongPress,
    menuVisible,
    menuPosition,
    onMenuDismiss,
    onPressPin,
    onPressRename,
    onPressDelete,
    onPressExport,
    onPressExportPdf,
    onPressStats,
    onPressFolder,
    onPressTags,
    onPressSelect,
    isSelectionMode,
    isSelected,
    onToggleSelection,
    theme,
    styles,
    l10n,
  }) => {
    const handlePress = () => {
      if (isSelectionMode) {
        onToggleSelection(session.id);
      } else {
        onPress(session.id);
      }
    };

    const handleLongPress = (event: any) => {
      if (!isSelectionMode) {
        onLongPress(session.id, event);
      }
    };

    // Paper's Drawer.Item/Menu.Item invoke these render-prop functions when
    // rendering; stable identities (useCallback) keep the icon trees from
    // remounting and satisfy react/no-unstable-nested-components.
    const renderPinnedIndicator = useCallback(
      () => <StarIcon width={14} height={14} fill={theme.colors.primary} />,
      [theme],
    );
    const renderPinIcon = useCallback(
      () => (
        <StarIcon
          width={20}
          height={20}
          // star.svg is stroke-only and .svgrrc binds that stroke to the
          // fill prop, so fill='none' paints nothing. Omitting fill is
          // what yields an outline; no test can catch this (svg is mocked).
          {...(isPinned
            ? {fill: theme.colors.primary}
            : {stroke: theme.colors.primary})}
        />
      ),
      [isPinned, theme],
    );
    const renderRenameIcon = useCallback(
      () => <EditIcon stroke={theme.colors.primary} />,
      [theme],
    );
    const renderExportIcon = useCallback(
      () => <ShareIcon stroke={theme.colors.primary} />,
      [theme],
    );
    const renderDeleteIcon = useCallback(
      () => <TrashIcon stroke={theme.colors.error} />,
      [theme],
    );
    const renderFolderIcon = useCallback(
      () => <FolderIcon stroke={theme.colors.primary} />,
      [theme],
    );
    const renderTagIcon = useCallback(
      () => <TagIcon stroke={theme.colors.primary} />,
      [theme],
    );
    const renderStatsIcon = useCallback(
      () => <ChartBarIcon stroke={theme.colors.primary} />,
      [theme],
    );
    const renderFileTextIcon = useCallback(
      () => <FileTextIcon stroke={theme.colors.primary} />,
      [theme],
    );

    // Small folder/tags meta line under the session title.
    const folderLabel = (session.folder ?? '').trim();
    const tagList = session.tags ?? [];
    const hasMeta = folderLabel.length > 0 || tagList.length > 0;

    return (
      <View style={styles.sessionItemContainer}>
        {isSelectionMode && (
          <View style={styles.sessionCheckbox}>
            <Checkbox
              checked={isSelected}
              onPress={() => onToggleSelection(session.id)}
              testID={`checkbox-${session.id}`}
            />
          </View>
        )}
        <TouchableOpacity
          onPress={handlePress}
          onLongPress={handleLongPress}
          style={styles.sessionTouchable}>
          <Drawer.Item
            active={isActive}
            label={session.title}
            style={styles.sessionDrawerItem}
            right={isPinned ? renderPinnedIndicator : undefined}
          />
          {hasMeta && (
            <View
              style={styles.sessionMetaRow}
              testID={`session-meta-${session.id}`}>
              {folderLabel.length > 0 && (
                <View style={styles.sessionMetaChip}>
                  <FolderIcon
                    width={10}
                    height={10}
                    stroke={theme.colors.onSurfaceVariant}
                  />
                  <Text style={styles.sessionMetaText} numberOfLines={1}>
                    {folderLabel}
                  </Text>
                </View>
              )}
              {tagList.map(tag => (
                <View style={styles.sessionMetaChip} key={tag}>
                  <TagIcon
                    width={10}
                    height={10}
                    stroke={theme.colors.onSurfaceVariant}
                  />
                  <Text style={styles.sessionMetaText} numberOfLines={1}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
        {!isSelectionMode && (
          <Menu
            visible={menuVisible === session.id}
            onDismiss={onMenuDismiss}
            anchor={menuPosition}
            style={styles.menu}
            contentStyle={{}}
            anchorPosition="bottom">
            <Menu.Item
              testID={`session-pin-${session.id}`}
              onPress={() => {
                onPressPin(session.id);
                onMenuDismiss();
              }}
              label={
                isPinned
                  ? l10n.components.sidebarContent.unpin
                  : l10n.components.sidebarContent.pin
              }
              leadingIcon={renderPinIcon}
            />
            <Divider style={styles.menuDivider} />
            <Menu.Item
              onPress={() => {
                onPressRename(session);
                onMenuDismiss();
              }}
              label={l10n.common.rename}
              leadingIcon={renderRenameIcon}
            />
            <Menu.Item
              onPress={() => {
                onPressFolder(session);
                onMenuDismiss();
              }}
              label={l10n.components.sidebarContent.moveToFolder}
              leadingIcon={renderFolderIcon}
              testID={`session-folder-${session.id}`}
            />
            <Menu.Item
              onPress={() => {
                onPressTags(session);
                onMenuDismiss();
              }}
              label={l10n.components.sidebarContent.editTags}
              leadingIcon={renderTagIcon}
              testID={`session-tags-${session.id}`}
            />
            <Menu.Item
              onPress={() => {
                onPressStats(session);
                onMenuDismiss();
              }}
              label={l10n.components.sidebarContent.statistics}
              leadingIcon={renderStatsIcon}
              testID={`session-stats-${session.id}`}
            />
            <Menu.Item
              onPress={() => {
                onPressExport(session.id);
                onMenuDismiss();
              }}
              label={l10n.common.export}
              leadingIcon={renderExportIcon}
            />
            <Menu.Item
              onPress={() => {
                onPressExportPdf(session.id);
                onMenuDismiss();
              }}
              label={l10n.components.headerRight.exportCurrentSessionPdf}
              leadingIcon={renderFileTextIcon}
              testID={`session-export-pdf-${session.id}`}
            />
            <Menu.Item
              onPress={() => {
                onPressDelete(session.id);
                onMenuDismiss();
              }}
              label={l10n.common.delete}
              labelStyle={{color: theme.colors.error}}
              leadingIcon={renderDeleteIcon}
            />
            <Divider style={styles.menuDivider} />
            <Menu.Item
              onPress={() => {
                onPressSelect(session.id);
                onMenuDismiss();
              }}
              label={`${l10n.components.sidebarContent.select}...`}
            />
          </Menu>
        )}
      </View>
    );
  },
);

SessionItem.displayName = 'SessionItem';

// Selection mode header component
interface SelectionModeHeaderProps {
  selectedCount: number;
  onCancel: () => void;
  onExport: () => void;
  onDelete: () => void;
  l10n: any;
  theme: any;
  styles: any;
}

const SelectionModeHeader: React.FC<SelectionModeHeaderProps> = ({
  selectedCount,
  onCancel,
  onExport,
  onDelete,
  l10n,
  theme,
  styles,
}) => {
  return (
    <View style={styles.selectionModeHeader}>
      <TouchableOpacity onPress={onCancel} testID="cancel-selection-button">
        <Text style={{color: theme.colors.primary}}>{l10n.common.cancel}</Text>
      </TouchableOpacity>

      <Text style={styles.selectedCountText}>
        {t(l10n.components.sidebarContent.nSelected, {
          count: selectedCount.toString(),
        })}
      </Text>

      <View style={styles.headerActions}>
        <TouchableOpacity
          onPress={onExport}
          disabled={selectedCount === 0}
          style={[
            styles.headerActionButton,
            selectedCount === 0 && styles.headerActionButtonDisabled,
          ]}
          testID="bulk-export-button">
          <ShareIcon
            stroke={
              selectedCount === 0
                ? theme.colors.onSurfaceDisabled
                : theme.colors.primary
            }
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDelete}
          disabled={selectedCount === 0}
          style={[
            styles.headerActionButton,
            selectedCount === 0 && styles.headerActionButtonDisabled,
          ]}
          testID="bulk-delete-button">
          <TrashIcon
            stroke={
              selectedCount === 0
                ? theme.colors.onSurfaceDisabled
                : theme.colors.error
            }
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

SelectionModeHeader.displayName = 'SelectionModeHeader';

// Select all row component
interface SelectAllRowProps {
  allSelected: boolean;
  onToggle: () => void;
  l10n: any;
  styles: any;
}

const SelectAllRow: React.FC<SelectAllRowProps> = ({
  allSelected,
  onToggle,
  l10n,
  styles,
}) => {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={styles.selectAllRow}
      testID="select-all-row">
      <View style={styles.selectAllCheckbox}>
        <Checkbox checked={allSelected} onPress={onToggle} />
      </View>
      <Text style={styles.selectAllText}>
        {l10n.components.sidebarContent.selectAll}
      </Text>
    </TouchableOpacity>
  );
};

SelectAllRow.displayName = 'SelectAllRow';

export const SidebarContent: React.FC<DrawerContentComponentProps> = observer(
  props => {
    const [menuVisible, setMenuVisible] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState({x: 0, y: 0});
    const [sessionToRename, setSessionToRename] =
      useState<SessionMetaData | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    // Organization / stats dialogs
    const [folderSessionId, setFolderSessionId] = useState<string | null>(null);
    const [tagsSessionId, setTagsSessionId] = useState<string | null>(null);
    const [statsSessionId, setStatsSessionId] = useState<string | null>(null);
    const [globalStatsVisible, setGlobalStatsVisible] = useState(false);
    const [renameFolderName, setRenameFolderName] = useState<string | null>(
      null,
    );

    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const insets = useSafeAreaInsets();

    // Convert groupedSessions to SectionList format
    // observer() HOC handles MobX reactivity, transformation is cheap
    const groupedSessions = chatSessionStore.groupedSessions;
    const sections = React.useMemo(
      () =>
        Object.entries(groupedSessions).map(([dateLabel, sessions]) => ({
          title: dateLabel,
          data: sessions,
        })),
      [groupedSessions],
    );

    // When a search query is active, flatten the groups into a single
    // "Search results" section filtered by title and message content.
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const visibleSections = React.useMemo(() => {
      if (!normalizedQuery) {
        return sections;
      }
      const matched = sections
        .flatMap(section => section.data)
        .filter(
          session =>
            session.title.toLowerCase().includes(normalizedQuery) ||
            extractSessionSearchText(session).includes(normalizedQuery),
        );
      // Return an empty sections array when nothing matches so the
      // SectionList renders the "no results" empty state (an empty-data
      // section would still render its header and suppress the empty state).
      if (matched.length === 0) {
        return [];
      }
      return [
        {
          title: l10n.components.sidebarContent.searchResults,
          data: matched,
        },
      ];
    }, [normalizedQuery, sections, l10n]);

    useEffect(() => {
      chatSessionStore.loadSessionList();

      // Set localized date group names whenever the component mounts
      chatSessionStore.setDateGroupNames(
        l10n.components.sidebarContent.dateGroups,
      );
    }, [l10n.components.sidebarContent.dateGroups]);

    const openMenu = React.useCallback((sessionId: string, event: any) => {
      const {nativeEvent} = event;
      setMenuPosition({x: nativeEvent.pageX, y: nativeEvent.pageY});
      setMenuVisible(sessionId);
    }, []);

    const closeMenu = React.useCallback(() => {
      setMenuVisible(null);
    }, []);

    const handleSessionPress = React.useCallback(
      async (sessionId: string) => {
        await chatSessionStore.setActiveSession(sessionId);
        props.navigation.navigate(ROUTES.CHAT);
      },
      [props.navigation],
    );

    const handleSessionLongPress = React.useCallback(
      (sessionId: string, event: any) => {
        openMenu(sessionId, event);
      },
      [openMenu],
    );

    const handlePressRename = React.useCallback(
      (session: SessionMetaData) => {
        setSessionToRename(session);
        closeMenu();
      },
      [closeMenu],
    );

    const onPressDelete = React.useCallback(
      (sessionId: string) => {
        if (sessionId) {
          Alert.alert(
            l10n.components.sidebarContent.deleteChatTitle,
            l10n.components.sidebarContent.deleteChatMessage,
            [
              {
                text: l10n.common.cancel,
                style: 'cancel',
              },
              {
                text: l10n.common.delete,
                style: 'destructive',
                onPress: async () => {
                  chatSessionStore.resetActiveSession();
                  await chatSessionStore.deleteSession(sessionId);
                  closeMenu();
                },
              },
            ],
          );
        }
      },
      [l10n, closeMenu],
    );

    const handlePressPin = React.useCallback(async (sessionId: string) => {
      await chatSessionStore.togglePinSession(sessionId);
    }, []);

    const handlePressExport = React.useCallback(
      async (sessionId: string) => {
        try {
          await exportChatSession(sessionId);
        } catch {
          Alert.alert(
            l10n.common.error,
            l10n.components.sidebarContent.exportError,
          );
        }
      },
      [l10n],
    );

    const handlePressExportPdf = React.useCallback(
      async (sessionId: string) => {
        try {
          await exportChatSessionAsPdf(sessionId);
        } catch {
          Alert.alert(
            l10n.common.error,
            l10n.components.sidebarContent.exportError,
          );
        }
      },
      [l10n],
    );

    const handlePressStats = React.useCallback((session: SessionMetaData) => {
      setStatsSessionId(session.id);
    }, []);

    const handlePressFolder = React.useCallback((session: SessionMetaData) => {
      setFolderSessionId(session.id);
    }, []);

    const handlePressTags = React.useCallback((session: SessionMetaData) => {
      setTagsSessionId(session.id);
    }, []);

    const handlePressSelect = React.useCallback(
      (sessionId: string) => {
        chatSessionStore.enterSelectionMode(sessionId);
        closeMenu();
      },
      [closeMenu],
    );

    const handleExitSelectionMode = React.useCallback(() => {
      chatSessionStore.exitSelectionMode();
    }, []);

    const handleToggleSelection = React.useCallback((sessionId: string) => {
      chatSessionStore.toggleSessionSelection(sessionId);
    }, []);

    const handleBulkDelete = React.useCallback(() => {
      const count = chatSessionStore.selectedCount;

      Alert.alert(
        l10n.components.sidebarContent.bulkDeleteTitle,
        t(l10n.components.sidebarContent.bulkDeleteMessage, {
          count: count.toString(),
        }),
        [
          {
            text: l10n.common.cancel,
            style: 'cancel',
          },
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: async () => {
              try {
                await chatSessionStore.bulkDeleteSessions();
              } catch {
                Alert.alert(
                  l10n.common.error,
                  l10n.components.sidebarContent.bulkDeleteError,
                );
              }
            },
          },
        ],
      );
    }, [l10n]);

    const handleBulkExport = React.useCallback(async () => {
      try {
        await chatSessionStore.bulkExportSessions();
      } catch {
        Alert.alert(
          l10n.common.error,
          l10n.components.sidebarContent.bulkExportError,
        );
      }
    }, [l10n]);

    // Key extractor for SectionList
    const keyExtractor = React.useCallback(
      (item: SessionMetaData) => item.id,
      [],
    );

    // Empty state shown when a search query matches nothing.
    const renderNoSearchResults = () => (
      <View style={styles.emptySessions} testID="sidebar-no-search-results">
        <SearchIcon
          stroke={theme.colors.onSurfaceVariant}
          width={32}
          height={32}
        />
        <Text style={styles.emptySessionsTitle}>
          {l10n.components.sidebarContent.noSearchResults}
        </Text>
        <Text style={styles.emptySessionsHint}>
          {l10n.components.sidebarContent.noSearchResultsHint}
        </Text>
      </View>
    );

    // Search bar shown between the main menu and the session list.
    const renderSearchBar = () => (
      <View style={styles.searchContainer} testID="sidebar-session-search">
        <SearchIcon
          stroke={theme.colors.onSurfaceVariant}
          width={18}
          height={18}
        />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={l10n.components.sidebarContent.searchSessions}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          underlineColorAndroid="transparent"
          autoCorrect={false}
          autoCapitalize="none"
          testID="sidebar-session-search-input"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            testID="sidebar-session-search-clear"
            accessibilityRole="button"
            accessibilityLabel={l10n.common.clear}>
            <CloseIcon
              stroke={theme.colors.onSurfaceVariant}
              width={16}
              height={16}
            />
          </TouchableOpacity>
        )}
      </View>
    );

    // Folder/tag filter chips shown under the search bar.
    const folders = chatSessionStore.folders ?? [];
    const tags = chatSessionStore.tags ?? [];
    const hasFilters = chatSessionStore.hasActiveFilters ?? false;
    const renderFilterChips = () => {
      if (folders.length === 0 && tags.length === 0 && !hasFilters) {
        return null;
      }
      return (
        <View style={styles.filterChipsContainer} testID="sidebar-filter-chips">
          {hasFilters && (
            <Text style={styles.filterHint}>
              {l10n.components.sidebarContent.filteredBy}
            </Text>
          )}
          <View style={styles.filterChipsRow}>
            {folders.map(folder => {
              const active =
                chatSessionStore.activeFolderFilter === folder.name;
              return (
                <TouchableOpacity
                  key={`folder-${folder.name}`}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() =>
                    chatSessionStore.setFolderFilter(
                      active ? null : folder.name,
                    )
                  }
                  onLongPress={() => {
                    // Same-sheet actions: rename or delete this folder.
                    Alert.alert(folder.name, undefined, [
                      {
                        text: l10n.common.rename,
                        onPress: () => setRenameFolderName(folder.name),
                      },
                      {
                        text: l10n.common.delete,
                        style: 'destructive',
                        onPress: () => {
                          Alert.alert(
                            l10n.components.sidebarContent.deleteFolderTitle,
                            t(
                              l10n.components.sidebarContent
                                .deleteFolderMessage,
                              {
                                name: folder.name,
                              },
                            ),
                            [
                              {text: l10n.common.cancel, style: 'cancel'},
                              {
                                text: l10n.common.delete,
                                style: 'destructive',
                                onPress: () =>
                                  chatSessionStore.deleteFolder(folder.name),
                              },
                            ],
                          );
                        },
                      },
                      {text: l10n.common.cancel, style: 'cancel'},
                    ]);
                  }}
                  testID={`filter-folder-${folder.name}`}>
                  <FolderIcon
                    width={12}
                    height={12}
                    stroke={theme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}>
                    {folder.name} ({folder.count})
                  </Text>
                </TouchableOpacity>
              );
            })}
            {tags.map(tag => {
              const active = chatSessionStore.activeTagFilter === tag.name;
              return (
                <TouchableOpacity
                  key={`tag-${tag.name}`}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() =>
                    chatSessionStore.setTagFilter(active ? null : tag.name)
                  }
                  onLongPress={() => {
                    Alert.alert(
                      l10n.components.sidebarContent.deleteTagTitle,
                      t(l10n.components.sidebarContent.deleteTagMessage, {
                        name: tag.name,
                      }),
                      [
                        {text: l10n.common.cancel, style: 'cancel'},
                        {
                          text: l10n.common.delete,
                          style: 'destructive',
                          onPress: () =>
                            chatSessionStore.removeTagEverywhere(tag.name),
                        },
                      ],
                    );
                  }}
                  testID={`filter-tag-${tag.name}`}>
                  <TagIcon
                    width={12}
                    height={12}
                    stroke={theme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}>
                    {tag.name} ({tag.count})
                  </Text>
                </TouchableOpacity>
              );
            })}
            {hasFilters && (
              <TouchableOpacity
                style={styles.filterChipClear}
                onPress={() => chatSessionStore.clearOrganizationFilters()}
                testID="sidebar-clear-filters">
                <CloseIcon
                  stroke={theme.colors.onSurfaceVariant}
                  width={12}
                  height={12}
                />
                <Text style={styles.filterChipClearText}>
                  {l10n.components.sidebarContent.clearFilters}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    };

    // Render section header (date labels)
    const renderSectionHeader = React.useCallback(
      ({section}: {section: {title: string}}) => (
        <View style={styles.drawerSection}>
          <Text variant="bodySmall" style={styles.dateLabel}>
            {section.title}
          </Text>
        </View>
      ),
      [styles.drawerSection, styles.dateLabel],
    );

    // Render session item
    // observer() HOC handles MobX reactivity for chatSessionStore.activeSessionId
    const renderItem = React.useCallback(
      ({item}: {item: SessionMetaData}) => {
        const isActive = chatSessionStore.activeSessionId === item.id;
        const isSelected = chatSessionStore.selectedSessionIds.has(item.id);
        return (
          <SessionItem
            session={item}
            isActive={isActive}
            isPinned={item.pinned || false}
            onPress={handleSessionPress}
            onLongPress={handleSessionLongPress}
            menuVisible={menuVisible}
            menuPosition={menuPosition}
            onMenuDismiss={closeMenu}
            onPressPin={handlePressPin}
            onPressRename={handlePressRename}
            onPressDelete={onPressDelete}
            onPressExport={handlePressExport}
            onPressExportPdf={handlePressExportPdf}
            onPressStats={handlePressStats}
            onPressFolder={handlePressFolder}
            onPressTags={handlePressTags}
            onPressSelect={handlePressSelect}
            isSelectionMode={chatSessionStore.isSelectionMode}
            isSelected={isSelected}
            onToggleSelection={handleToggleSelection}
            theme={theme}
            styles={styles}
            l10n={l10n}
          />
        );
      },
      [
        handleSessionPress,
        handleSessionLongPress,
        menuVisible,
        menuPosition,
        closeMenu,
        handlePressPin,
        handlePressRename,
        onPressDelete,
        handlePressExport,
        handlePressExportPdf,
        handlePressStats,
        handlePressFolder,
        handlePressTags,
        handlePressSelect,
        handleToggleSelection,
        theme,
        styles,
        l10n,
      ],
    );

    // Empty state shown when the user has no chat sessions yet.
    const renderEmptySessions = () => (
      <View style={styles.emptySessions} testID="sidebar-empty-sessions">
        <MessageCircleLgIcon
          stroke={theme.colors.onSurfaceVariant}
          width={40}
          height={40}
        />
        <Text style={styles.emptySessionsTitle}>
          {l10n.components.sidebarContent.emptySessionsTitle}
        </Text>
        <Text style={styles.emptySessionsHint}>
          {l10n.components.sidebarContent.emptySessionsHint}
        </Text>
      </View>
    );

    // List header with main menu items
    const ListHeaderComponent = React.useMemo(
      () => (
        <View>
          <BrandHeader />
          <Drawer.Section showDivider={false}>
            <Drawer.Item
              label={l10n.components.sidebarContent.menuItems.chat}
              icon={() => <ChatIcon stroke={theme.colors.primary} />}
              onPress={() => props.navigation.navigate(ROUTES.CHAT)}
              style={styles.menuDrawerItem}
              testID="drawer-item-chat"
            />
            <Drawer.Item
              label={l10n.components.sidebarContent.menuItems.assistants}
              icon={() => <AssistantIcon stroke={theme.colors.primary} />}
              onPress={() => props.navigation.navigate(ROUTES.ASSISTANTS)}
              style={styles.menuDrawerItem}
              testID="drawer-item-assistants"
            />
            <Drawer.Item
              label={l10n.components.sidebarContent.menuItems.models}
              icon={() => <ModelIcon stroke={theme.colors.primary} />}
              onPress={() => props.navigation.navigate(ROUTES.MODELS)}
              style={styles.menuDrawerItem}
              testID="drawer-item-models"
            />
            <Drawer.Item
              label={l10n.components.sidebarContent.menuItems.benchmark}
              icon={() => <BenchmarkIcon stroke={theme.colors.primary} />}
              onPress={() => props.navigation.navigate(ROUTES.BENCHMARK)}
              style={styles.menuDrawerItem}
              testID="drawer-item-benchmark"
            />
            <Drawer.Item
              label={l10n.components.sidebarContent.statistics}
              icon={() => <ChartBarIcon stroke={theme.colors.primary} />}
              onPress={() => setGlobalStatsVisible(true)}
              style={styles.menuDrawerItem}
              testID="drawer-item-statistics"
            />
            <Drawer.Item
              label={l10n.components.sidebarContent.menuItems.settings}
              icon={() => (
                <SettingsIcon
                  width={24}
                  height={24}
                  stroke={theme.colors.primary}
                />
              )}
              onPress={() => props.navigation.navigate(ROUTES.SETTINGS)}
              style={styles.menuDrawerItem}
              testID="drawer-item-settings"
            />
            <Drawer.Item
              label={l10n.components.sidebarContent.menuItems.appInfo}
              icon={() => (
                <AppInfoIcon
                  width={24}
                  height={24}
                  stroke={theme.colors.primary}
                />
              )}
              onPress={() => props.navigation.navigate(ROUTES.APP_INFO)}
              style={styles.menuDrawerItem}
            />
            {/* Only show Dev Tools in debug mode */}
            {isDebugMode && (
              <Drawer.Item
                label="Dev Tools"
                icon={() => (
                  <SettingsIcon
                    width={24}
                    height={24}
                    stroke={theme.colors.primary}
                  />
                )}
                onPress={() => props.navigation.navigate(ROUTES.DEV_TOOLS)}
                style={styles.menuDrawerItem}
              />
            )}
          </Drawer.Section>
          <Divider style={styles.divider} />
        </View>
      ),
      [l10n, theme, styles, props.navigation],
    );

    return (
      <GestureHandlerRootView style={styles.sidebarContainer}>
        <View
          style={[
            styles.contentWrapper,
            {paddingTop: insets.top, paddingBottom: insets.bottom},
          ]}>
          {chatSessionStore.isSelectionMode ? (
            <>
              <SelectionModeHeader
                selectedCount={chatSessionStore.selectedCount}
                onCancel={handleExitSelectionMode}
                onExport={handleBulkExport}
                onDelete={handleBulkDelete}
                l10n={l10n}
                theme={theme}
                styles={styles}
              />
              <SelectAllRow
                allSelected={chatSessionStore.allSelected}
                onToggle={() =>
                  chatSessionStore.allSelected
                    ? chatSessionStore.deselectAllSessions()
                    : chatSessionStore.selectAllSessions()
                }
                l10n={l10n}
                styles={styles}
              />
              <Divider style={styles.selectAllDivider} />
              <SectionList
                sections={sections}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                ListEmptyComponent={renderEmptySessions}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={styles.scrollViewContent}
              />
            </>
          ) : (
            <>
              <SectionList
                sections={visibleSections}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                ListHeaderComponent={
                  <>
                    {ListHeaderComponent}
                    {renderSearchBar()}
                    {renderFilterChips()}
                  </>
                }
                ListEmptyComponent={
                  normalizedQuery ? renderNoSearchResults : renderEmptySessions
                }
                stickySectionHeadersEnabled={false}
                contentContainerStyle={styles.scrollViewContent}
              />
            </>
          )}
        </View>
        <RenameModal
          visible={sessionToRename !== null}
          onClose={() => setSessionToRename(null)}
          session={sessionToRename}
        />
        <RenameModal
          visible={renameFolderName !== null}
          onClose={() => setRenameFolderName(null)}
          session={null}
          folder={renameFolderName}
        />
        <FolderModal
          visible={folderSessionId !== null}
          onClose={() => setFolderSessionId(null)}
          sessionId={folderSessionId}
        />
        <TagsModal
          visible={tagsSessionId !== null}
          onClose={() => setTagsSessionId(null)}
          sessionId={tagsSessionId}
        />
        <ChatStatsModal
          visible={globalStatsVisible || statsSessionId !== null}
          onClose={() => {
            setGlobalStatsVisible(false);
            setStatsSessionId(null);
          }}
          sessionId={statsSessionId}
        />
      </GestureHandlerRootView>
    );
  },
);
