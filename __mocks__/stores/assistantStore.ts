import type {
  Assistant,
  LegacyAssistantData,
} from '../../src/store/AssistantStore';
import {migrateLegacyAssistantToNew} from '../../src/utils/assistant-migration';

class MockAssistantStore {
  assistants: Assistant[] = [];
  isCheckoutEligible: boolean = false;

  constructor() {
    // makeAutoObservable(this);
  }

  addAssistant = jest.fn((data: LegacyAssistantData) => {
    const newAssistant = migrateLegacyAssistantToNew({
      id: 'mock-uuid-12345' + Math.random(),
      ...data,
    });
    this.assistants.push(newAssistant);
  });

  createAssistant = jest.fn(
    async (
      assistantData: Omit<Assistant, 'id' | 'created_at' | 'updated_at'>,
    ) => {
      const newAssistant: Assistant = {
        id: 'mock-uuid-' + Math.random(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...assistantData,
      };
      this.assistants.push(newAssistant);
      return newAssistant;
    },
  );

  updateAssistant = jest.fn((id: string, data: Partial<Assistant>) => {
    const assistantIndex = this.assistants.findIndex(p => p.id === id);
    if (assistantIndex !== -1) {
      const currentAssistant = this.assistants[assistantIndex];
      this.assistants[assistantIndex] = {
        ...currentAssistant,
        ...data,
        updated_at: new Date().toISOString(),
      } as Assistant;
    }
  });

  deleteAssistant = jest.fn((id: string) => {
    const assistantIndex = this.assistants.findIndex(p => p.id === id);
    if (assistantIndex !== -1) {
      this.assistants.splice(assistantIndex, 1);
    }
  });

  getAssistants = jest.fn(() => {
    return this.assistants;
  });

  getAllAssistants = jest.fn(() => this.assistants);

  // Capability-based methods
  getVideoAssistants = jest.fn(() =>
    this.assistants.filter(p => p.capabilities?.video === true),
  );

  getLocalAssistants = jest.fn(() =>
    this.assistants.filter(p => p.source === 'local' || !p.source),
  );
  getDownloadedDrshubAssistants = jest.fn(() =>
    this.assistants.filter(p => p.source === 'drshub'),
  );
  searchDrshubAssistants = jest.fn(async () => {});
  loadUserLibrary = jest.fn(async () => {});
  loadUserCreatedAssistants = jest.fn(async () => {});

  // Drshub-related methods
  isDrshubAssistantDownloaded = jest.fn(() => false);
  downloadDrshubAssistant = jest.fn(async () => {});
}

export const mockAssistantStore = new MockAssistantStore();
export const assistantStore = mockAssistantStore; // For compatibility
