"use client";

/**
 * Cookie handling utilities for Supabase browser client
 */

export interface CookieOptions {
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
}

/**
 * Get cookie value by name
 */
export function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  try {
    return document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${name}=`))
      ?.split("=")[1];
  } catch {
    return undefined;
  }
}

/**
 * Set cookie with options
 */
export function setCookie(name: string, value: string, options?: CookieOptions): void {
  if (typeof document === "undefined") {
    return;
  }

  try {
    let cookieString = `${name}=${value}`;
    if (options?.maxAge) cookieString += `; max-age=${options.maxAge}`;
    if (options?.path) cookieString += `; path=${options.path}`;
    if (options?.domain) cookieString += `; domain=${options.domain}`;
    if (options?.secure) cookieString += "; secure";
    if (options?.httpOnly) cookieString += "; httponly";
    if (options?.sameSite) cookieString += `; samesite=${options.sameSite}`;
    document.cookie = cookieString;
  } catch {
    // Cookie set error - handled silently
  }
}

/**
 * Remove cookie
 */
export function removeCookie(name: string, options?: { path?: string }): void {
  if (typeof document === "undefined") {
    return;
  }

  try {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${options?.path || "/"}`;
  } catch {
    // Cookie remove error - handled silently
  }
}

/**
 * Create cookie handlers for Supabase client
 */
export function createCookieHandlers() {
  return {
    get: getCookie,
    set: setCookie,
    remove: removeCookie,
  };
}

/**
 * Check if Supabase environment variables are configured
 */
export function checkSupabaseConfiguration(): boolean {
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
 * Check if running in browser environment
 */
export function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined";
}

/**
 * Create fetch wrapper with timeout
 */
export function createFetchWithTimeout(timeoutMs: number = 15000) {
  return (url: RequestInfo | URL, options: RequestInit = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, {
      ...options,
      signal: controller.signal,
    })
      .finally(() => {
        clearTimeout(timeoutId);
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          throw new Error(`Request timeout after ${timeoutMs / 1000} seconds`);
        }
        throw error;
      });
  };
}
