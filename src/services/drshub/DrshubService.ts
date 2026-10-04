import {authService} from './AuthService';
import {drshubApiService} from './DrshubApiService';

import type {
  AssistantsQuery,
  LibraryQuery,
  TagsQuery,
  AssistantsResponse,
  LibraryResponse,
  CategoriesResponse,
  TagsResponse,
  DrshubAssistant,
} from '../../types/drshub';

export class DrshubError extends Error {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'DrshubError';
  }
}

class DrshubService {
  constructor() {}

  // Browse and search Assistants - Using REST API
  async getAssistants(
    query: AssistantsQuery = {},
  ): Promise<AssistantsResponse> {
    return drshubApiService.getAssistants(query);
  }

  // Get detailed Assistant information - Using REST API
  async getAssistant(id: string): Promise<DrshubAssistant> {
    return drshubApiService.getAssistant(id);
  }

  // Get user's library - Using REST API
  async getLibrary(query: LibraryQuery = {}): Promise<LibraryResponse> {
    return drshubApiService.getLibrary(query);
  }

  // Get user's created Assistants - Using REST API
  async getMyAssistants(query: LibraryQuery = {}): Promise<AssistantsResponse> {
    return drshubApiService.getMyAssistants(query);
  }

  // Advanced search
  async searchAssistants(query: AssistantsQuery): Promise<AssistantsResponse> {
    return this.getAssistants(query);
  }

  // Get all categories - Using REST API (extracted from assistants data)
  async getCategories(): Promise<CategoriesResponse> {
    return drshubApiService.getCategories();
  }

  // Get popular tags - Using REST API (extracted from assistants data)
  async getTags(query: TagsQuery = {}): Promise<TagsResponse> {
    return drshubApiService.getTags(query);
  }

  // Check if user owns a Assistant - Using REST API
  async checkAssistantOwnership(
    assistantId: string,
  ): Promise<{owned: boolean; purchase_date?: string}> {
    try {
      if (!authService.user?.id) {
        return {owned: false};
      }

      // Get assistant details which includes ownership information
      const assistant = await this.getAssistant(assistantId);

      return {
        owned: assistant.is_owned || false,
        purchase_date: undefined, // Purchase date not available in current API
      };
    } catch (error) {
      if (error instanceof DrshubError) {
        throw error;
      }
      throw new DrshubError(
        `Failed to check ownership: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}

export const drshubService = new DrshubService();
