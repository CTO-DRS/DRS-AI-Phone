import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick} from '@react-native-documents/picker';
import {assistantStore} from '../../store';
import {
  readJsonFile,
  validateImportedData,
  ImportedChatSession,
  importAssistants,
} from '../importUtils';

describe('importUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readJsonFile', () => {
    it('should read and parse a JSON file successfully', async () => {
      // Setup
      const mockJsonData = '{"test":"data"}';
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(mockJsonData);

      // Execute
      const result = await readJsonFile('file:///mock/path/test.json');

      // Verify
      expect(RNFS.readFile).toHaveBeenCalled();
      expect(result).toEqual({test: 'data'});
    });
  });

  describe('validateImportedData', () => {
    it('should validate a single session correctly', () => {
      // Setup
      const mockSession = {
        id: 'test-id',
        title: 'Test Session',
        date: '2024-01-01T12:00:00.000Z',
        messages: [
          {
            id: 'msg1',
            author: 'user',
            text: 'Hello',
            type: 'text',
          },
        ],
        completionSettings: {
          temperature: 0.7,
        },
      };

      // Execute
      const result = validateImportedData(mockSession);

      // Verify
      expect(result).toEqual(mockSession);
    });

    it('should add missing fields with default values', () => {
      // Setup
      const incompleteSession = {
        title: 'Incomplete Session',
      };

      // Execute
      const result = validateImportedData(
        incompleteSession,
      ) as ImportedChatSession;

      // Verify
      expect(result.id).toMatch(/^mock-uuid-12345/); // UUID will have random component
      expect(result.date).toBeDefined();
      expect(result.messages).toEqual([]);
      expect(result.completionSettings).toBeDefined();
    });
  });

  describe('Assistant Import Functions', () => {
    const mockImportedAssistant = {
      version: '2.0',
      id: 'imported-assistant-1',
      name: 'Imported Assistant',
      description: 'An imported assistant',
      thumbnail_url: 'https://example.com/image.jpg',
      systemPrompt: 'You are a helpful assistant',
      originalSystemPrompt: 'You are a helpful assistant',
      isSystemPromptChanged: false,
      useAIPrompt: false,
      defaultModel: 'test-model',
    };

    const mockImportedAssistantWithBase64 = {
      ...mockImportedAssistant,
      thumbnail_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD',
      thumbnail_url: undefined,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);

      // Mock document picker to return a file
      (pick as jest.Mock).mockResolvedValue([
        {
          uri: 'file://path/to/assistants.json',
          name: 'assistants.json',
          type: 'application/json',
        },
      ]);
    });

    describe('importAssistants', () => {
      it('should return 0 when user cancels file picker', async () => {
        (pick as jest.Mock).mockResolvedValue(null);

        const result = await importAssistants();

        expect(result).toBe(0);
      });

      it('should handle file read errors', async () => {
        (RNFS.readFile as jest.Mock).mockRejectedValue(
          new Error('File read failed'),
        );

        await expect(importAssistants()).rejects.toThrow(
          'Failed to read or parse the selected file',
        );
      });

      it('should import assistant with remote thumbnail URL', async () => {
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify([mockImportedAssistant]),
        );

        const result = await importAssistants();

        expect(result).toBe(1); // Should return number of imported assistants
        // Note: We can't easily test the mock calls with the centralized mock
        // but we can verify the function returns the correct count
      });

      it('should import assistant with base64 thumbnail and save as local file', async () => {
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify([mockImportedAssistantWithBase64]),
        );

        const result = await importAssistants();

        expect(result).toBe(1);
        // Should create assistant-images directory
        expect(RNFS.mkdir).toHaveBeenCalledWith(
          expect.stringContaining('/assistant-images'),
        );

        // Should write base64 data to file
        expect(RNFS.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('_thumbnail.jpeg'),
          '/9j/4AAQSkZJRgABAQEAYABgAAD',
          'base64',
        );
      });

      it('should handle base64 thumbnail save errors gracefully', async () => {
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify([mockImportedAssistantWithBase64]),
        );
        (RNFS.writeFile as jest.Mock).mockRejectedValue(
          new Error('Write failed'),
        );

        const result = await importAssistants();

        expect(result).toBe(1);
        // Function should still succeed even if thumbnail save fails
      });

      it('should import multiple assistants', async () => {
        const multipleAssistants = [
          mockImportedAssistant,
          {
            ...mockImportedAssistant,
            id: 'imported-assistant-2',
            name: 'Second Assistant',
          },
        ];
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(multipleAssistants),
        );

        const result = await importAssistants();

        expect(result).toBe(2);
      });

      it('should handle single assistant import', async () => {
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(mockImportedAssistant),
        );

        const result = await importAssistants();

        expect(result).toBe(1);
      });

      // pact (talent set) and greeting are first-class persisted state.
      // The transform path MUST forward them onto assistantStore.createAssistant so a
      // re-imported Assistant keeps its tools and greeting.
      it('preserves pact (talents) and greeting through import', async () => {
        const assistantWithTalents = {
          ...mockImportedAssistant,
          pact: {
            talents: [
              {name: 'calculate'},
              {name: 'render_html', required: true},
            ],
          },
          greeting: {
            text: 'Hello! How can I help you today?',
            suggestedPrompts: ['Tell me a joke', 'Summarize this'],
          },
        };
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(assistantWithTalents),
        );

        await importAssistants();

        expect(assistantStore.createAssistant).toHaveBeenCalledTimes(1);
        const created = (assistantStore.createAssistant as jest.Mock).mock
          .calls[0][0];
        expect(created.pact).toEqual(assistantWithTalents.pact);
        expect(created.greeting).toEqual(assistantWithTalents.greeting);
      });
    });
  });
});
