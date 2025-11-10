/**
 * Test Supabase Client Utilities
 *
 * Provides utilities for creating Supabase clients in test environments
 * with proper environment detection and configuration.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type TestMode = "mock" | "integration" | "e2e";

/**
 * Detect test mode based on environment variables
 */
export function detectTestMode(): TestMode {
  // Check if we're in mock mode (no real Supabase configured)
  const hasMockEnv =
    process.env.USE_MOCK_DATABASE === "true" ||
    process.env.FORCE_MOCK_DB === "true" ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("example");

  if (hasMockEnv) {
    return "mock";
  }

  // Check if we're in E2E mode (full app testing)
  if (process.env.E2E_TEST === "true" || process.env.PLAYWRIGHT_TEST === "true") {
    return "e2e";
  }

  // Default to integration mode (real Supabase test project)
  return "integration";
}

/**
 * Check if test environment is properly configured
 */
export function isTestEnvironmentConfigured(): {
  configured: boolean;
  missing: string[];
} {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  const optional = ["SUPABASE_SERVICE_ROLE_KEY"];

  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key] || process.env[key]?.includes("placeholder")) {
      missing.push(key);
    }
  }

  const mode = detectTestMode();

  // Service role key is required for integration/E2E tests
  if (
    mode !== "mock" &&
    (!process.env[optional[0]] || process.env[optional[0]]?.includes("placeholder"))
  ) {
    missing.push(optional[0]);
  }

  return {
    configured: missing.length === 0,
    missing,
  };
}

/**
 * Create Supabase client for tests
 * Automatically detects test mode and creates appropriate client
 */
export function createTestSupabaseClient(
  options: { useAdmin?: boolean; mode?: TestMode } = {},
): SupabaseClient {
  const { useAdmin = false, mode } = options;
  const testMode = mode || detectTestMode();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Supabase test environment variables not configured. Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  if (useAdmin && !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for admin client. Never use in production client code.",
    );
  }

  const key = useAdmin ? serviceRoleKey! : anonKey;

  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: testMode !== "mock",
      persistSession: testMode === "e2e",
      detectSessionInUrl: testMode === "e2e",
    },
  });
}

/**
 * Create Supabase server client for tests (Next.js SSR style)
 */
export function createTestSupabaseServerClient(
  options: {
    useAdmin?: boolean;
    cookies?: {
      get: (name: string) => string | undefined;
      set: (name: string, value: string, options?: unknown) => void;
      remove: (name: string, options?: unknown) => void;
    };
  } = {},
): SupabaseClient {
  const { useAdmin = false, cookies } = options;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Supabase test environment variables not configured. Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  if (useAdmin && !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for admin client. Never use in production client code.",
    );
  }

  const key = useAdmin ? serviceRoleKey! : anonKey;

  const cookieHandlers = cookies || {
    get: () => undefined,
    set: () => {},
    remove: () => {},
  };

  return createServerClient(supabaseUrl, key, {
    cookies: cookieHandlers,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get test Supabase URL
 */
export function getTestSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.includes("placeholder") || url.includes("example")) {
    throw new Error("Test Supabase URL not configured");
  }
  return url;
}

/**
 * Get test Supabase anon key
 */
export function getTestSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key || key.includes("placeholder") || key.includes("test-anon-key")) {
    throw new Error("Test Supabase anon key not configured");
  }
  return key;
}

/**
 * Get test Supabase service role key (admin)
 * WARNING: Only use in test environments
 */
export function getTestSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.includes("placeholder") || key.includes("test-service-role")) {
    throw new Error("Test Supabase service role key not configured");
  }
  return key;
}

/**
 * Validate test environment configuration
 * Throws if configuration is invalid
 */
export function validateTestEnvironment(): void {
  const { configured, missing } = isTestEnvironmentConfigured();

  if (!configured) {
    const mode = detectTestMode();
    if (mode !== "mock") {
      throw new Error(
        `Test environment not properly configured. Missing: ${missing.join(", ")}. ` +
          `Required for ${mode} mode.`,
      );
    }
  }
}
