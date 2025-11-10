/**
 * Test Authentication Helpers
 *
 * Provides utilities for creating and managing test users in Supabase
 * for integration and E2E testing with real auth flows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

// Test configuration
const TEST_USER_PREFIX = "test_user_";
const TEST_USER_DOMAIN = "@example.com";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface AuthTestHelpers {
  createTestUser: (identifier?: string) => Promise<TestUser>;
  signInTestUser: (user: TestUser) => Promise<TestUser>;
  signOutTestUser: (user: TestUser) => Promise<void>;
  cleanupTestUser: (user: TestUser) => Promise<void>;
  getAuthenticatedClient: (user: TestUser) => SupabaseClient;
  createServiceClient: () => SupabaseClient;
}

/**
 * Creates authentication test helpers for the current Supabase project
 */
export function createAuthTestHelpers(): AuthTestHelpers {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables for test setup");
  }

  // Service client with admin privileges for user management
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  /**
   * Creates a new test user with deterministic email
   */
  async function createTestUser(identifier?: string): Promise<TestUser> {
    const timestamp = Date.now();
    const userId = identifier || `${timestamp}`;
    const email = `${TEST_USER_PREFIX}${userId}${TEST_USER_DOMAIN}`;
    const password = `TestPassword123!${userId}`;

    try {
      // Create user using admin API
      const {
        data: { user },
        error,
      } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email for tests
        user_metadata: {
          is_test_user: true,
          created_at: new Date().toISOString(),
        },
      });

      if (error || !user) {
        throw new Error(`Failed to create test user: ${error?.message || "Unknown error"}`);
      }

      console.log(`✅ Created test user: ${email} (ID: ${user.id})`);

      return {
        id: user.id,
        email,
        password,
      };
    } catch (error) {
      console.error("❌ Failed to create test user:", error);
      throw error;
    }
  }

  /**
   * Signs in a test user and returns auth tokens
   */
  async function signInTestUser(user: TestUser): Promise<TestUser> {
    const client = createClient(supabaseUrl, supabaseAnonKey);

    try {
      const {
        data: { session },
        error,
      } = await client.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });

      if (error || !session) {
        throw new Error(`Failed to sign in test user: ${error?.message || "Unknown error"}`);
      }

      console.log(`✅ Signed in test user: ${user.email}`);

      return {
        ...user,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at,
      };
    } catch (error) {
      console.error("❌ Failed to sign in test user:", error);
      throw error;
    }
  }

  /**
   * Signs out a test user
   */
  async function signOutTestUser(user: TestUser): Promise<void> {
    if (!user.accessToken) return;

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    try {
      // Set the session first
      await client.auth.setSession({
        access_token: user.accessToken,
        refresh_token: user.refresh_token || "",
      });

      // Then sign out
      await client.auth.signOut();
      console.log(`✅ Signed out test user: ${user.email}`);
    } catch (error) {
      console.warn("⚠️ Failed to sign out test user:", error);
    }
  }

  /**
   * Deletes a test user using admin privileges
   */
  async function cleanupTestUser(user: TestUser): Promise<void> {
    try {
      const { error } = await serviceClient.auth.admin.deleteUser(user.id);

      if (error) {
        console.warn(`⚠️ Failed to delete test user ${user.email}:`, error.message);
      } else {
        console.log(`✅ Deleted test user: ${user.email}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to cleanup test user ${user.email}:`, error);
    }
  }

  /**
   * Creates an authenticated Supabase client for a test user
   */
  function getAuthenticatedClient(user: TestUser): SupabaseClient {
    if (!user.accessToken) {
      throw new Error("User must be signed in to get authenticated client");
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    });
  }

  /**
   * Creates a service client with admin privileges
   */
  function createServiceClient(): SupabaseClient {
    return serviceClient;
  }

  return {
    createTestUser,
    signInTestUser,
    signOutTestUser,
    cleanupTestUser,
    getAuthenticatedClient,
    createServiceClient,
  };
}

/**
 * Default test user for quick testing
 */
export async function getDefaultTestUser(): Promise<TestUser> {
  const helpers = createAuthTestHelpers();

  // Try to sign in existing test user first
  const existingUser: TestUser = {
    id: "default",
    email: process.env.TEST_USER_EMAIL || `${TEST_USER_PREFIX}default${TEST_USER_DOMAIN}`,
    password: process.env.TEST_USER_PASSWORD || "TestPassword123!",
  };

  try {
    return await helpers.signInTestUser(existingUser);
  } catch (error) {
    // If sign in fails, create new user
    const newUser = await helpers.createTestUser("default");
    return await helpers.signInTestUser(newUser);
  }
}

/**
 * Cleanup function for test teardown
 */
export async function cleanupTestUsers(users: TestUser[]): Promise<void> {
  const helpers = createAuthTestHelpers();

  await Promise.all(users.map((user) => helpers.cleanupTestUser(user)));
}
