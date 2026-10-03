import {authService} from './AuthService';
import {drshubApiService} from './DrshubApiService';

import type {
  PalsQuery,
  LibraryQuery,
  TagsQuery,
  PalsResponse,
  LibraryResponse,
  CategoriesResponse,
  TagsResponse,
  DrshubPal,
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

  // Browse and search Pals - Using REST API
  async getPals(query: PalsQuery = {}): Promise<PalsResponse> {
    return drshubApiService.getPals(query);
  }

  // Get detailed Pal information - Using REST API
  async getPal(id: string): Promise<DrshubPal> {
    return drshubApiService.getPal(id);
  }

  // Get user's library - Using REST API
  async getLibrary(query: LibraryQuery = {}): Promise<LibraryResponse> {
    return drshubApiService.getLibrary(query);
  }

  // Get user's created Pals - Using REST API
  async getMyPals(query: LibraryQuery = {}): Promise<PalsResponse> {
    return drshubApiService.getMyPals(query);
  }

  // Advanced search
  async searchPals(query: PalsQuery): Promise<PalsResponse> {
    return this.getPals(query);
  }

  // Get all categories - Using REST API (extracted from pals data)
  async getCategories(): Promise<CategoriesResponse> {
    return drshubApiService.getCategories();
  }

  // Get popular tags - Using REST API (extracted from pals data)
  async getTags(query: TagsQuery = {}): Promise<TagsResponse> {
    return drshubApiService.getTags(query);
  }

  // Check if user owns a Pal - Using REST API
  async checkPalOwnership(
    palId: string,
  ): Promise<{owned: boolean; purchase_date?: string}> {
    try {
      if (!authService.user?.id) {
        return {owned: false};
      }

      // Get pal details which includes ownership information
      const pal = await this.getPal(palId);

      return {
        owned: pal.is_owned || false,
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
