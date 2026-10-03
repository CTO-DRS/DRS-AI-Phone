import {runInAction} from 'mobx';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {assistantStore} from '../LegacyStore';
import {drshubService} from '../../services';
import {isUSStorefront} from '../../utils/region';
import {assistantRepository} from '../../repositories/AssistantRepository';
import type {Assistant} from '../../types/assistant';
import type {DrshubAssistant} from '../../types/drshub';
import * as imageUtils from '../../utils/imageUtils';
import {resolveHFModelForDownload} from '../../utils/hfResolve';
import {LOOKIE_DEFAULT_MODEL} from '../builtinAssistantModels';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    clear: jest.fn(async () => values.clear()),
  };
});

// Mock dependencies
jest.mock('../../utils/hfResolve', () => ({
  resolveHFModelForDownload: jest.fn(),
}));
jest.mock('../../repositories/AssistantRepository', () => ({
  assistantRepository: {
    getAllAssistants: jest.fn(),
    createAssistant: jest.fn(),
    updateAssistant: jest.fn(),
    deleteAssistant: jest.fn(),
    getAssistantById: jest.fn(),
    checkAndMigrateFromJSON: jest.fn(),
    getLocalAssistants: jest.fn(),
    getDrshubAssistants: jest.fn(),
  },
}));

jest.mock('../../utils/imageUtils', () => ({
  downloadAssistantThumbnail: jest.fn(),
  deleteAssistantThumbnail: jest.fn(),
}));

jest.mock('../../services', () => ({
  drshubService: {
    getAssistants: jest.fn(),
    getAssistant: jest.fn(),
    getLibrary: jest.fn(),
    getMyAssistants: jest.fn(),
    getCategories: jest.fn(),
    getTags: jest.fn(),
    checkAssistantOwnership: jest.fn(),
  },
}));

// Mock MobX persist
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn(),
}));

// Eligibility writer dependencies: iOS StoreKit storefront + Android probe.
jest.mock('../../utils/region', () => ({
  isUSStorefront: jest.fn(),
}));

// Toggle the module per test via a getter so the null-module fail-closed path
// can be exercised here. prepareExternalLink / reportExternalContentLink are
// stubbed so a test can assert the probe never mints a token, launches, or reports.
const makeExternalContentLink = () => ({
  isExternalContentLinkAvailable: jest.fn(),
  prepareExternalLink: jest.fn(),
  reportExternalContentLink: jest.fn(),
});
let mockExternalContentLink: ReturnType<typeof makeExternalContentLink> | null =
  makeExternalContentLink();
jest.mock('../../specs/NativeExternalContentLink', () => ({
  __esModule: true,
  get default() {
    return mockExternalContentLink;
  },
}));

describe('LegacyStore', () => {
  const mockAssistant: Assistant = {
    type: 'local',
    id: 'test-assistant-1',
    name: 'Test Assistant',
    description: 'A test assistant',
    systemPrompt: 'You are a helpful assistant.',
    originalSystemPrompt: 'You are a helpful assistant.',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    source: 'local',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  const mockDrshubAssistant: DrshubAssistant = {
    id: 'ph-assistant-1',
    title: 'Drshub Test Assistant',
    description: 'A test assistant from Drshub',
    creator_id: 'creator-1',
    protection_level: 'public',
    price_cents: 0,
    system_prompt: 'You are a {{role}} assistant.',
    thumbnail_url: 'https://example.com/thumb.jpg',
    type: 'drshub',
    model_settings: {},
    allow_fork: true,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();

    // Reset store state
    runInAction(() => {
      assistantStore.assistants = [];
      assistantStore.cachedDrshubAssistants = [];
      assistantStore.userLibrary = [];
      assistantStore.userCreatedAssistants = [];
      assistantStore.isLoadingDrshub = false;
      assistantStore.syncState = {status: 'idle'};
      assistantStore.isMigrating = false;
      assistantStore.migrationComplete = false;
    });

    // Setup default mocks
    (assistantRepository.getAllAssistants as jest.Mock).mockResolvedValue([]);
    (assistantRepository.checkAndMigrateFromJSON as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const mockAssistants = [mockAssistant];
      (assistantRepository.getAllAssistants as jest.Mock).mockResolvedValue(mockAssistants);

      // Create a new store instance to test initialization
      // eslint-disable-next-line no-new
      new (assistantStore.constructor as any)();

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(assistantRepository.checkAndMigrateFromJSON).toHaveBeenCalled();
      expect(assistantRepository.getAllAssistants).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      const error = new Error('Database error');
      (assistantRepository.getAllAssistants as jest.Mock).mockRejectedValue(error);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Create a new store instance to test initialization
      // eslint-disable-next-line no-new
      new (assistantStore.constructor as any)();

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading assistants from database:',
        error,
      );

      consoleSpy.mockRestore();
    });

    it('creates the Lookie assistant from the offline constant without a network resolve', async () => {
      (assistantRepository.getAllAssistants as jest.Mock).mockResolvedValue([]);
      (assistantRepository.createAssistant as jest.Mock).mockImplementation(
        async (assistantData: any) => ({
          ...assistantData,
          id: 'lookie-id',
          created_at: 'now',
          updated_at: 'now',
        }),
      );

      // eslint-disable-next-line no-new
      new (assistantStore.constructor as any)();
      await new Promise(resolve => setTimeout(resolve, 100));

      const lookieCall = (assistantRepository.createAssistant as jest.Mock).mock.calls.find(
        call => call[0]?.name === 'Lookie',
      );

      expect(lookieCall).toBeDefined();
      expect(lookieCall![0].defaultModel).toBe(LOOKIE_DEFAULT_MODEL);
      // No HF resolve / network call at assistant init.
      expect(resolveHFModelForDownload).not.toHaveBeenCalled();
    });

    it('does not recreate the Lookie assistant if one already exists', async () => {
      const existingLookie: Assistant = {
        ...mockAssistant,
        id: 'existing-lookie',
        name: 'Lookie',
        capabilities: {video: true},
      } as Assistant;
      (assistantRepository.getAllAssistants as jest.Mock).mockResolvedValue([
        existingLookie,
      ]);

      // eslint-disable-next-line no-new
      new (assistantStore.constructor as any)();
      await new Promise(resolve => setTimeout(resolve, 100));

      const lookieCreate = (
        assistantRepository.createAssistant as jest.Mock
      ).mock.calls.find(call => call[0]?.name === 'Lookie');
      expect(lookieCreate).toBeUndefined();
      expect(resolveHFModelForDownload).not.toHaveBeenCalled();
    });
  });

  describe('checkout eligibility writer', () => {
    const originalOS = Platform.OS;
    const originalE2E = (global as any).__E2E__;

    const runWriter = () => (assistantStore as any).checkCheckoutEligibility();

    beforeEach(() => {
      // Exercise the real per-platform branch (prod path), not the E2E override.
      (global as any).__E2E__ = false;
      mockExternalContentLink = makeExternalContentLink();
      (isUSStorefront as jest.Mock).mockReset();
      runInAction(() => {
        (assistantStore as any).isCheckoutEligible = false;
      });
    });

    afterEach(() => {
      Platform.OS = originalOS;
      (global as any).__E2E__ = originalE2E;
    });

    it('Android: EXTERNAL_CONTENT_LINK available -> eligible (locale irrelevant)', async () => {
      Platform.OS = 'android';
      mockExternalContentLink!.isExternalContentLinkAvailable.mockResolvedValue(
        true,
      );

      await runWriter();

      expect(
        mockExternalContentLink!.isExternalContentLinkAvailable,
      ).toHaveBeenCalledTimes(1);
      expect(isUSStorefront).not.toHaveBeenCalled();
      // Probe is side-effect-free: never mints a token, launches, or reports.
      expect(
        mockExternalContentLink!.prepareExternalLink,
      ).not.toHaveBeenCalled();
      expect(
        mockExternalContentLink!.reportExternalContentLink,
      ).not.toHaveBeenCalled();
      expect(assistantStore.isCheckoutEligible).toBe(true);
    });

    it('Android: program unavailable -> ineligible (info text)', async () => {
      Platform.OS = 'android';
      mockExternalContentLink!.isExternalContentLinkAvailable.mockResolvedValue(
        false,
      );

      await runWriter();

      expect(assistantStore.isCheckoutEligible).toBe(false);
    });

    it('Android: null module -> ineligible (fail-closed)', async () => {
      Platform.OS = 'android';
      mockExternalContentLink = null;

      await runWriter();

      expect(isUSStorefront).not.toHaveBeenCalled();
      expect(assistantStore.isCheckoutEligible).toBe(false);
    });

    it('Android: probe throws -> ineligible (fail-closed, resets a stale true)', async () => {
      Platform.OS = 'android';
      // Pre-seed true so this guards the catch resetting the flag, not the default.
      (assistantStore as any).isCheckoutEligible = true;
      mockExternalContentLink!.isExternalContentLinkAvailable.mockRejectedValue(
        new Error('billing setup failed'),
      );
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await runWriter();

      expect(assistantStore.isCheckoutEligible).toBe(false);
      warnSpy.mockRestore();
    });

    it('E2E build: forces eligibility without probing the platform', async () => {
      Platform.OS = 'android';
      (global as any).__E2E__ = true;

      await runWriter();

      expect(assistantStore.isCheckoutEligible).toBe(true);
      expect(
        mockExternalContentLink!.isExternalContentLinkAvailable,
      ).not.toHaveBeenCalled();
      expect(isUSStorefront).not.toHaveBeenCalled();
    });

    it('iOS: keeps StoreKit storefront signal, never probes Play', async () => {
      Platform.OS = 'ios';
      (isUSStorefront as jest.Mock).mockResolvedValue(true);

      await runWriter();

      expect(isUSStorefront).toHaveBeenCalledTimes(1);
      expect(
        mockExternalContentLink!.isExternalContentLinkAvailable,
      ).not.toHaveBeenCalled();
      expect(assistantStore.isCheckoutEligible).toBe(true);
    });
  });

  describe('Pip seeding', () => {
    const callInitializePipAssistant = async () =>
      (assistantStore as any).initializePipAssistant();

    beforeEach(() => {
      runInAction(() => {
        assistantStore.assistants = [];
      });
      (assistantRepository.createAssistant as jest.Mock).mockImplementation(
        async (assistantData: any) => ({
          ...assistantData,
          id: `pip-${Math.random().toString(36).slice(2, 8)}`,
          created_at: '2026-05-26T00:00:00Z',
          updated_at: '2026-05-26T00:00:00Z',
        }),
      );
    });

    it('seeds Pip when absent', async () => {
      await callInitializePipAssistant();
      const pip = assistantStore.assistants.find(
        p => p.name === 'Pip' && p.source === 'local',
      );
      expect(pip).toBeDefined();
      expect(pip?.type).toBe('local');
      expect(pip?.defaultModel).toBeUndefined();
      expect(assistantRepository.createAssistant).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when Pip is already present', async () => {
      await callInitializePipAssistant();
      (assistantRepository.createAssistant as jest.Mock).mockClear();
      await callInitializePipAssistant();
      const pipCount = assistantStore.assistants.filter(
        p => p.name === 'Pip' && p.source === 'local',
      ).length;
      expect(pipCount).toBe(1);
      expect(assistantRepository.createAssistant).not.toHaveBeenCalled();
    });

    it('preserves an existing Pip record (including defaultModel) on re-init', async () => {
      const boundModel = {
        id: 'some-bound-model',
        name: 'Some Bound Model',
      } as any;
      const existingPip: Assistant = {
        ...mockAssistant,
        id: 'pip-existing',
        name: 'Pip',
        source: 'local',
        type: 'local',
        defaultModel: boundModel,
      } as any;
      runInAction(() => {
        assistantStore.assistants = [existingPip];
      });

      await callInitializePipAssistant();

      const pip = assistantStore.assistants.find(
        p => p.name === 'Pip' && p.source === 'local',
      );
      expect(pip).toBeDefined();
      expect(pip?.id).toBe('pip-existing');
      // defaultModel content is preserved across re-init (MobX wraps
      // observed objects in Proxies, so Object.is equality is brittle;
      // value equality verifies the field wasn't cleared or rewritten).
      expect(pip?.defaultModel).toEqual(boundModel);
      expect(assistantRepository.createAssistant).not.toHaveBeenCalled();
    });

    it('coexists with Lookie regardless of order (idempotent)', async () => {
      const lookie: Assistant = {
        ...mockAssistant,
        id: 'lookie-1',
        name: 'Lookie',
        source: 'local',
        type: 'local',
        capabilities: {video: true},
      } as any;
      runInAction(() => {
        assistantStore.assistants = [lookie];
      });

      await callInitializePipAssistant();
      await callInitializePipAssistant();

      const names = assistantStore.assistants.map(p => p.name).sort();
      expect(names).toEqual(['Lookie', 'Pip']);
    });
  });

  describe.each([
    ['Lookie', 'initializeLookieAssistant'],
    ['Pip', 'initializePipAssistant'],
  ])('%s seed persistence', (name, initializer) => {
    const seed = () => (assistantStore as any)[initializer]();

    beforeEach(() => {
      (assistantRepository.createAssistant as jest.Mock).mockImplementation(
        async (data: Partial<Assistant>) => ({...mockAssistant, ...data}),
      );
      (assistantRepository.deleteAssistant as jest.Mock).mockResolvedValue(true);
    });

    it('does not recreate a deleted default assistant on the next initialization', async () => {
      await seed();
      await assistantStore.deleteAssistant(assistantStore.assistants[0].id);
      expect(assistantStore.assistants).toHaveLength(0);
      (assistantRepository.createAssistant as jest.Mock).mockClear();

      await seed();

      expect(assistantRepository.createAssistant).not.toHaveBeenCalled();
      expect(assistantStore.assistants).toHaveLength(0);
    });

    it('does not recreate a default assistant after it is renamed', async () => {
      await seed();
      runInAction(() => {
        assistantStore.assistants[0].name = 'My renamed assistant';
      });
      (assistantRepository.createAssistant as jest.Mock).mockClear();

      await seed();

      expect(assistantRepository.createAssistant).not.toHaveBeenCalled();
      expect(assistantStore.assistants).toHaveLength(1);
      expect(assistantStore.assistants[0].name).toBe('My renamed assistant');
    });

    it('records existing default assistants before they are deleted', async () => {
      runInAction(() => {
        assistantStore.assistants = [{...mockAssistant, name, capabilities: {video: true}}];
      });
      await seed();
      expect(assistantRepository.createAssistant).not.toHaveBeenCalled();
      await assistantStore.deleteAssistant(mockAssistant.id);

      await seed();

      expect(assistantRepository.createAssistant).not.toHaveBeenCalled();
      expect(assistantStore.assistants).toHaveLength(0);
    });

    it('retries seeding after creation fails', async () => {
      (assistantRepository.createAssistant as jest.Mock).mockRejectedValueOnce(
        new Error('Database unavailable'),
      );
      await seed();
      expect(assistantStore.assistants).toHaveLength(0);

      await seed();

      expect(assistantRepository.createAssistant).toHaveBeenCalledTimes(2);
      expect(assistantStore.assistants[0].name).toBe(name);
    });
  });

  describe('Core CRUD Operations', () => {
    describe('createAssistant', () => {
      it('should create a new assistant successfully', async () => {
        const newAssistantData = {
          name: 'New Test Assistant',
          description: 'A new test assistant',
          systemPrompt: 'You are a helpful assistant.',
          originalSystemPrompt: 'You are a helpful assistant.',
          isSystemPromptChanged: false,
          useAIPrompt: false,
          parameters: {},
          parameterSchema: [],
          source: 'local' as const,
          type: 'local' as const,
        };

        const createdAssistant = {...newAssistantData, ...mockAssistant};
        (assistantRepository.createAssistant as jest.Mock).mockResolvedValue(createdAssistant);

        const result = await assistantStore.createAssistant(newAssistantData);

        expect(assistantRepository.createAssistant).toHaveBeenCalledWith(newAssistantData);
        expect(result).toEqual(createdAssistant);
        expect(assistantStore.assistants).toContainEqual(createdAssistant);
      });

      it('should handle creation errors', async () => {
        const error = new Error('Creation failed');
        (assistantRepository.createAssistant as jest.Mock).mockRejectedValue(error);

        const newAssistantData = {
          name: 'New Test Assistant',
          systemPrompt: 'You are a helpful assistant.',
          originalSystemPrompt: 'You are a helpful assistant.',
          isSystemPromptChanged: false,
          useAIPrompt: false,
          parameters: {},
          parameterSchema: [],
          source: 'local' as const,
          type: 'local' as const,
        };

        await expect(assistantStore.createAssistant(newAssistantData)).rejects.toThrow(
          'Creation failed',
        );
        expect(assistantStore.assistants).not.toContain(
          expect.objectContaining({name: 'New Test Assistant'}),
        );
      });
    });

    describe('updateAssistant', () => {
      beforeEach(() => {
        runInAction(() => {
          assistantStore.assistants = [mockAssistant];
        });
      });

      it('should update an existing assistant successfully', async () => {
        const updates = {
          name: 'Updated Assistant Name',
          description: 'Updated description',
        };
        const updatedAssistant = {
          ...mockAssistant,
          ...updates,
          updated_at: '2023-01-02T00:00:00Z',
        };

        (assistantRepository.updateAssistant as jest.Mock).mockResolvedValue(updatedAssistant);

        await assistantStore.updateAssistant(mockAssistant.id, updates);

        expect(assistantRepository.updateAssistant).toHaveBeenCalledWith(
          mockAssistant.id,
          updates,
        );
        expect(assistantStore.assistants[0]).toEqual(updatedAssistant);
      });

      it('should handle update errors', async () => {
        const error = new Error('Update failed');
        (assistantRepository.updateAssistant as jest.Mock).mockRejectedValue(error);

        await expect(
          assistantStore.updateAssistant(mockAssistant.id, {name: 'Updated'}),
        ).rejects.toThrow('Update failed');
      });

      it('should handle case when updated assistant is not returned', async () => {
        (assistantRepository.updateAssistant as jest.Mock).mockResolvedValue(null);

        await expect(
          assistantStore.updateAssistant(mockAssistant.id, {name: 'Updated'}),
        ).rejects.toThrow('Failed to update assistant - no updated assistant returned');
      });
    });

    describe('deleteAssistant', () => {
      beforeEach(() => {
        runInAction(() => {
          assistantStore.assistants = [mockAssistant];
        });
      });

      it('should delete a assistant successfully', async () => {
        (assistantRepository.deleteAssistant as jest.Mock).mockResolvedValue(true);
        (imageUtils.deleteAssistantThumbnail as jest.Mock).mockResolvedValue(
          undefined,
        );

        await assistantStore.deleteAssistant(mockAssistant.id);

        expect(assistantRepository.deleteAssistant).toHaveBeenCalledWith(mockAssistant.id);
        expect(assistantStore.assistants).not.toContain(mockAssistant);
      });

      it('should handle deletion errors gracefully', async () => {
        const error = new Error('Deletion failed');
        (assistantRepository.deleteAssistant as jest.Mock).mockRejectedValue(error);

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        // Should not throw, but should log error
        await assistantStore.deleteAssistant(mockAssistant.id);

        expect(consoleSpy).toHaveBeenCalledWith('Error deleting assistant:', error);
        expect(assistantStore.assistants).toContainEqual(mockAssistant); // Should still be there

        consoleSpy.mockRestore();
      });
    });
  });

  describe('Drshub Integration', () => {
    describe('searchDrshubAssistants', () => {
      it('should search assistants and update state', async () => {
        const mockResponse = {
          assistants: [mockDrshubAssistant],
          total_count: 1,
          page: 1,
          limit: 20,
          has_more: false,
        };

        (drshubService.getAssistants as jest.Mock).mockResolvedValue(mockResponse);

        expect(assistantStore.isLoadingDrshub).toBe(false);
        expect(assistantStore.syncState.status).toBe('idle');

        const result = await assistantStore.searchDrshubAssistants({query: 'test'});

        expect(drshubService.getAssistants).toHaveBeenCalledWith({query: 'test'});
        expect(result).toEqual(mockResponse);
        expect(assistantStore.cachedDrshubAssistants).toEqual(mockResponse.assistants);
        expect(assistantStore.isLoadingDrshub).toBe(false);
        expect(assistantStore.syncState.status).toBe('success');
      });

      it('should handle search errors gracefully', async () => {
        const error = new Error('Search failed');
        (drshubService.getAssistants as jest.Mock).mockRejectedValue(error);

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        // Should not throw, but return empty results
        const result = await assistantStore.searchDrshubAssistants();

        expect(result).toEqual({
          assistants: [],
          total_count: 0,
          page: 1,
          limit: 20,
          has_more: false,
        });
        expect(assistantStore.cachedDrshubAssistants).toEqual([]);
        expect(assistantStore.isLoadingDrshub).toBe(false);
        expect(assistantStore.syncState.status).toBe('success'); // Changed to success for graceful handling
        expect(consoleSpy).toHaveBeenCalledWith(
          'Drshub search failed (this is expected if not configured):',
          error,
        );

        consoleSpy.mockRestore();
      });
    });

    describe('loadUserLibrary', () => {
      it('should load user library and update state', async () => {
        const mockResponse = {
          assistants: [
            {
              ...mockDrshubAssistant,
              is_owned: true,
            },
          ],
          total_count: 1,
          page: 1,
          limit: 20,
          has_more: false,
        };

        (drshubService.getLibrary as jest.Mock).mockResolvedValue(mockResponse);

        const result = await assistantStore.loadUserLibrary();

        expect(drshubService.getLibrary).toHaveBeenCalled();
        expect(result).toEqual(mockResponse);
        expect(assistantStore.userLibrary).toEqual(mockResponse.assistants);
        expect(assistantStore.syncState.status).toBe('success');
      });

      it('should handle library loading errors gracefully', async () => {
        const error = new Error('Library load failed');
        (drshubService.getLibrary as jest.Mock).mockRejectedValue(error);

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        // Should not throw, but return empty results
        const result = await assistantStore.loadUserLibrary();

        expect(result).toEqual({
          assistants: [],
          total_count: 0,
          page: 1,
          limit: 20,
          has_more: false,
        });
        expect(assistantStore.userLibrary).toEqual([]);
        expect(assistantStore.syncState.status).toBe('success'); // Changed to success for graceful handling
        expect(consoleSpy).toHaveBeenCalledWith(
          'User library load failed (this is expected if not configured):',
          error,
        );

        consoleSpy.mockRestore();
      });
    });

    describe('helper methods', () => {
      it('should get categories', async () => {
        const mockCategories = {
          categories: [{id: '1', name: 'AI Assistant'}],
        };

        (drshubService.getCategories as jest.Mock).mockResolvedValue(
          mockCategories,
        );

        const result = await assistantStore.getCategories();

        expect(result).toEqual(mockCategories);
        expect(drshubService.getCategories).toHaveBeenCalled();
      });

      it('should get tags', async () => {
        const mockTags = {
          tags: [{id: '1', name: 'helpful'}],
        };

        (drshubService.getTags as jest.Mock).mockResolvedValue(mockTags);

        const result = await assistantStore.getTags({query: 'help'});

        expect(result).toEqual(mockTags);
        expect(drshubService.getTags).toHaveBeenCalledWith({query: 'help'});
      });

      it('should get specific assistant', async () => {
        const mockDrshubAssistantResponse = {
          ...mockDrshubAssistant,
          id: '1',
          title: 'Test Assistant',
          creator_id: 'user1',
        };

        (drshubService.getAssistant as jest.Mock).mockResolvedValue(
          mockDrshubAssistantResponse,
        );

        const result = await assistantStore.getDrshubAssistant('1');

        expect(result).toEqual(mockDrshubAssistantResponse);
        expect(drshubService.getAssistant).toHaveBeenCalledWith('1');
      });

      it('should check assistant ownership', async () => {
        const mockOwnership = {owned: true, purchase_date: '2023-01-01'};

        (drshubService.checkAssistantOwnership as jest.Mock).mockResolvedValue(
          mockOwnership,
        );

        const result = await assistantStore.checkAssistantOwnership('assistant-id');

        expect(result).toEqual(mockOwnership);
        expect(drshubService.checkAssistantOwnership).toHaveBeenCalledWith('assistant-id');
      });
    });

    describe('downloadDrshubAssistant', () => {
      it('should download assistant with provided information', async () => {
        const assistantToDownload: DrshubAssistant = {
          ...mockDrshubAssistant,
          id: 'assistant-to-download',
          title: 'Test Assistant',
          system_prompt:
            'You are a {{role}} assistant with {{expertise}} knowledge.',
          model_settings: {
            parameter_schema: [
              {
                key: 'role',
                type: 'text' as const,
                label: 'Role',
                required: true,
                placeholder: 'e.g., helpful, creative',
              },
            ],
            parameters: {
              role: 'helpful',
            },
            temperature: 0.7,
            max_tokens: 2048,
          },
        };

        const expectedLocalAssistant = {
          type: 'local',
          id: expect.any(String),
          name: 'Test Assistant',
          systemPrompt:
            'You are a {{role}} assistant with {{expertise}} knowledge.',
          source: 'drshub',
          drshub_id: 'assistant-to-download',
          rawDrshubGenerationSettings: assistantToDownload.model_settings,
        };

        // Mock the service calls
        (assistantRepository.createAssistant as jest.Mock).mockResolvedValue(
          expectedLocalAssistant,
        );
        (imageUtils.downloadAssistantThumbnail as jest.Mock).mockResolvedValue(
          '/path/to/thumbnail.jpg',
        );

        const result = await assistantStore.downloadDrshubAssistant(assistantToDownload);

        // Verify that the assistant was created with the provided information
        expect(assistantRepository.createAssistant).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Assistant',
            systemPrompt:
              'You are a {{role}} assistant with {{expertise}} knowledge.',
            rawDrshubGenerationSettings: assistantToDownload.model_settings,
            source: 'drshub',
            drshub_id: 'assistant-to-download',
          }),
        );

        expect(result).toEqual(expectedLocalAssistant);
        expect(assistantStore.assistants).toContainEqual(expectedLocalAssistant);
      });

      it('should handle premium assistant ownership check before downloading', async () => {
        const premiumAssistant: DrshubAssistant = {
          ...mockDrshubAssistant,
          id: 'premium-assistant-id',
          price_cents: 500, // Premium assistant
        };

        // Mock ownership check to return owned
        (drshubService.checkAssistantOwnership as jest.Mock).mockResolvedValue({
          owned: true,
        });
        (assistantRepository.createAssistant as jest.Mock).mockResolvedValue({
          ...premiumAssistant,
          type: 'local',
          id: 'local-id',
        });

        await assistantStore.downloadDrshubAssistant(premiumAssistant);

        // Verify ownership was checked
        expect(drshubService.checkAssistantOwnership).toHaveBeenCalledWith(
          'premium-assistant-id',
        );
      });

      it('should reject download for unowned premium assistant', async () => {
        const premiumAssistant: DrshubAssistant = {
          ...mockDrshubAssistant,
          id: 'premium-assistant-id',
          price_cents: 500, // Premium assistant
        };

        // Mock ownership check to return not owned
        (drshubService.checkAssistantOwnership as jest.Mock).mockResolvedValue({
          owned: false,
        });

        await expect(assistantStore.downloadDrshubAssistant(premiumAssistant)).rejects.toThrow(
          'You must own this Assistant to download it',
        );

        // Verify ownership was checked
        expect(drshubService.checkAssistantOwnership).toHaveBeenCalledWith(
          'premium-assistant-id',
        );
      });
    });

    describe('createLocalAssistantFromDrshub (via downloadDrshubAssistant)', () => {
      // Drive the private conversion through the public download entry point
      // and assert on the first argument of the assistantRepository.createAssistant mock.
      const buildDrshubAssistant = (overrides: Partial<DrshubAssistant>): DrshubAssistant => ({
        ...mockDrshubAssistant,
        id: 'conversion-test',
        ...overrides,
      });

      const getCreateAssistantArg = () =>
        (assistantRepository.createAssistant as jest.Mock).mock.calls[0][0];

      beforeEach(() => {
        (assistantRepository.createAssistant as jest.Mock).mockImplementation(
          async (data: any) => ({
            ...data,
            id: 'created-assistant-id',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          }),
        );
        (imageUtils.downloadAssistantThumbnail as jest.Mock).mockResolvedValue(
          '/path/to/thumb.jpg',
        );
      });

      it('happy path: maps pact + greeting with snake_case to camelCase rename', async () => {
        const drshubAssistant = buildDrshubAssistant({
          pact: {
            version: 1,
            talents: [
              {name: 'render_html', required: true},
              {name: 'calculate', required: false},
            ],
          },
          greeting: {
            text: 'Hi! Want me to sketch something?',
            suggested_prompts: ['Draw a sunset', 'Make a chart'],
          },
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.pact).toEqual({
          talents: [
            {name: 'render_html', necessity: 'required'},
            {name: 'calculate', necessity: 'optional'},
          ],
        });
        expect(arg.greeting).toEqual({
          text: 'Hi! Want me to sketch something?',
          suggestedPrompts: ['Draw a sunset', 'Make a chart'],
        });
      });

      it('legacy / both absent: pact and greeting are undefined', async () => {
        const drshubAssistant = buildDrshubAssistant({});
        // mockDrshubAssistant has no pact / greeting — older Drshub server shape.

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.pact).toBeUndefined();
        expect(arg.greeting).toBeUndefined();
      });

      it('unknown talent name is preserved (no registry validation)', async () => {
        const drshubAssistant = buildDrshubAssistant({
          pact: {
            version: 1,
            talents: [{name: 'web_search', required: true}],
          },
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.pact).toEqual({
          talents: [{name: 'web_search', necessity: 'required'}],
        });
      });

      it('strict-boolean coercion: only literal true maps to required', async () => {
        const drshubAssistant = buildDrshubAssistant({
          pact: {
            version: 1,
            talents: [
              {name: 'a', required: 'true' as any},
              {name: 'b', required: 1 as any},
              {name: 'c', required: true},
              {name: 'd', required: false},
              {name: 'e'},
              {name: 'f', required: null as any},
              {name: 'g', required: 0 as any},
              {name: 'h', required: '' as any},
              {name: 'i', required: 'false' as any},
              {name: 'j', required: {} as any},
            ],
          },
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.pact).toEqual({
          talents: [
            {name: 'a', necessity: 'optional'},
            {name: 'b', necessity: 'optional'},
            {name: 'c', necessity: 'required'},
            {name: 'd', necessity: 'optional'},
            {name: 'e', necessity: 'optional'},
            {name: 'f', necessity: 'optional'},
            {name: 'g', necessity: 'optional'},
            {name: 'h', necessity: 'optional'},
            {name: 'i', necessity: 'optional'},
            {name: 'j', necessity: 'optional'},
          ],
        });
      });

      it('drops pact.version at the conversion boundary', async () => {
        const drshubAssistant = buildDrshubAssistant({
          pact: {
            version: 1,
            talents: [{name: 'calculate'}],
          },
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.pact).not.toHaveProperty('version');
        expect(arg.pact).toEqual({
          talents: [{name: 'calculate', necessity: 'optional'}],
        });
      });

      it('empty talents array collapses to undefined', async () => {
        const drshubAssistant = buildDrshubAssistant({
          pact: {version: 1, talents: []},
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        expect(getCreateAssistantArg().pact).toBeUndefined();
      });

      it('pact with no talents key collapses to undefined', async () => {
        const drshubAssistant = buildDrshubAssistant({
          pact: {version: 1} as any,
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        expect(getCreateAssistantArg().pact).toBeUndefined();
      });

      it('pact: null collapses to undefined', async () => {
        const drshubAssistant = buildDrshubAssistant({
          pact: null as any,
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        expect(getCreateAssistantArg().pact).toBeUndefined();
      });

      it('greeting with only text: no suggestedPrompts key', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: {text: 'Hi'},
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.greeting).toEqual({text: 'Hi'});
        expect(arg.greeting).not.toHaveProperty('suggestedPrompts');
      });

      it('greeting with only prompts: text defaults to empty string', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: {suggested_prompts: ['a']},
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.greeting).toEqual({text: '', suggestedPrompts: ['a']});
      });

      it('greeting with text + empty prompts array: prompts key omitted', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: {text: 'Hi', suggested_prompts: []},
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.greeting).toEqual({text: 'Hi'});
        expect(arg.greeting).not.toHaveProperty('suggestedPrompts');
      });

      it('greeting all empty (text: "" + empty prompts): collapses to undefined', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: {text: '', suggested_prompts: []},
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        expect(getCreateAssistantArg().greeting).toBeUndefined();
      });

      it('greeting: null collapses to undefined', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: null as any,
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        expect(getCreateAssistantArg().greeting).toBeUndefined();
      });

      it('whitespace-only text passes through verbatim (no trim)', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: {text: '   '},
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.greeting).toEqual({text: '   '});
      });

      it('drops talent entries with missing or non-string name', async () => {
        const drshubAssistant = buildDrshubAssistant({
          pact: {
            version: 1,
            talents: [
              {name: 'render_html', required: true},
              {required: true} as any,
              {name: '', required: true} as any,
              {name: 42, required: true} as any,
              {name: null, required: true} as any,
            ],
          },
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.pact).toEqual({
          talents: [{name: 'render_html', necessity: 'required'}],
        });
      });

      it('drops non-object talent entries (null, string)', async () => {
        const drshubAssistant = buildDrshubAssistant({
          pact: {
            version: 1,
            talents: [
              {name: 'calculate', required: true},
              null as any,
              'render_html' as any,
              undefined as any,
            ],
          },
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.pact).toEqual({
          talents: [{name: 'calculate', necessity: 'required'}],
        });
      });

      it('pact collapses to undefined when all talent entries are invalid', async () => {
        const drshubAssistant = buildDrshubAssistant({
          pact: {
            version: 1,
            talents: [null as any, {required: true} as any, {name: ''} as any],
          },
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        expect(getCreateAssistantArg().pact).toBeUndefined();
      });

      it('drops non-array suggested_prompts (defends against payload drift)', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: {text: 'Hi', suggested_prompts: 'render_html' as any},
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.greeting).toEqual({text: 'Hi'});
        expect(arg.greeting).not.toHaveProperty('suggestedPrompts');
      });

      it('non-string text becomes empty string when prompts are present', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: {text: 42 as any, suggested_prompts: ['a']},
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.greeting).toEqual({text: '', suggestedPrompts: ['a']});
      });

      it('non-array suggested_prompts + non-string text together collapse greeting to undefined', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: {
            text: 42 as any,
            suggested_prompts: 'render_html' as any,
          },
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        expect(getCreateAssistantArg().greeting).toBeUndefined();
      });

      it('drops non-string and empty-string entries from suggested_prompts', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: {
            text: 'Hi',
            suggested_prompts: [
              'Draw a sunset',
              42 as any,
              null as any,
              '',
              'Make a chart',
            ],
          },
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.greeting).toEqual({
          text: 'Hi',
          suggestedPrompts: ['Draw a sunset', 'Make a chart'],
        });
      });

      it('collapses greeting when all suggested_prompts entries are invalid', async () => {
        const drshubAssistant = buildDrshubAssistant({
          greeting: {
            suggested_prompts: ['', null as any, 7 as any],
          },
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        expect(getCreateAssistantArg().greeting).toBeUndefined();
      });

      it('does not re-derive thumbnail_url or defaultModel from new server arrays', async () => {
        // Local conversion keeps reading the server-derived legacy singular
        // fields; the new arrays are not consumed.
        const drshubAssistant = buildDrshubAssistant({
          thumbnail_url: 'https://example.com/thumb.jpg',
          images: [
            {url: 'https://example.com/other.jpg', is_primary: true},
          ] as any,
          models: [
            {
              reference: {
                repo_id: 'other/repo',
                filename: 'other.gguf',
                author: 'other',
                downloadUrl: 'https://example.com/other.gguf',
                size: 1,
              },
              is_recommended: true,
            },
          ] as any,
        });

        await assistantStore.downloadDrshubAssistant(drshubAssistant);

        const arg = getCreateAssistantArg();
        expect(arg.thumbnail_url).toBe('/path/to/thumb.jpg');
        expect(arg.defaultModel).toBeUndefined();
        expect(arg).not.toHaveProperty('images');
        expect(arg).not.toHaveProperty('models');
      });
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      runInAction(() => {
        assistantStore.assistants = [
          mockAssistant,
          {
            ...mockAssistant,
            id: 'video-assistant',
            name: 'Video Assistant',
            capabilities: {video: true},
          },
          {
            ...mockAssistant,
            id: 'drshub-assistant',
            name: 'Drshub Assistant',
            source: 'drshub',
            drshub_id: 'ph-123',
          },
        ];
      });
    });

    it('should get video assistants', () => {
      const videoAssistants = assistantStore.getVideoAssistants();
      expect(videoAssistants).toHaveLength(1);
      expect(videoAssistants[0].id).toBe('video-assistant');
    });

    it('should get all assistants', () => {
      const allAssistants = assistantStore.getAllAssistants();
      expect(allAssistants).toHaveLength(3);
    });

    it('should check if Drshub assistant is downloaded', () => {
      expect(assistantStore.isDrshubAssistantDownloaded('ph-123')).toBe(true);
      expect(assistantStore.isDrshubAssistantDownloaded('ph-456')).toBe(false);
    });
  });
});
