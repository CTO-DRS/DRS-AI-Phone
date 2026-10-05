/**
 * Mock of ModelHubStore for component tests — mirrors the real store's
 * observable surface with plain fields + jest.fn actions.
 */
export const mockModelHubStore = {
  favorites: [] as string[],
  recentlyViewed: [] as Array<{id: string; viewedAt: number}>,
  wifiOnlyDownloads: false,
  autoUpdateIds: [] as string[],
  version: 1,

  isFavorite: jest.fn((id: string) => mockModelHubStore.favorites.includes(id)),
  toggleFavorite: jest.fn((id: string) => {
    if (mockModelHubStore.favorites.includes(id)) {
      mockModelHubStore.favorites = mockModelHubStore.favorites.filter(
        f => f !== id,
      );
    } else {
      mockModelHubStore.favorites = [id, ...mockModelHubStore.favorites];
    }
  }),

  recordView: jest.fn((id: string) => {
    mockModelHubStore.recentlyViewed = [
      {id, viewedAt: Date.now()},
      ...mockModelHubStore.recentlyViewed.filter(e => e.id !== id),
    ].slice(0, 30);
  }),
  clearRecentlyViewed: jest.fn(() => {
    mockModelHubStore.recentlyViewed = [];
  }),

  setWifiOnly: jest.fn((enabled: boolean) => {
    mockModelHubStore.wifiOnlyDownloads = enabled;
  }),

  isAutoUpdate: jest.fn(
    (id: string) => mockModelHubStore.autoUpdateIds.includes(id),
  ),
  toggleAutoUpdate: jest.fn((id: string) => {
    if (mockModelHubStore.autoUpdateIds.includes(id)) {
      mockModelHubStore.autoUpdateIds = mockModelHubStore.autoUpdateIds.filter(
        a => a !== id,
      );
    } else {
      mockModelHubStore.autoUpdateIds = [...mockModelHubStore.autoUpdateIds, id];
    }
  }),
};
