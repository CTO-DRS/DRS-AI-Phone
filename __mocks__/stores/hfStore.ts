import {mockHFModel1, mockHFModel2} from '../../jest/fixtures/models';
import type {HuggingFaceModel} from '../../src/utils/types';

type MockHFStore = {
  models: HuggingFaceModel[];
  isLoading: boolean;
  error: string;
  nextPageLink: string | null;
  searchQuery: string;
  queryFilter: string;
  queryFull: boolean;
  queryConfig: boolean;
  hfToken: string;
  useHfToken: boolean;
  searchFilters: {author: string; sortBy: 'relevance'};
  isTokenPresent: boolean;
  shouldUseToken: boolean;
  setUseHfToken: jest.Mock;
  setToken: jest.Mock;
  clearToken: jest.Mock;
  setSearchQuery: jest.Mock;
  setSearchFilters: jest.Mock;
  fetchAndSetGGUFSpecs: jest.Mock;
  fetchModelFileDetails: jest.Mock;
  getModelById: jest.Mock;
  fetchModelData: jest.Mock;
  fetchModels: jest.Mock;
  fetchMoreModels: jest.Mock;
};

// Explicit annotation breaks the self-reference cycle (getModelById reads
// mockHFStore.models), which would otherwise make TS infer `any`.
export const mockHFStore: MockHFStore = {
  models: [mockHFModel1, mockHFModel2],
  isLoading: false,
  error: '',
  nextPageLink: null,
  searchQuery: '',
  queryFilter: 'gguf',
  queryFull: true,
  queryConfig: true,
  hfToken: '',
  useHfToken: true,
  searchFilters: {
    author: '',
    sortBy: 'relevance' as const,
  },

  get isTokenPresent(): boolean {
    return !!this.hfToken && this.hfToken.trim().length > 0;
  },
  get shouldUseToken(): boolean {
    return this.isTokenPresent && this.useHfToken;
  },

  setUseHfToken: jest.fn(),
  setToken: jest.fn().mockResolvedValue(Promise.resolve(true)),
  clearToken: jest.fn().mockResolvedValue(Promise.resolve(true)),

  // Methods
  setSearchQuery: jest.fn(),
  setSearchFilters: jest.fn(),
  fetchAndSetGGUFSpecs: jest.fn().mockResolvedValue(undefined),
  fetchModelFileDetails: jest.fn().mockResolvedValue(undefined),
  getModelById: jest.fn(id =>
    mockHFStore.models.find(model => model.id === id),
  ),
  fetchModelData: jest.fn().mockResolvedValue(undefined),
  fetchModels: jest.fn().mockResolvedValue(undefined),
  fetchMoreModels: jest.fn().mockResolvedValue(undefined),
};

// Mock the store instance
export const hfStore = mockHFStore;
