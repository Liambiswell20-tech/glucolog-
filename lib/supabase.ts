import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { LargeSecureStore } from '../src/services/authStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Supabase client singleton.
 *
 * - Uses LargeSecureStore adapter for encrypted session persistence
 *   (AES key in expo-secure-store, encrypted data in AsyncStorage).
 * - autoRefreshToken: keeps the session alive without user re-login.
 * - persistSession: survives app restarts via the storage adapter.
 * - detectSessionInUrl: MUST be false — React Native has no browser URL
 *   to parse; leaving it true causes warnings on every app launch.
 *
 * NEVER use crypto.randomUUID() anywhere — IDs come from Postgres
 * gen_random_uuid() or the existing generateId() in storage.ts.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
