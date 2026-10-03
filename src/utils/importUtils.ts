import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  isErrorWithCode,
  pick,
  types,
  errorCodes,
} from '@react-native-documents/picker';
import {Platform} from 'react-native';
import {v4 as uuidv4} from 'uuid';
import 'react-native-get-random-values';

import {chatSessionRepository} from '../repositories/ChatSessionRepository';
import {MessageType} from './types';
import {CompletionParams} from './completionTypes';
import {migrateCompletionSettings} from './completionSettingsVersions';
import {assistantStore} from '../store';
import type {Assistant, ParameterDefinition} from '../types/assistant';

/**
 * Interface for imported chat session data
 */
export interface ImportedChatSession {
  id: string;
  title: string;
  date: string;
  messages: ImportedMessage[];
  completionSettings: CompletionParams;
  activeAssistantId?: string;
}

/**
 * Interface for imported message data
 */
export interface ImportedMessage {
  id: string;
  author: string;
  text?: string;
  type: string;
  metadata?: Record<string, any>;
  createdAt?: number;
}

/**
 * Pick a JSON file using document picker
 */
export const pickJsonFile = async (): Promise<string | null> => {
  try {
    const res = await pick({
      type: Platform.OS === 'ios' ? 'public.json' : [types.allFiles],
    });

    if (res && res.length > 0) {
      const file = res[0];

      // Check if it's a JSON file
      if (
        !file.name?.toLowerCase().endsWith('.json') &&
        !file.type?.includes('json')
      ) {
        throw new Error('Selected file is not a JSON file');
      }

      return file.uri;
    }
    return null;
  } catch (err: any) {
    if (isErrorWithCode(err)) {
      switch (err.code) {
        case errorCodes.IN_PROGRESS:
          console.warn(
            'user attempted to present a picker, but a previous one was already presented',
          );
          break;
        case errorCodes.UNABLE_TO_OPEN_FILE_TYPE:
          throw new Error('unable to open file type');
        case errorCodes.OPERATION_CANCELED:
          // ignore
          return null;
        default:
          console.error(err);
          throw new Error('unknown error');
      }
    }
    throw err;
  }
};

/**
 * Read and parse a JSON file
 */
export const readJsonFile = async (fileUri: string): Promise<any> => {
  try {
    const fileContent = await RNFS.readFile(fileUri, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error reading or parsing JSON file:', error);
    throw new Error('Failed to read or parse the selected file');
  }
};

/**
 * Validate imported chat session data
 */
export const validateImportedData = (
  data: any,
): ImportedChatSession | ImportedChatSession[] => {
  // Check if it's an array or a single object
  if (Array.isArray(data)) {
    // Validate each session in the array
    return data.map(session => validateSingleSession(session));
  } else {
    // Validate a single session
    return validateSingleSession(data);
  }
};

/**
 * Validate a single chat session
 */
const validateSingleSession = (session: any): ImportedChatSession => {
  // Check required fields
  if (!session.title || typeof session.title !== 'string') {
    throw new Error('Invalid session: missing or invalid title');
  }

  if (!session.date || typeof session.date !== 'string') {
    // If date is missing, create a new one
    session.date = new Date().toISOString();
  }

  if (!session.messages || !Array.isArray(session.messages)) {
    session.messages = [];
  }

  // Validate messages
  session.messages = session.messages.map((msg: any) => {
    if (!msg.id) {
      msg.id = uuidv4();
    }

    if (!msg.author) {
      throw new Error('Invalid message: missing author');
    }

    if (!msg.type) {
      msg.type = 'text';
    }

    if (!msg.createdAt) {
      msg.createdAt = Date.now();
    }

    return msg;
  });

  // Ensure completionSettings exists
  if (!session.completionSettings) {
    session.completionSettings = {};
  }

  // Migrate completion settings to latest version
  session.completionSettings = migrateCompletionSettings(
    session.completionSettings,
  );

  // Generate a new ID if not present or to avoid conflicts
  if (!session.id) {
    session.id = uuidv4();
  }

  return session as ImportedChatSession;
};

/**
 * Import chat sessions from a JSON file
 */
export const importChatSessions = async (): Promise<number> => {
  try {
    // Pick a JSON file
    const fileUri = await pickJsonFile();
    if (!fileUri) {
      return 0; // User cancelled
    }

    // Read and parse the file
    const data = await readJsonFile(fileUri);

    // Validate the data
    const validatedData = validateImportedData(data);

    // Import the sessions
    if (Array.isArray(validatedData)) {
      // Import multiple sessions
      let importedCount = 0;
      for (const session of validatedData) {
        await importSingleSession(session);
        importedCount++;
      }
      return importedCount;
    } else {
      // Import a single session
      await importSingleSession(validatedData);
      return 1;
    }
  } catch (error) {
    console.error('Error importing chat sessions:', error);
    throw error;
  }
};

/**
 * Import a single chat session
 */
const importSingleSession = async (
  session: ImportedChatSession,
): Promise<void> => {
  try {
    // Map messages to the correct format
    const messages = session.messages.map(
      msg =>
        ({
          id: msg.id,
          author: {id: msg.author},
          text: msg.text || '',
          type: msg.type as any,
          metadata: msg.metadata || {},
          createdAt: msg.createdAt || Date.now(),
        }) as MessageType.Any,
    );

    // Create a new session in the database
    await chatSessionRepository.createSession(
      session.title,
      messages,
      session.completionSettings,
      session.activeAssistantId,
    );
  } catch (error) {
    console.error('Error importing single session:', error);
    throw error;
  }
};

/**
 * Interface (Data Transfer Object (DTO)) for imported assistant data (format v2.0)
 */
export interface ImportedAssistant {
  version: string;
  id: string;
  name: string;
  description?: string;
  thumbnail_url?: string;
  thumbnail_data?: string; // Base64 embedded image data
  systemPrompt: string;
  originalSystemPrompt?: string;
  isSystemPromptChanged: boolean;
  useAIPrompt: boolean;
  defaultModel?: any;
  promptGenerationModel?: any;
  generatingPrompt?: string;
  color?: [string, string];
  capabilities?: any;
  // Talent set + greeting; round-tripped from exportUtils since migration v7+
  // promoted them to first-class persisted state. Optional on read so legacy
  // exports without these fields still validate.
  pact?: Assistant['pact'];
  greeting?: Assistant['greeting'];
  parameters: Record<string, any>;
  parameterSchema: ParameterDefinition[];
  source: 'local' | 'drshub';
  drshub_id?: string;
  creator_info?: any;
  categories?: string[];
  tags?: string[];
  rating?: number;
  review_count?: number;
  protection_level?: string;
  price_cents?: number;
  is_owned?: boolean;
  generation_settings?: any;
  created_at?: string;
  updated_at?: string;
}

/**
 * Import assistants from a JSON file (single or multiple)
 */
export const importAssistants = async (): Promise<number> => {
  try {
    // Pick a JSON file
    const fileUri = await pickJsonFile();
    if (!fileUri) {
      return 0;
    }

    const data = await readJsonFile(fileUri);
    const validatedData = validateImportedAssistantData(data);

    if (Array.isArray(validatedData)) {
      let importedCount = 0;
      for (const assistant of validatedData) {
        await importSingleAssistant(assistant);
        importedCount++;
      }
      return importedCount;
    } else {
      await importSingleAssistant(validatedData);
      return 1;
    }
  } catch (error) {
    console.error('Error importing assistants:', error);
    throw error;
  }
};

/**
 * Validate imported assistant data (handles both legacy and modern formats)
 */
export const validateImportedAssistantData = (
  data: any,
): ImportedAssistant | ImportedAssistant[] => {
  // Check if it's an array or a single object
  if (Array.isArray(data)) {
    // Validate each assistant in the array
    return data.map(assistant => validateSingleAssistant(assistant));
  } else {
    // Validate a single assistant
    return validateSingleAssistant(data);
  }
};

/**
 * Validate a single assistant (modern format v2.0+ only)
 */
const validateSingleAssistant = (assistant: any): ImportedAssistant => {
  // Check required fields
  if (!assistant.name || typeof assistant.name !== 'string') {
    throw new Error('Import failed: Invalid assistant data');
  }

  if (!assistant.systemPrompt || typeof assistant.systemPrompt !== 'string') {
    throw new Error('Import failed: Invalid assistant data');
  }

  if (!assistant.version || !assistant.version.startsWith('2.')) {
    throw new Error('Import failed: Unsupported format');
  }

  if (typeof assistant.useAIPrompt !== 'boolean') {
    assistant.useAIPrompt = false;
  }

  if (typeof assistant.isSystemPromptChanged !== 'boolean') {
    assistant.isSystemPromptChanged = false;
  }

  if (!assistant.parameters || typeof assistant.parameters !== 'object') {
    assistant.parameters = {};
  }

  if (!assistant.parameterSchema || !Array.isArray(assistant.parameterSchema)) {
    assistant.parameterSchema = [];
  }

  if (!assistant.source) {
    assistant.source = 'local';
  }

  if (!assistant.id) {
    assistant.id = uuidv4();
  }

  return assistant as ImportedAssistant;
};

/**
 * Save base64 image data as a local file
 */
const saveBase64Image = async (
  base64Data: string,
  assistantId: string,
): Promise<string> => {
  // Extract extension and base64 content from data URL
  const extensionMatch = base64Data.match(/^data:image\/([a-z]+);base64,/);
  const fileExtension = extensionMatch ? extensionMatch[1] : 'jpg'; // Fallback to jpg
  const base64Content = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

  // Use same directory and naming convention as imageUtils.ts
  const ASSISTANT_IMAGES_DIR = `${RNFS.DocumentDirectoryPath}/assistant-images`;
  const fileName = `${assistantId}_thumbnail.${fileExtension}`;
  const filePath = `${ASSISTANT_IMAGES_DIR}/${fileName}`;

  // Ensure directory exists (same as imageUtils.ts)
  const exists = await RNFS.exists(ASSISTANT_IMAGES_DIR);
  if (!exists) {
    await RNFS.mkdir(ASSISTANT_IMAGES_DIR);
  }

  // Write base64 data to file
  await RNFS.writeFile(filePath, base64Content, 'base64');

  // Return filename for storage
  return fileName;
};

/**
 * Transform imported assistant to the format expected by assistantStore.createAssistant
 */
const transformImportAssistant = async (
  assistant: ImportedAssistant,
): Promise<Omit<Assistant, 'id' | 'created_at' | 'updated_at'>> => {
  // Handle thumbnail image - save base64 data as local file if present
  let thumbnailUrl = assistant.thumbnail_url;

  if (assistant.thumbnail_data) {
    try {
      // Generate new ID for this imported assistant to avoid conflicts
      const newAssistantId = uuidv4();
      thumbnailUrl = await saveBase64Image(assistant.thumbnail_data, newAssistantId);
    } catch (error) {
      console.warn('Failed to save imported thumbnail:', error);
      thumbnailUrl = undefined; // Fall back to no thumbnail
    }
  }

  return {
    type: 'local',
    name: assistant.name,
    description: assistant.description,
    thumbnail_url: thumbnailUrl,
    systemPrompt: assistant.systemPrompt,
    originalSystemPrompt: assistant.originalSystemPrompt,
    isSystemPromptChanged: assistant.isSystemPromptChanged,
    useAIPrompt: assistant.useAIPrompt,
    defaultModel: assistant.defaultModel,
    promptGenerationModel: assistant.promptGenerationModel,
    generatingPrompt: assistant.generatingPrompt,
    color: assistant.color,
    capabilities: assistant.capabilities || {},
    pact: assistant.pact,
    greeting: assistant.greeting,
    parameters: assistant.parameters,
    parameterSchema: assistant.parameterSchema,
    source: assistant.source,
    drshub_id: assistant.drshub_id,
    creator_info: assistant.creator_info,
    categories: assistant.categories,
    tags: assistant.tags,
    rating: assistant.rating,
    review_count: assistant.review_count,
    protection_level: assistant.protection_level as
      | 'public'
      | 'reveal_on_purchase'
      | 'private'
      | undefined,
    price_cents: assistant.price_cents,
    is_owned: assistant.is_owned,
    completionSettings: assistant.generation_settings,
  };
};

/**
 * Import a single assistant
 */
const importSingleAssistant = async (assistant: ImportedAssistant): Promise<void> => {
  try {
    const assistantData = await transformImportAssistant(assistant);

    await assistantStore.createAssistant(assistantData);
  } catch (error) {
    console.error('Error importing single assistant:', error);
    throw error;
  }
};
