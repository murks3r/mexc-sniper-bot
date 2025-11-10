"use client";

import { createBrowserClient } from "@supabase/ssr";
import {
  checkSupabaseConfiguration,
  createCookieHandlers,
  createFetchWithTimeout,
  isBrowserEnvironment,
} from "./supabase-browser-client-utils";

// Singleton pattern for browser Supabase client
let supabaseBrowserClient: ReturnType<typeof createBrowserClient> | null = null;
let isSupabaseConfigured = false;

/**
 * Initialize Supabase configuration check
 */
function ensureConfigurationChecked(): boolean {
  if (!isSupabaseConfigured && supabaseBrowserClient === null) {
    isSupabaseConfigured = checkSupabaseConfiguration();
  }
  return isSupabaseConfigured;
}

/**
 * Create Supabase client with configuration
 */
function createClientInstance() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookies: createCookieHandlers(),
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
    global: {
      fetch: createFetchWithTimeout(15000),
    },
  });
}

/**
 * Get or create a single Supabase browser client instance
 * This prevents the "Multiple GoTrueClient instances" error
 * Returns null if Supabase is not configured (graceful fallback)
 */
export function createSupabaseBrowserClient() {
  // Only create client in browser environment
  if (!isBrowserEnvironment()) {
    return null;
  }

  // Check configuration if not already checked
  if (!ensureConfigurationChecked()) {
    return null;
  }

  // Create client if not already created
  if (!supabaseBrowserClient) {
    try {
      supabaseBrowserClient = createClientInstance();

      // Only log in development to reduce console noise in production
      if (process.env.NODE_ENV === "development") {
        console.info("[Supabase] Browser client initialized successfully");
      }
    } catch (error) {
      console.error("[Supabase] Failed to initialize browser client:", error);
      supabaseBrowserClient = null;
      isSupabaseConfigured = false;
      return null;
    }
  }

  return supabaseBrowserClient;
}

/**
 * Get the browser client with safety checks
 */
export function getSupabaseBrowserClient() {
  try {
    return createSupabaseBrowserClient();
  } catch (error) {
    console.warn("[Supabase] Error getting browser client:", error);
    return null;
  }
}

/**
 * Check if Supabase is available and configured
 */
export function isSupabaseAvailable(): boolean {
  return isSupabaseConfigured && isBrowserEnvironment();
}

/**
 * Reset the client (useful for testing or configuration changes)
 */
export function resetSupabaseBrowserClient(): void {
  supabaseBrowserClient = null;
  isSupabaseConfigured = false;
}
