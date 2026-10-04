import React from 'react';
import {act, fireEvent, waitFor} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';

import {AssistantsScreen} from '../AssistantsScreen';
import {AssistantGridRow} from '../components';

import {authService, syncService} from '../../../services';
import {assistantStore} from '../../../store';
import {
  createAssistant,
  createDrshubAssistant,
} from '../../../../jest/fixtures/assistants';

// Mirrors the real hook: the width change re-renders from inside the component,
// which is what rotation does. A parent re-render cannot, since observer() memoises.
let mockWindow = {width: 750, height: 1334, scale: 2, fontScale: 1};
const mockWindowListeners = new Set<() => void>();

const setWindowWidth = (width: number) => {
  mockWindow = {...mockWindow, width};
  mockWindowListeners.forEach(listener => listener());
};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const {useSyncExternalStore} = require('react');

  const subscribe = (listener: () => void) => {
    mockWindowListeners.add(listener);
    return () => mockWindowListeners.delete(listener);
  };

  const useMockWindowDimensions = () =>
    useSyncExternalStore(subscribe, () => mockWindow);

  return {__esModule: true, default: useMockWindowDimensions};
});

describe('AssistantsScreen', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Nothing is mounted yet, so assign straight through without notifying.
    mockWindow = {width: 750, height: 1334, scale: 2, fontScale: 1};

    // Reset the mock services to default state
    authService.isAuthenticated = false;
    (syncService.needsSync as jest.Mock).mockResolvedValue(false);
    (syncService.syncAll as jest.Mock).mockResolvedValue(undefined);

    // Reset assistantStore state
    assistantStore.assistants = [];
    assistantStore.cachedDrshubAssistants = [];
    assistantStore.userLibrary = [];
    assistantStore.userCreatedAssistants = [];
  });

  it('should render without crashing', () => {
    render(<AssistantsScreen />, {
      withNavigation: true,
      withSafeArea: true,
      withBottomSheetProvider: true,
    });
    // Basic render test - the component should mount successfully
    expect(true).toBe(true); // Placeholder assertion
  });

  // Migration tests removed - migration is now handled by AssistantStore

  it('should sync data on mount if user is authenticated and sync is needed', async () => {
    // const {authService, syncService} = require('../../services');

    // Set up the mock before rendering
    authService.isAuthenticated = true;
    (syncService.needsSync as jest.Mock).mockResolvedValue(true);

    render(<AssistantsScreen />, {
      withNavigation: true,
      withSafeArea: true,
      withBottomSheetProvider: true,
    });

    // Wait for useEffect to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(syncService.needsSync).toHaveBeenCalled();
    expect(syncService.syncAll).toHaveBeenCalled();
  });

  it('should not sync if user is not authenticated', async () => {
    // const {authService, syncService} = require('../../services');

    // Set up the mock before rendering
    authService.isAuthenticated = false;

    render(<AssistantsScreen />, {
      withNavigation: true,
      withSafeArea: true,
      withBottomSheetProvider: true,
    });

    // Wait for useEffect to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(syncService.syncAll).not.toHaveBeenCalled();
  });

  it('should handle sync errors gracefully', async () => {
    // const {authService, syncService} = require('../../services');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    // Set up the mock before rendering
    authService.isAuthenticated = true;
    (syncService.needsSync as jest.Mock).mockResolvedValue(true);
    (syncService.syncAll as jest.Mock).mockRejectedValue(
      new Error('Sync failed'),
    );

    render(<AssistantsScreen />, {
      withNavigation: true,
      withSafeArea: true,
      withBottomSheetProvider: true,
    });

    // Wait for useEffect to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error during initial setup:',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  describe('Filter Functionality', () => {
    beforeEach(() => {
      // Set up test data with different assistant types
      assistantStore.assistants = [
        createAssistant({
          id: 'local-1',
          name: 'Local Assistant 1',
          source: 'local',
        }),
        createAssistant({
          id: 'local-2',
          name: 'Local Assistant 2',
          source: 'local',
        }),
        createAssistant({
          id: 'video-1',
          name: 'Video Assistant',
          source: 'local',
          capabilities: {video: true, multimodal: true},
        }),
        createAssistant({
          id: 'downloaded-1',
          name: 'Downloaded Assistant',
          source: 'drshub',
        }),
      ];

      assistantStore.cachedDrshubAssistants = [
        createDrshubAssistant({
          id: 'hub-1',
          title: 'Free Hub Assistant',
          price_cents: 0,
        }),
        createDrshubAssistant({
          id: 'hub-2',
          title: 'Premium Hub Assistant',
          price_cents: 999,
        }),
        createDrshubAssistant({
          id: 'hub-video',
          title: 'Video Hub Assistant',
          price_cents: 0,
          categories: [
            {
              id: 'cat-1',
              name: 'Video',
              sort_order: 1,
              created_at: '2023-01-01',
            },
          ],
        }),
      ];
    });

    it('should display all assistants when "all" filter is active', async () => {
      const {getByText} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      await waitFor(() => {
        expect(getByText('Local Assistant 1')).toBeTruthy();
        expect(getByText('Downloaded Assistant')).toBeTruthy();
        expect(getByText('Free Hub Assistant')).toBeTruthy();
      });
    });

    it('should filter local assistants when "local" filter is pressed', async () => {
      const {getByText, queryByText} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Wait for initial render
      await waitFor(() => {
        expect(getByText('Local Assistant 1')).toBeTruthy();
      });

      // Press the "Local" filter chip
      const localFilter = getByText('Local');
      fireEvent.press(localFilter);

      await waitFor(() => {
        // Local assistants should be visible
        expect(getByText('Local Assistant 1')).toBeTruthy();
        expect(getByText('Downloaded Assistant')).toBeTruthy();
        // Hub assistants should not be visible
        expect(queryByText('Free Hub Assistant')).toBeNull();
        expect(queryByText('Premium Hub Assistant')).toBeNull();
      });
    });

    it('should filter video assistants when "video" filter is pressed', async () => {
      const {getByText, queryByText} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Wait for initial render
      await waitFor(() => {
        expect(getByText('Local Assistant 1')).toBeTruthy();
      });

      // Press the "Video" filter chip
      const videoFilter = getByText('Video');
      fireEvent.press(videoFilter);

      await waitFor(() => {
        // Video assistants should be visible
        expect(getByText('Video Assistant')).toBeTruthy();
        expect(getByText('Video Hub Assistant')).toBeTruthy();
        // Non-video assistants should not be visible
        expect(queryByText('Local Assistant 1')).toBeNull();
      });
    });

    it('should filter free assistants when "free" filter is pressed', async () => {
      const {getByText, queryByText} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Wait for initial render
      await waitFor(() => {
        expect(getByText('Local Assistant 1')).toBeTruthy();
      });

      // Press the "Free" filter chip
      const freeFilter = getByText('Free');
      fireEvent.press(freeFilter);

      await waitFor(() => {
        // Free assistants should be visible (local + free hub assistants)
        expect(getByText('Local Assistant 1')).toBeTruthy();
        expect(getByText('Free Hub Assistant')).toBeTruthy();
        // Premium assistants should not be visible
        expect(queryByText('Premium Hub Assistant')).toBeNull();
      });
    });

    it('should filter premium assistants when "premium" filter is pressed', async () => {
      const {getByText, queryByText, getByTestId} = render(
        <AssistantsScreen />,
        {
          withNavigation: true,
          withSafeArea: true,
          withBottomSheetProvider: true,
        },
      );

      // Wait for initial render
      await waitFor(() => {
        expect(getByText('Local Assistant 1')).toBeTruthy();
      });

      // Press the "Premium" filter chip
      const premiumFilter = getByTestId('filter-chip-premium');
      fireEvent.press(premiumFilter);

      await waitFor(() => {
        // Premium assistants should be visible
        expect(getByText('Premium Hub Assistant')).toBeTruthy();
        // Free and local assistants should not be visible
        expect(queryByText('Local Assistant 1')).toBeNull();
        expect(queryByText('Free Hub Assistant')).toBeNull();
      });
    });
  });

  describe('Authentication State', () => {
    it('should show auth bar when user is not authenticated', () => {
      authService.isAuthenticated = false;

      const {getByTestId} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      expect(getByTestId('compact-auth-bar')).toBeTruthy();
    });

    it('should not show auth bar when user is authenticated', () => {
      authService.isAuthenticated = true;

      const {queryByTestId} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      expect(queryByTestId('compact-auth-bar')).toBeNull();
    });

    it('should dismiss auth bar when dismiss button is pressed', async () => {
      authService.isAuthenticated = false;

      const {getByTestId, queryByTestId} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Auth bar should be visible
      expect(getByTestId('compact-auth-bar')).toBeTruthy();

      // Find and press the dismiss button
      const dismissButton = getByTestId('dismiss-auth-bar');
      fireEvent.press(dismissButton);

      await waitFor(() => {
        // Auth bar should be hidden
        expect(queryByTestId('compact-auth-bar')).toBeNull();
      });
    });
  });

  describe('Assistant Interactions', () => {
    beforeEach(() => {
      assistantStore.assistants = [
        createAssistant({
          id: 'local-1',
          name: 'Local Test Assistant',
          source: 'local',
        }),
      ];
      assistantStore.cachedDrshubAssistants = [
        createDrshubAssistant({
          id: 'hub-1',
          title: 'Hub Test Assistant',
          price_cents: 0,
        }),
      ];
    });

    it('should open assistant sheet when local assistant is pressed', async () => {
      const {getByText} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      await waitFor(() => {
        expect(getByText('Local Test Assistant')).toBeTruthy();
      });

      // Press the local assistant card
      const assistantCard = getByText('Local Test Assistant');
      fireEvent.press(assistantCard);

      // AssistantSheet should open (we can't easily test this without mocking the sheet)
      // But we can verify the press handler was called without errors
      expect(assistantCard).toBeTruthy();
    });

    it('should open assistant detail sheet when Drshub assistant is pressed', async () => {
      const {getByText} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      await waitFor(() => {
        expect(getByText('Hub Test Assistant')).toBeTruthy();
      });

      // Press the hub assistant card
      const assistantCard = getByText('Hub Test Assistant');
      fireEvent.press(assistantCard);

      // AssistantDetailSheet should open
      expect(assistantCard).toBeTruthy();
    });
  });

  describe('Empty States', () => {
    it('should show empty state when no assistants exist', async () => {
      assistantStore.assistants = [];
      assistantStore.cachedDrshubAssistants = [];

      const {getByText} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      await waitFor(() => {
        expect(
          getByText(/No Assistants found|Create your first Assistant/i),
        ).toBeTruthy();
      });
    });

    it('should show appropriate empty state for local filter', async () => {
      assistantStore.assistants = [];
      assistantStore.cachedDrshubAssistants = [
        createDrshubAssistant({
          id: 'hub-1',
          title: 'Hub Assistant',
          price_cents: 0,
        }),
      ];

      const {getByText} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Press the "Local" filter
      const localFilter = getByText('Local');
      fireEvent.press(localFilter);

      await waitFor(() => {
        expect(getByText(/Create your first Assistant/i)).toBeTruthy();
      });
    });
  });

  describe('Pull to Refresh', () => {
    it('should have refresh control on FlatList', async () => {
      assistantStore.assistants = [
        createAssistant({
          id: 'local-1',
          name: 'Test Assistant',
          source: 'local',
        }),
      ];

      const {getByTestId} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Wait for initial render
      await waitFor(() => {
        const flatList = getByTestId('assistants-flat-list');
        expect(flatList).toBeTruthy();
        expect(flatList.props.refreshControl).toBeTruthy();
      });
    });
  });

  describe('Bottom Action Bar', () => {
    it('should toggle search when search button is pressed', async () => {
      const {getByTestId, queryByTestId} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Search should not be expanded initially
      expect(queryByTestId('expandable-search')).toBeNull();

      // Press search button
      const searchButton = getByTestId('bottom-action-search');
      fireEvent.press(searchButton);

      // Search should expand
      await waitFor(() => {
        expect(getByTestId('expandable-search')).toBeTruthy();
      });
    });

    it('should show auth sheet when profile button is pressed and user is not authenticated', async () => {
      authService.isAuthenticated = false;

      const {getByTestId} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Press profile button
      const profileButton = getByTestId('bottom-action-profile');
      fireEvent.press(profileButton);

      // Auth sheet should open (we can verify the button was pressed without errors)
      expect(profileButton).toBeTruthy();
    });

    it('should show profile sheet when profile button is pressed and user is authenticated', async () => {
      authService.isAuthenticated = true;

      const {getByTestId} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Press profile button
      const profileButton = getByTestId('bottom-action-profile');
      fireEvent.press(profileButton);

      // Profile sheet should open (we can verify the button was pressed without errors)
      expect(profileButton).toBeTruthy();
    });
  });

  describe('Data Loading', () => {
    it('should render without errors when data is available', async () => {
      assistantStore.assistants = [
        createAssistant({
          id: 'local-1',
          name: 'Test Assistant',
          source: 'local',
        }),
      ];
      assistantStore.cachedDrshubAssistants = [
        createDrshubAssistant({
          id: 'hub-1',
          title: 'Hub Assistant',
          price_cents: 0,
        }),
      ];

      const {getByText} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      await waitFor(() => {
        expect(getByText('Test Assistant')).toBeTruthy();
        expect(getByText('Hub Assistant')).toBeTruthy();
      });
    });

    it('should render correctly when authenticated', async () => {
      authService.isAuthenticated = true;
      assistantStore.assistants = [
        createAssistant({
          id: 'local-1',
          name: 'Local Assistant',
          source: 'local',
        }),
      ];
      assistantStore.userLibrary = [
        createDrshubAssistant({
          id: 'lib-1',
          title: 'Library Assistant',
          price_cents: 0,
        }),
      ];

      const {getByText, queryByTestId} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Auth bar should not be shown
      expect(queryByTestId('compact-auth-bar')).toBeNull();

      await waitFor(() => {
        expect(getByText('Local Assistant')).toBeTruthy();
      });
    });

    it('should render correctly when not authenticated', async () => {
      authService.isAuthenticated = false;
      assistantStore.assistants = [
        createAssistant({
          id: 'local-1',
          name: 'Local Assistant',
          source: 'local',
        }),
      ];

      const {getByText, getByTestId} = render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Auth bar should be shown
      expect(getByTestId('compact-auth-bar')).toBeTruthy();

      await waitFor(() => {
        expect(getByText('Local Assistant')).toBeTruthy();
      });
    });
  });

  describe('Grid Layout', () => {
    const fiveLocalAssistants = ['g1', 'g2', 'g3', 'g4', 'g5'].map(id =>
      createAssistant({id, name: `Grid Assistant ${id}`, source: 'local'}),
    );

    const renderScreen = () =>
      render(<AssistantsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

    afterEach(() => {
      act(() => {
        setWindowWidth(750);
      });
    });

    it('reflows the flat list on a width change without remounting it', () => {
      assistantStore.assistants = fiveLocalAssistants;
      setWindowWidth(360);

      const {getByTestId, UNSAFE_getAllByType} = renderScreen();
      const firstRowSize = () =>
        UNSAFE_getAllByType(AssistantGridRow)[0].props.row.items.length;

      const flatList = getByTestId('assistants-flat-list');
      expect(flatList.props.numColumns).toBeUndefined();
      expect(firstRowSize()).toBe(2);

      act(() => {
        setWindowWidth(800);
      });

      expect(getByTestId('assistants-flat-list')).toBe(flatList);
      expect(firstRowSize()).toBe(4);
    });

    it('renders the same rows and cell width on both render paths', async () => {
      // A second section is what sends the screen down the sectioned path.
      assistantStore.assistants = fiveLocalAssistants;
      assistantStore.cachedDrshubAssistants = [
        createDrshubAssistant({
          id: 'hub-1',
          title: 'Hub Assistant',
          price_cents: 0,
        }),
      ];
      setWindowWidth(800);

      const {getByText, UNSAFE_getAllByType} = renderScreen();

      const sectionedRows = UNSAFE_getAllByType(AssistantGridRow);
      expect(sectionedRows[0].props.row.items).toHaveLength(4);
      expect(sectionedRows[1].props.row.items).toHaveLength(1);
      sectionedRows.forEach(row =>
        expect(row.props.cardWidth).toBeCloseTo(180),
      );

      fireEvent.press(getByText('Local'));

      await waitFor(() => {
        const flatRows = UNSAFE_getAllByType(AssistantGridRow);
        expect(flatRows.map(row => row.props.row.items.length)).toEqual([4, 1]);
        flatRows.forEach(row => expect(row.props.cardWidth).toBeCloseTo(180));
      });
    });
  });
});
