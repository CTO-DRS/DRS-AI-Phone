import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL, SUPABASE_ANON_KEY} from '@env';

import {supabaseSecureStorage} from '../../api/supabaseSecureStorage';

// Check if Supabase is configured
const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// Create Supabase client only if properly configured
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Keychain-backed adapter (fix 2): sessions live in the device
        // Keychain (drs.supabase.* namespace, iOS THIS_DEVICE_ONLY) with a
        // read-through AsyncStorage fallback for pre-migration sessions —
        // see src/api/supabaseSecureStorage.ts + docs/audit-worklog.md.
        // migrateLegacySession() (App.tsx startup) formalizes the copy.
        storage: supabaseSecureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Helper function to get auth headers for API requests
export const getAuthHeaders = async () => {
  if (!supabase) {
    console.warn('Supabase not configured - returning empty auth headers');
    return {};
  }

  try {
    const {
      data: {session},
    } = await supabase.auth.getSession();

    return session?.access_token
      ? {Authorization: `Bearer ${session.access_token}`}
      : {};
  } catch (error) {
    console.warn('Failed to get auth headers:', error);
    return {};
  }
};

// Helper function to check if user is authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  if (!supabase) {
    return false;
  }

  try {
    const {
      data: {session},
    } = await supabase.auth.getSession();
    return !!session?.user;
  } catch (error) {
    console.warn('Failed to check authentication:', error);
    return false;
  }
};

// Helper function to get current user
export const getCurrentUser = async () => {
  if (!supabase) {
    return null;
  }

  try {
    const {
      data: {user},
    } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.warn('Failed to get current user:', error);
    return null;
  }
};
