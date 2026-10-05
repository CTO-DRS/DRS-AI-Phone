import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Hub-specific user state: favorites, recently viewed, download preferences.
 *
 * This store never holds model payloads — only ids and small metadata that
 * belongs to the Hub experience. The models themselves stay in ModelStore so
 * there is a single source of truth for model records.
 */

const MAX_RECENTLY_VIEWED = 30;

export interface RecentlyViewedEntry {
  id: string;
  viewedAt: number;
}

class ModelHubStore {
  /** Model ids the user starred. Works for HF repos and installed models. */
  favorites: string[] = [];

  /** Ring buffer of recently opened model pages (id + timestamp). */
  recentlyViewed: RecentlyViewedEntry[] = [];

  /** Restrict model downloads to Wi-Fi networks (WorkManager WIFI constraint). */
  wifiOnlyDownloads = false;

  /** Model ids enrolled in automatic update checks. */
  autoUpdateIds: string[] = [];

  /** Schema version for future migrations of the persisted blob. */
  version = 1;

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'ModelHubStore',
      properties: [
        'favorites',
        'recentlyViewed',
        'wifiOnlyDownloads',
        'autoUpdateIds',
        'version',
      ],
      storage: AsyncStorage,
    });
  }

  // ── Favorites ────────────────────────────────────────────────────────────

  isFavorite = (id: string): boolean => this.favorites.includes(id);

  toggleFavorite = (id: string): void => {
    runInAction(() => {
      if (this.favorites.includes(id)) {
        this.favorites = this.favorites.filter(f => f !== id);
      } else {
        this.favorites = [id, ...this.favorites];
      }
    });
  };

  // ── Recently viewed ──────────────────────────────────────────────────────

  recordView = (id: string): void => {
    runInAction(() => {
      this.recentlyViewed = [
        {id, viewedAt: Date.now()},
        ...this.recentlyViewed.filter(e => e.id !== id),
      ].slice(0, MAX_RECENTLY_VIEWED);
    });
  };

  clearRecentlyViewed = (): void => {
    runInAction(() => {
      this.recentlyViewed = [];
    });
  };

  // ── Download preferences ────────────────────────────────────────────────

  setWifiOnly = (enabled: boolean): void => {
    runInAction(() => {
      this.wifiOnlyDownloads = enabled;
    });
  };

  isAutoUpdate = (id: string): boolean => this.autoUpdateIds.includes(id);

  toggleAutoUpdate = (id: string): void => {
    runInAction(() => {
      if (this.autoUpdateIds.includes(id)) {
        this.autoUpdateIds = this.autoUpdateIds.filter(a => a !== id);
      } else {
        this.autoUpdateIds = [...this.autoUpdateIds, id];
      }
    });
  };
}

export const modelHubStore = new ModelHubStore();
