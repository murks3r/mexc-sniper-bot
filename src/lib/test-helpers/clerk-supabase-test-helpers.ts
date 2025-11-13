/**
 * Clerk + Supabase Test Helpers
 *
 * Utilities for testing Supabase RLS policies with Clerk authentication.
 * Creates Supabase clients configured with Clerk tokens for RLS testing.
 */

import { createClerkClient } from "@clerk/backend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/src/lib/clerk-supabase-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

/**
 * Get Clerk client for test operations
 */
function _getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Clerk test environment variables not configured. Required: CLERK_SECRET_KEY");
  }
  return createClerkClient({ secretKey });
}

/**
 * Create a Supabase client with Clerk token for RLS testing
 * The token should be obtained from Clerk using the 'supabase' template
 *
 * Note: For real integration tests, you need to:
 * 1. Sign in the user via Clerk (creates session)
 * 2. Get token from session using session.getToken({ template: 'supabase' })
 * 3. Pass that token here
 *
 * For unit tests, you can pass a mock token.
 *
 * @param clerkUserId - Clerk user ID
 * @param clerkToken - Clerk JWT token (with 'supabase' template)
 * @returns Supabase client configured with Clerk token
 */
export async function createSupabaseClientWithClerkToken(
  clerkUserId: string,
  clerkToken?: string,
): Promise<SupabaseClient> {
  // For unit tests, create a mock token if not provided
  // In real integration tests, token should be obtained from Clerk session
  const token = clerkToken || `mock-clerk-token-${clerkUserId}`;

  // Create Supabase client with Clerk token
  // The token should contain the Clerk user ID in the 'sub' claim
  // Supabase RLS policies use auth.jwt()->>'sub' to get the user ID
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get test Supabase admin client (bypasses RLS)
 * Use for setup/teardown operations
 */
export function getTestSupabaseAdminClient(): SupabaseClient {
  return createAdminSupabaseClient();
}

/**
 * Get test Supabase anon client (no auth)
 * Use for testing unauthenticated access
 */
export function getTestSupabaseAnonClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
