// Drshub data types and interfaces

import {DRS_HUB_WIRE} from '../services/drshub/wireContract';

export interface DrshubProfile {
  id: string;
  email?: string;
  full_name?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  provider_user_id?: string;
  provider_profile_url?: string;
  provider: string;
  created_at: string;
  updated_at: string;
}

export interface DrshubCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sort_order: number;
  created_at: string;
}

export interface DrshubTag {
  id: string;
  name: string;
  usage_count: number;
  created_at: string;
}

export interface DrshubReview {
  id: string;
  /** Server wire name — see wireContract.ts */
  [DRS_HUB_WIRE.assistantIdField]: string;
  user_id: string;
  rating: number; // 1-5
  comment?: string;
  created_at: string;
  updated_at: string;

  // Joined data
  user?: DrshubProfile;
  reply?: DrshubReviewReply;
}

export interface DrshubReviewReply {
  id: string;
  review_id: string;
  creator_id: string;
  reply_text: string;
  created_at: string;
  updated_at: string;
}

export interface ModelReference {
  repo_id: string; // e.g., "MaziyarPanahi/gemma-3-1b-it-GGUF"
  filename: string; // e.g., "gemma-3-1b-it.Q8_0.gguf"
  author: string; // e.g., "MaziyarPanahi"
  downloadUrl: string; // Full download URL
  size: number; // Model storage size in bytes
}

/**
 * Drshub Assistant - A assistant from the Drshub marketplace
 *
 * This represents a assistant that exists on Drshub (remote) but has NOT been
 * downloaded to the device yet. These are shown in the marketplace/discovery
 * sections and can be downloaded to become local Assistants.
 *
 * Key differences from local Assistant:
 * - Uses 'title' instead of 'name'
 * - Uses 'system_prompt' instead of 'systemPrompt'
 * - May have restricted content based on protection_level and ownership
 * - Cannot be used directly - must be downloaded first
 *
 * Use the type discriminator `type: 'drshub'` to distinguish from Assistant.
 * Use type guards from `src/utils/assistant-type-guards.ts` for type-safe checks:
 * - isLocalAssistant(assistant) - returns true if assistant is a local Assistant
 * - isDrshubAssistant(assistant) - returns true if assistant is a DrshubAssistant
 */
export interface DrshubAssistant {
  // ============================================================================
  // TYPE DISCRIMINATOR - Use this to distinguish between Assistant and DrshubAssistant
  // ============================================================================
  /** Type discriminator - Always 'drshub' for remote Drshub assistants */
  type: 'drshub';

  // ============================================================================
  // CORE IDENTIFICATION
  // ============================================================================
  /** Unique identifier from Drshub database */
  id: string;
  /** User ID of the creator on Drshub */
  creator_id: string;
  /** Display name of the assistant (NOTE: called 'title' not 'name') */
  title: string;
  /** Optional description shown in marketplace */
  description?: string;
  /** Optional thumbnail image URL from Drshub */
  thumbnail_url?: string;

  // ============================================================================
  // AI CONFIGURATION
  // ============================================================================
  /**
   * System prompt template (NOTE: called 'system_prompt' not 'systemPrompt')
   * Only available for:
   * - Public assistants (protection_level === 'public')
   * - Owned assistants (is_owned === true)
   * Will be undefined for premium assistants that aren't owned
   */
  system_prompt?: string;

  // ============================================================================
  // MODEL SETTINGS
  // ============================================================================
  /** Reference to recommended model on Hugging Face */
  model_reference?: ModelReference;

  /** LLM generation settings (temperature, top_p, top_k, etc.) */
  model_settings?: Record<string, unknown>;

  // ============================================================================
  // ACCESS CONTROL
  // ============================================================================
  /**
   * Protection level determines content visibility:
   * - 'public': All content visible to everyone
   * - 'reveal_on_purchase': System prompt hidden until purchased
   * - 'private': Not visible in marketplace (shouldn't normally appear)
   */
  protection_level: 'public' | 'reveal_on_purchase' | 'private';

  /**
   * Price in cents (0 for free assistants)
   * Free assistants can be downloaded immediately
   * Premium assistants require purchase first
   */
  price_cents: number;

  /** Whether users can fork/copy this assistant. This is not used yet. */
  allow_fork: boolean;

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================
  /** When this assistant was created on Drshub */
  created_at: string;
  /** When this assistant was last updated on Drshub */
  updated_at: string;

  // ============================================================================
  // Metadata
  // ============================================================================
  /** Creator profile information */
  creator?: DrshubProfile;
  /** Categories this assistant belongs to */
  categories?: DrshubCategory[];
  /** Tags associated with this assistant */
  tags?: DrshubTag[];
  /** Average rating from user reviews */
  average_rating?: number;
  /** Total number of reviews */
  review_count?: number;
  /** Whether the current user owns this assistant (for premium assistants) */
  is_owned?: boolean;

  // ============================================================================
  // PACT (Assistant Action & Capability Treaty) — wire shape, snake_case
  // ============================================================================
  /**
   * Optional PACT declaration carried from Drshub. The wire shape uses
   * snake_case (`required`) and includes a `version` integer. The local
   * `Assistant.pact` shape uses `necessity: 'required' | 'optional'` and has no
   * `version` field; the conversion happens once inside
   * `AssistantStore.createLocalAssistantFromDrshub` (the single conversion site).
   */
  pact?: {
    version: number;
    talents: Array<{name: string; required?: boolean}>;
  };

  // ============================================================================
  // GREETING — wire shape, snake_case
  // ============================================================================
  /**
   * Optional greeting carried from Drshub. `suggested_prompts` (snake_case)
   * is renamed to `suggestedPrompts` (camelCase) at the conversion boundary.
   */
  greeting?: {
    text?: string;
    suggested_prompts?: string[];
  };

  // ============================================================================
  // PASS-THROUGH ARRAYS — not consumed by the client today
  // ============================================================================
  /**
   * Server-side image array. The server derives `thumbnail_url` from
   * `images[].is_primary`; the client reads only `thumbnail_url`. Typed as
   * `unknown[]` until a concrete consumer arrives.
   */
  images?: unknown[];
  /**
   * Server-side model array. The server derives `model_reference` from
   * `models[].is_recommended`; the client reads only `model_reference`. Typed
   * as `unknown[]` until a concrete consumer arrives.
   */
  models?: unknown[];
}

export interface DrshubUserAssistant {
  id: string;
  user_id: string;
  /** Server wire name — see wireContract.ts */
  [DRS_HUB_WIRE.assistantIdField]: string;
  purchased_at: string;
  purchase_id?: string;
  created_at: string;

  // Joined data
  assistant?: DrshubAssistant;
}

// API Query interfaces
export interface AssistantsQuery {
  query?: string; // Text search
  category_ids?: string[]; // Filter by categories
  tag_names?: string[]; // Filter by tags
  protection_level?: 'public' | 'reveal_on_purchase' | 'private';
  price_min?: number; // Minimum price in cents
  price_max?: number; // Maximum price in cents
  sort_by?:
    | 'newest'
    | 'oldest'
    | 'rating'
    | 'popular'
    | 'price_low'
    | 'price_high';
  page?: number; // Page number (default: 1)
  limit?: number; // Items per page (default: 20, max: 50)
}

export interface LibraryQuery {
  page?: number;
  limit?: number;
  filter?: 'all' | 'free' | 'purchased';
  sort_by?: 'newest' | 'oldest' | 'title' | 'price';
}

export interface TagsQuery {
  limit?: number; // Default: 50, Max: 100
  query?: string; // Search tags by name
}

// API Response interfaces
export interface AssistantsResponse {
  assistants: DrshubAssistant[];
  total_count: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface LibraryResponse {
  assistants: DrshubAssistant[]; // Processed assistants
  total_count: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface CategoriesResponse {
  categories: DrshubCategory[];
}

export interface TagsResponse {
  tags: DrshubTag[];
}

// Request interfaces
export interface CreateAssistantRequest {
  title: string; // 3-100 characters
  description?: string; // Max 1000 characters
  system_prompt: string; // Required
  model_reference?: ModelReference;
  model_settings: Record<string, unknown>;
  protection_level: 'public' | 'reveal_on_purchase' | 'private';
  price_cents: number; // >= 0
  allow_fork: boolean;
  category_ids?: string[];
  tag_names?: string[];
  thumbnail_url?: string;
}

export interface CreateReviewRequest {
  /** Server wire name — see wireContract.ts */
  [DRS_HUB_WIRE.assistantIdField]: string;
  rating: number; // 1-5
  comment?: string; // Max 2000 characters
}

export interface CreatePurchaseRequest {
  /** Server wire name — see wireContract.ts */
  [DRS_HUB_WIRE.assistantIdField]: string;
}

export interface PurchaseResponse {
  checkout_url: string; // Stripe checkout URL
  purchase_id: string;
}

// Error response interface
export interface DrshubErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

// Sync status types
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

export interface SyncState {
  status: SyncStatus;
  lastSync?: number;
  error?: string;
}

// Search filters for UI
export interface SearchFilters {
  query?: string;
  categories?: string[];
  tags?: string[];
  priceRange?: [number, number];
  protectionLevel?: 'public' | 'reveal_on_purchase' | 'private';
  sortBy?:
    | 'newest'
    | 'oldest'
    | 'rating'
    | 'popular'
    | 'price_low'
    | 'price_high';
  limit?: number; // Items per page (default: 20, max: 50)
}

// Local cache metadata
export interface CacheMetadata {
  lastUpdated: number;
  version: string;
  expiresAt?: number;
}

// Download status for owned Assistants
export interface DownloadStatus {
  isDownloaded: boolean;
  downloadPath?: string;
  downloadedAt?: number;
  fileSize?: number;
}

// Enhanced local Assistant type that combines local and Drshub data
export interface EnhancedAssistantData {
  // Drshub integration fields
  drshub_id?: string; // Link to Drshub assistant
  source: 'local' | 'drshub'; // Origin of the assistant
  generation_settings?: Record<string, unknown>; // Model parameters

  // Drshub metadata (for synced assistants)
  creator_info?: {
    id: string;
    name?: string;
    avatar_url?: string;
  };
  categories?: string[];
  tags?: string[];
  rating?: number;
  review_count?: number;
  protection_level?: 'public' | 'reveal_on_purchase' | 'private';
  price_cents?: number;
  is_owned?: boolean;

  // Download and sync status
  download_status?: DownloadStatus;
  sync_status?: SyncState;
  cache_metadata?: CacheMetadata;
}

// API Configuration
export interface ApiConfig {
  baseUrl: string;
  timeout?: number;
}

// API Error types
export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
  status?: number;
}
