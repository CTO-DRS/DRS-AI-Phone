import {authService} from './AuthService';
import {getAuthHeaders} from './supabase';
import {DRSHUB_API_BASE_URL} from '@env';
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

import {DrshubError} from './DrshubError';
import {DRS_HUB_WIRE} from './wireContract';
export {DrshubError};

// API Response types (matching the new API format)
interface ApiAssistantResponse {
  id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  price_cents: number;
  is_free: boolean;
  creator?: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
  categories: Array<{
    id: string;
    name: string;
    icon?: string;
  }>;
  tags: Array<{
    id: string;
    name: string;
  }>;
  stats: {
    rating: number | null;
    review_count: number;
  };
  is_owned: boolean;
  created_at: string;
  updated_at?: string;
  // Conditional fields for detailed assistant
  system_prompt?: string;
  model_reference?: {
    repo_id: string;
    filename: string;
    author: string;
    downloadUrl: string;
    size: number;
  };
  model_settings?: Record<string, any>;
  // Additional fields for user's created assistants
  approval_status?: 'pending' | 'approved' | 'rejected';
  analytics?: {
    total_sales: number;
    total_revenue_cents: number;
    total_users: number;
    conversion_rate: number;
  };
  // Additional field for library assistants
  protection_level?: 'public' | 'reveal_on_purchase' | 'private';
  purchased_at?: string;
  pact?: {
    version: number;
    talents: Array<{name: string; required?: boolean}>;
  };
  greeting?: {
    text?: string;
    suggested_prompts?: string[];
  };
  images?: unknown[];
  models?: unknown[];
}

interface ApiAssistantsResponse {
  assistants: ApiAssistantResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
  filters_applied: Record<string, any>;
}

interface ApiLibraryResponse {
  assistants: ApiAssistantResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
  filters_applied: {
    filter: string;
    sort: string;
  };
}

interface ApiMyAssistantsResponse {
  assistants: ApiAssistantResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
  filters_applied: {
    protection_level?: string;
    sort: string;
  };
  summary: {
    [DRS_HUB_WIRE.totalAssistantsField]: number;
    total_revenue_cents: number;
    total_sales: number;
    average_rating: number | null;
  };
}

// Checkout session request/response (POST /api/mobile/purchases)
export interface CheckoutSessionRequest {
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  checkout_url: string;
  session_url: string;
  session_id: string;
  purchase_id: string;
  platform_fee_cents: number;
}

// Status carried on DrshubError.details for checkout error mapping.
// 'already_owned' marks a 400 the caller treats as success.
export type CheckoutErrorStatus = 'already_owned' | 401 | 404 | 500 | 'network';

class DrshubApiService {
  private apiBase = DRSHUB_API_BASE_URL;

  constructor() {}

  private isConfigured(): boolean {
    return !!(this.apiBase && this.apiBase !== 'undefined');
  }

  // Get authentication headers using fresh session from Supabase
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const authHeaders = await getAuthHeaders();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Only add Authorization header if it exists
    if (authHeaders.Authorization) {
      headers.Authorization = authHeaders.Authorization;
    }

    return headers;
  }

  // Generic API request handler
  private async apiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new DrshubError(
        'Drshub API not configured - missing DRSHUB_API_BASE_URL',
      );
    }

    try {
      const headers = await this.getAuthHeaders();
      const url = `${this.apiBase}${endpoint}`;

      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
        }

        const errorMessage =
          errorData.error ||
          errorData.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        console.error(
          `API Error [${response.status}]:`,
          errorMessage,
          errorData,
        );

        throw new DrshubError(errorMessage, {
          status: response.status,
          statusText: response.statusText,
          ...errorData,
        });
      }

      return response.json();
    } catch (error) {
      if (error instanceof DrshubError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown network error';
      console.error('Network error:', errorMessage, error);

      throw new DrshubError(`Network error: ${errorMessage}`, error);
    }
  }

  // Transform API assistant response to internal format
  private transformApiAssistant(
    apiAssistant: ApiAssistantResponse,
  ): DrshubAssistant {
    return {
      type: 'drshub' as const,
      id: apiAssistant.id,
      creator_id: apiAssistant.creator?.id || '', // Handle missing creator
      title: apiAssistant.title,
      description: apiAssistant.description,
      thumbnail_url: apiAssistant.thumbnail_url,
      system_prompt: apiAssistant.system_prompt,
      model_reference: apiAssistant.model_reference,
      model_settings: apiAssistant.model_settings || {},
      protection_level: apiAssistant.protection_level || 'public',
      price_cents: apiAssistant.price_cents,
      allow_fork: true, // Default value, not provided by API
      created_at: apiAssistant.created_at,
      updated_at: apiAssistant.updated_at || apiAssistant.created_at,
      // Computed fields
      creator: apiAssistant.creator
        ? {
            id: apiAssistant.creator.id,
            display_name: apiAssistant.creator.display_name,
            avatar_url: apiAssistant.creator.avatar_url,
            provider: 'unknown', // Default value
            created_at: '', // Default value
            updated_at: '', // Default value
          }
        : {
            id: '',
            display_name: '',
            avatar_url: '',
            provider: 'unknown',
            created_at: '',
            updated_at: '',
          },
      categories: apiAssistant.categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        sort_order: 0, // Default value
        created_at: '', // Default value
      })),
      tags: apiAssistant.tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        usage_count: 0, // Default value
        created_at: '', // Default value
      })),
      average_rating: apiAssistant.stats.rating || undefined,
      review_count: apiAssistant.stats.review_count,
      is_owned: apiAssistant.is_owned,
      pact: apiAssistant.pact,
      greeting: apiAssistant.greeting,
      images: apiAssistant.images,
      models: apiAssistant.models,
    };
  }

  // Browse and search Assistants
  async getAssistants(
    query: AssistantsQuery = {},
  ): Promise<AssistantsResponse> {
    try {
      const params = new URLSearchParams();

      // Map query parameters to API format
      if (query.query) {
        params.set('q', query.query);
      }
      if (query.category_ids?.length) {
        params.set('category', query.category_ids[0]);
      }
      if (query.tag_names?.length) {
        params.set('tag', query.tag_names[0]);
      }
      if (query.price_min !== undefined) {
        params.set('price_min', query.price_min.toString());
      }
      if (query.price_max !== undefined) {
        params.set('price_max', query.price_max.toString());
      }
      if (query.sort_by) {
        // Map internal sort values to API format
        const sortMap: Record<string, string> = {
          newest: 'newest',
          oldest: 'oldest',
          rating: 'popular', // Map rating to popular
          popular: 'popular',
          price_low: 'price_low',
          price_high: 'price_high',
        };
        params.set('sort', sortMap[query.sort_by] || 'newest');
      }
      if (query.page) {
        params.set('page', query.page.toString());
      }
      if (query.limit) {
        params.set('limit', query.limit.toString());
      }

      const endpoint = `/api/mobile/assistants${
        params.toString() ? `?${params.toString()}` : ''
      }`;
      const response = await this.apiRequest<ApiAssistantsResponse>(endpoint);

      return {
        assistants: response.assistants.map(assistant =>
          this.transformApiAssistant(assistant),
        ),
        total_count: response.pagination.total,
        page: response.pagination.page,
        limit: response.pagination.limit,
        has_more: response.pagination.has_more,
      };
    } catch (error) {
      console.error('Failed to fetch assistants:', error);
      if (error instanceof DrshubError) {
        throw error;
      }
      throw new DrshubError(
        `Failed to fetch assistants: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  // Get detailed Assistant information
  async getAssistant(id: string): Promise<DrshubAssistant> {
    try {
      const response = await this.apiRequest<ApiAssistantResponse>(
        `/api/mobile/assistants/${id}`,
      );
      return this.transformApiAssistant(response);
    } catch (error) {
      if (error instanceof DrshubError) {
        throw error;
      }
      throw new DrshubError(
        `Failed to fetch assistant: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  // Create a Stripe-hosted checkout session for a premium assistant.
  // Reuses the existing Bearer auth path (no new token). 400 ("already
  // owned") is surfaced as a non-network error the caller treats as success.
  async createCheckoutSession(
    assistantId: string,
    {successUrl, cancelUrl}: CheckoutSessionRequest,
  ): Promise<CheckoutSession> {
    // Tax location is derived server-side from the billing address Stripe
    // collects at checkout; the app sends no country hint.
    const body: Record<string, string> = {
      [DRS_HUB_WIRE.assistantIdField]: assistantId,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    try {
      return await this.apiRequest<CheckoutSession>('/api/mobile/purchases', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (error instanceof DrshubError) {
        const details = error.details as
          | {status?: number; code?: string}
          | undefined;
        const status = details?.status;
        let errorStatus: CheckoutErrorStatus = 'network';
        if (status === 401 || status === 404 || status === 500) {
          errorStatus = status;
        } else if (
          status === 400 &&
          (details?.code === 'already_owned' ||
            /already own/i.test(error.message ?? ''))
        ) {
          // Only an explicit "already own" 400 is success; other 400s
          // (validation/contract errors) stay real checkout errors.
          errorStatus = 'already_owned';
        }
        throw new DrshubError(error.message, {status: errorStatus});
      }
      throw new DrshubError(
        `Failed to create checkout session: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        {status: 'network'},
      );
    }
  }

  // Get user's library
  async getLibrary(query: LibraryQuery = {}): Promise<LibraryResponse> {
    if (!authService.user?.id) {
      throw new DrshubError(
        'User not authenticated - please sign in to access your library',
      );
    }

    if (!authService.session?.access_token) {
      throw new DrshubError('No valid session - please sign in again');
    }

    try {
      const params = new URLSearchParams();

      if (query.page) {
        params.set('page', query.page.toString());
      }
      if (query.limit) {
        params.set('limit', query.limit.toString());
      }
      if (query.filter) {
        params.set('filter', query.filter);
      }
      if (query.sort_by) {
        params.set('sort', query.sort_by);
      }

      const endpoint = `/api/mobile/library${
        params.toString() ? `?${params.toString()}` : ''
      }`;
      const response = await this.apiRequest<ApiLibraryResponse>(endpoint);

      return {
        assistants: response.assistants.map(assistant =>
          this.transformApiAssistant(assistant),
        ),
        total_count: response.pagination.total,
        page: response.pagination.page,
        limit: response.pagination.limit,
        has_more: response.pagination.has_more,
      };
    } catch (error) {
      if (error instanceof DrshubError) {
        throw error;
      }
      throw new DrshubError(
        `Failed to load library: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  // Get user's created Assistants
  async getMyAssistants(query: LibraryQuery = {}): Promise<AssistantsResponse> {
    if (!authService.user?.id) {
      throw new DrshubError(
        'User not authenticated - please sign in to access your assistants',
      );
    }

    if (!authService.session?.access_token) {
      throw new DrshubError('No valid session - please sign in again');
    }

    try {
      const params = new URLSearchParams();

      if (query.page) {
        params.set('page', query.page.toString());
      }
      if (query.limit) {
        params.set('limit', query.limit.toString());
      }
      if (query.sort_by) {
        params.set('sort', query.sort_by);
      }

      const endpoint = `/api/mobile/my-assistants${
        params.toString() ? `?${params.toString()}` : ''
      }`;
      const response = await this.apiRequest<ApiMyAssistantsResponse>(endpoint);

      return {
        assistants: response.assistants.map(assistant =>
          this.transformApiAssistant(assistant),
        ),
        total_count: response.pagination.total,
        page: response.pagination.page,
        limit: response.pagination.limit,
        has_more: response.pagination.has_more,
      };
    } catch (error) {
      if (error instanceof DrshubError) {
        throw error;
      }
      throw new DrshubError(
        `Failed to load created assistants: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  // Advanced search (alias for getAssistants)
  async searchAssistants(query: AssistantsQuery): Promise<AssistantsResponse> {
    return this.getAssistants(query);
  }

  // Categories and tags are embedded in assistant responses, so these methods
  // extract unique values from cached data or make a simple assistants request
  async getCategories(): Promise<CategoriesResponse> {
    try {
      // Get a small sample of assistants to extract categories
      const response = await this.getAssistants({limit: 50});
      const categoriesMap = new Map();

      response.assistants.forEach(assistant => {
        assistant.categories?.forEach(category => {
          if (!categoriesMap.has(category.id)) {
            categoriesMap.set(category.id, category);
          }
        });
      });

      return {
        categories: Array.from(categoriesMap.values()),
      };
    } catch (error) {
      if (error instanceof DrshubError) {
        throw error;
      }
      throw new DrshubError(
        `Failed to fetch categories: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async getTags(query: TagsQuery = {}): Promise<TagsResponse> {
    try {
      // Get a larger sample of assistants to extract tags
      const response = await this.getAssistants({limit: query.limit || 50});
      const tagsMap = new Map();

      response.assistants.forEach(assistant => {
        assistant.tags?.forEach(tag => {
          if (!tagsMap.has(tag.id)) {
            tagsMap.set(tag.id, tag);
          }
        });
      });

      let tags = Array.from(tagsMap.values());

      // Apply search filter if provided
      if (query.query) {
        tags = tags.filter(tag =>
          tag.name.toLowerCase().includes(query.query!.toLowerCase()),
        );
      }

      return {tags};
    } catch (error) {
      if (error instanceof DrshubError) {
        throw error;
      }
      throw new DrshubError(
        `Failed to fetch tags: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}

export const drshubApiService = new DrshubApiService();
