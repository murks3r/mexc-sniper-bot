/**
 * Vitest Setup File
 * 
 * Initializes jsdom environment for React component and hook testing.
 * This file runs before all tests to ensure proper DOM and browser API setup.
 * 
 * Auth Testing Configuration:
 * - By default, tests run in "mock" mode with placeholder credentials
 * - Set USE_REAL_SUPABASE=true to run integration tests against real Supabase
 * - For integration tests, ensure NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   and SUPABASE_SERVICE_ROLE_KEY are set to a test Supabase project
 * - Never use production Supabase credentials in tests
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { detectTestMode, validateTestEnvironment, isTestEnvironmentConfigured } from "@/src/lib/test-helpers/test-supabase-client";

// Load test environment variables
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.test file for integration tests
config({ path: resolve(__dirname, ".env.test") });

// Detect test mode from environment
const useRealSupabase = process.env.USE_REAL_SUPABASE === "true";
const testMode = detectTestMode();

// Provide safe defaults so Vitest can run in isolation without real Supabase/Postgres
// Only set defaults if not using real Supabase
if (!useRealSupabase && testMode === "mock") {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  process.env.SUPABASE_URL ??= process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY ??= process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role";
  process.env.DATABASE_URL ??= "postgresql://local.mock/db";
  process.env.USE_MOCK_DATABASE ??= "true";
  process.env.FORCE_MOCK_DB ??= "true";
} else {
  // Set DATABASE_URL from environment if provided, otherwise try to construct from Supabase URL
  if (!process.env.DATABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Extract project ref from Supabase URL and construct DATABASE_URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (projectRef && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Use the provided DATABASE_URL if available, otherwise construct from env
      // Note: This is a fallback - prefer setting DATABASE_URL directly
      console.warn(`[Vitest Setup] DATABASE_URL not set, attempting to construct from Supabase URL`);
    }
  }
  
  // Validate real Supabase configuration
  const { configured, missing } = isTestEnvironmentConfigured();
  if (!configured) {
    console.warn(
      `[Vitest Setup] Test environment not fully configured. Missing: ${missing.join(", ")}. ` +
        `Tests requiring real Supabase may fail. Set USE_REAL_SUPABASE=true and configure all required env vars.`,
    );
  } else {
    console.log(`[Vitest Setup] Running in ${testMode} mode with real Supabase configuration`);
  }
}

// Log test mode for debugging
if (process.env.NODE_ENV === "test") {
  console.log(`[Vitest Setup] Test mode: ${testMode}`);
  console.log(`[Vitest Setup] USE_REAL_SUPABASE: ${useRealSupabase}`);
}

vi.mock("next/font/google", () => {
  return {
    Geist: () => ({ variable: "--font-geist-sans" }),
    Geist_Mono: () => ({ variable: "--font-geist-mono" }),
  };
});

// Ensure document is available - vitest's jsdom environment should provide this
// but we verify it exists before tests run
if (typeof document === "undefined") {
  throw new Error(
    "Document is not defined. Vitest jsdom environment may not be properly initialized.",
  );
}

// Validate test environment before running tests (only in integration/E2E mode)
if (testMode !== "mock") {
  beforeAll(() => {
    try {
      validateTestEnvironment();
    } catch (error) {
      console.warn(
        `[Vitest Setup] Test environment validation failed: ${error}. ` +
          `Some integration tests may fail. Set USE_MOCK_DATABASE=true to run in mock mode.`,
      );
    }
  });
}

// Cleanup after each test to prevent test pollution
afterEach(() => {
  cleanup();
});

