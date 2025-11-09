"use client";

import { createBrowserClient } from "@supabase/ssr";

// Singleton pattern for browser Supabase client
let supabaseBrowserClient: ReturnType<typeof createBrowserClient> | null = null;
let isSupabaseConfigured = false;

/**
 * Check if Supabase is properly configured
 */
function checkSupabaseConfiguration(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Check for placeholder or missing values
  if (!supabaseUrl || !supabaseAnonKey) {
    return false;
  }

  // Check for placeholder values that indicate unconfigured environment
  const isPlaceholderUrl =
    supabaseUrl.includes("placeholder") || supabaseUrl === "https://placeholder.supabase.co";
  const isPlaceholderKey =
    supabaseAnonKey.includes("placeholder") || supabaseAnonKey === "placeholder_key";

  return !isPlaceholderUrl && !isPlaceholderKey;
}

/**
 * Get or create a single Supabase browser client instance
 * This prevents the "Multiple GoTrueClient instances" error
 * Returns null if Supabase is not configured (graceful fallback)
 */
export function createSupabaseBrowserClient() {
  // Only create client in browser environment
  if (typeof window === "undefined") {
    return null; // Return null in SSR instead of throwing
  }

  // Check if already determined configuration status
  if (!isSupabaseConfigured && supabaseBrowserClient === null) {
    isSupabaseConfigured = checkSupabaseConfiguration();

    if (!isSupabaseConfigured) {
      console.info("[Supabase] Environment not configured, auth features disabled");
      return null;
    }
  }

  if (!supabaseBrowserClient && isSupabaseConfigured) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    try {
      supabaseBrowserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          get(name: string) {
            if (typeof document === "undefined") return undefined;
            try {
              return document.cookie
                .split("; ")
                .find((row) => row.startsWith(`${name}=`))
                ?.split("=")[1];
            } catch (error) {
              console.warn("[Supabase] Cookie get error:", error);
              return undefined;
            }
          },
          set(name: string, value: string, options: any) {
            if (typeof document === "undefined") return;
            try {
              let cookieString = `${name}=${value}`;
              if (options?.maxAge) cookieString += `; max-age=${options.maxAge}`;
              if (options?.path) cookieString += `; path=${options.path}`;
              if (options?.domain) cookieString += `; domain=${options.domain}`;
              if (options?.secure) cookieString += "; secure";
              if (options?.httpOnly) cookieString += "; httponly";
              if (options?.sameSite) cookieString += `; samesite=${options.sameSite}`;
              document.cookie = cookieString;
            } catch (error) {
              console.warn("[Supabase] Cookie set error:", error);
            }
          },
          remove(name: string, options: any) {
            if (typeof document === "undefined") return;
            try {
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${options?.path || "/"}`;
            } catch (error) {
              console.warn("[Supabase] Cookie remove error:", error);
            }
          },
        },
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
        global: {
          fetch: (url, options = {}) => {
            // Add timeout and better error handling to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout (increased for slow networks)

            return fetch(url, {
              ...options,
              signal: controller.signal,
            })
              .finally(() => {
                clearTimeout(timeoutId);
              })
              .catch((error) => {
                if (error.name === "AbortError") {
                  const urlStr = typeof url === "string" ? url : url.toString();
                  console.warn("[Supabase] Request timeout after 15 seconds", {
                    url: urlStr.includes("auth") ? "auth endpoint" : urlStr,
                    note: "This may be normal if Supabase is unreachable or network is slow",
                  });
                  throw new Error("Request timeout after 15 seconds");
                }
                throw error;
              });
          },
        },
      });

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
  return isSupabaseConfigured && typeof window !== "undefined";
}

/**
 * Reset the client (useful for testing or configuration changes)
 */
export function resetSupabaseBrowserClient(): void {
  supabaseBrowserClient = null;
  isSupabaseConfigured = false;
}
