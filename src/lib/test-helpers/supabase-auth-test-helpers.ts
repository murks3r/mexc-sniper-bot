/**
 * Supabase Auth Test Helpers
 *
 * Comprehensive utilities for testing Supabase authentication in unit and integration tests.
 * Provides functions to create test users, sign in, create authenticated requests, and cleanup.
 *
 * Security Notes:
 * - Never use service_role key in client-side code or public repos
 * - Use service_role only in secure CI or server test setup
 * - Always clean up test users after tests
 * - Use deterministic test user emails for easier debugging
 */

import { createClient, type Session, type User } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/src/db";
import { user as userSchema } from "@/src/db/schemas/auth";
import type { SupabaseUser } from "@/src/lib/supabase-auth";
import { withRateLimitHandling } from "@/src/lib/supabase-rate-limit-handler";

// Helper to create Request-compatible object for tests
// In test environment, NextRequest may not be available, so we use Request
function createRequestForTest(
  url: string,
  headers: Headers,
  options: RequestInit = {},
): Request | NextRequest {
  // Try to use NextRequest if available (server environment)
  // Otherwise fall back to standard Request (test environment)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextRequest: NextRequestClass } = require("next/server");
    return new NextRequestClass(url, {
      ...options,
      headers,
    });
  } catch {
    // Fallback to standard Request for test environment
    return new Request(url, {
      ...options,
      headers,
    }) as unknown as NextRequest;
  }
}

export interface TestUserOptions {
  email?: string;
  password?: string;
  name?: string;
  emailVerified?: boolean;
  userMetadata?: Record<string, unknown>;
  customClaims?: {
    tenant_id?: string;
    role?: string;
    [key: string]: unknown;
  };
}

export interface TestSession {
  session: Session;
  user: User;
  accessToken: string;
  supabaseUser: SupabaseUser;
}

/**
 * Get Supabase admin client for test operations
 * Uses service_role key - ONLY for test environments
 */
export function getTestSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase test environment variables not configured. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get Supabase anon client for test operations
 */
export function getTestSupabaseAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Supabase test environment variables not configured. Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(supabaseUrl, anonKey);
}

/**
 * Sleep utility for delays between operations
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: any): boolean {
  if (!error) return false;
  const message = error.message || String(error);
  return (
    message.includes("rate limit") ||
    message.includes("Rate limit") ||
    message.includes("RATE_LIMIT") ||
    error.code === "rate_limit_exceeded" ||
    error.status === 429 ||
    (error as any).isRateLimit === true
  );
}

/**
 * Handle rate limit errors gracefully in tests
 * Returns true if error was handled (rate limit), false otherwise
 */
export function handleRateLimitError(error: any): boolean {
  if (isRateLimitError(error)) {
    console.warn(
      `[TestHelper] Rate limit detected - this is expected with Supabase free tier. Error: ${error.message}`,
    );
    return true;
  }
  return false;
}

/**
 * Track last user creation time to add delays between operations
 */
let lastUserCreationTime = 0;
const MIN_DELAY_BETWEEN_USERS = 500; // 500ms minimum delay between user creations

/**
 * Create a test user via Admin API with retry logic and rate limit handling
 * Uses service_role key - ONLY for test environments
 */
export async function createTestUser(
  options: TestUserOptions = {},
): Promise<{ user: User; password: string }> {
  const {
    email = `test_user_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`,
    password = `TestPassword${Date.now()}!`,
    name = "Test User",
    emailVerified = true,
    userMetadata = {},
    customClaims = {},
  } = options;

  // Add delay between user creation operations to avoid rate limiting
  const now = Date.now();
  const timeSinceLastCreation = now - lastUserCreationTime;
  if (timeSinceLastCreation < MIN_DELAY_BETWEEN_USERS) {
    await sleep(MIN_DELAY_BETWEEN_USERS - timeSinceLastCreation);
  }

  const supabaseAdmin = getTestSupabaseAdminClient();

  // Use rate limit handling with retry logic
  const userData = await withRateLimitHandling(
    async () => {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: emailVerified,
        user_metadata: {
          name,
          full_name: name,
          ...userMetadata,
        },
        app_metadata: {
          ...customClaims,
        },
      });

      if (error) {
        throw new Error(`Failed to create test user: ${error.message}`);
      }

      if (!data.user) {
        throw new Error("Failed to create test user: No user data returned");
      }

      return data;
    },
    {
      maxRetries: 3,
      config: {
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        enableJitter: true,
      },
      onRateLimit: (rateLimitInfo) => {
        console.warn(`[TestHelper] Rate limit detected during user creation:`, rateLimitInfo);
      },
      onRetry: (attempt, delay) => {
        console.info(`[TestHelper] Retrying user creation (attempt ${attempt}) after ${delay}ms`);
      },
    },
  );

  lastUserCreationTime = Date.now();

  return {
    user: userData.user,
    password,
  };
}

/**
 * Sign in a test user and return session with JWT
 * Includes retry logic with exponential backoff for rate limiting
 */
export async function signInTestUser(email: string, password: string): Promise<TestSession> {
  const supabase = getTestSupabaseAnonClient();

  // Use rate limit handling with retry logic
  const authData = await withRateLimitHandling(
    async () => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(`Failed to sign in test user: ${error.message}`);
      }

      if (!data.session || !data.user) {
        throw new Error("Failed to sign in test user: No session or user data returned");
      }

      return data;
    },
    {
      maxRetries: 3,
      config: {
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        enableJitter: true,
      },
      onRateLimit: (rateLimitInfo) => {
        console.warn(`[TestHelper] Rate limit detected during sign in:`, rateLimitInfo);
      },
      onRetry: (attempt, delay) => {
        console.info(`[TestHelper] Retrying sign in (attempt ${attempt}) after ${delay}ms`);
      },
    },
  );

  const supabaseUser: SupabaseUser = {
    id: authData.user.id,
    email: authData.user.email ?? email,
    name:
      authData.user.user_metadata?.full_name ||
      authData.user.user_metadata?.name ||
      email.split("@")[0],
    username: authData.user.user_metadata?.username,
    picture: authData.user.user_metadata?.picture || authData.user.user_metadata?.avatar_url,
    emailVerified: !!authData.user.email_confirmed_at,
  };

  return {
    session: authData.session,
    user: authData.user,
    accessToken: authData.session.access_token,
    supabaseUser,
  };
}

/**
 * Create a test user and sign them in
 * Convenience function that combines createTestUser and signInTestUser
 * Includes delay between creation and sign-in to avoid rate limiting
 */
export async function createAndSignInTestUser(
  options: TestUserOptions = {},
): Promise<TestSession & { password: string }> {
  const { user, password } = await createTestUser(options);

  // Add small delay between user creation and sign-in to avoid rate limiting
  await sleep(300);

  const session = await signInTestUser(user.email!, password);

  return {
    ...session,
    password,
  };
}

/**
 * Create an authenticated NextRequest with Authorization header
 * Works in both test and server environments
 */
export function createAuthenticatedRequest(
  url: string,
  accessToken: string,
  options: RequestInit = {},
): NextRequest {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return createRequestForTest(url, headers, options) as NextRequest;
}

/**
 * Create a test session object (for mocking)
 */
export function createTestSession(overrides: Partial<TestSession> = {}): TestSession {
  const userId = overrides.user?.id || `test-user-${Date.now()}`;
  const email = overrides.user?.email || `test-${userId}@example.com`;
  const accessToken = overrides.accessToken || `mock-access-token-${Date.now()}`;

  const mockUser: User = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: new Date().toISOString(),
    phone: "",
    confirmation_sent_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {
      name: "Test User",
      full_name: "Test User",
    },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides.user,
  };

  const mockSession: Session = {
    access_token: accessToken,
    refresh_token: `mock-refresh-token-${Date.now()}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: mockUser,
    ...overrides.session,
  };

  const supabaseUser: SupabaseUser = {
    id: userId,
    email,
    name: mockUser.user_metadata?.full_name || mockUser.user_metadata?.name || email,
    username: mockUser.user_metadata?.username,
    picture: mockUser.user_metadata?.picture || mockUser.user_metadata?.avatar_url,
    emailVerified: !!mockUser.email_confirmed_at,
    ...overrides.supabaseUser,
  };

  return {
    session: mockSession,
    user: mockUser,
    accessToken,
    supabaseUser,
    ...overrides,
  };
}

/**
 * Clean up test user and related data
 * Deletes user from Supabase Auth and related records from database
 */
export async function cleanupTestUser(userId: string | undefined | null): Promise<void> {
  if (!userId || typeof userId !== "string") {
    // Skip cleanup if userId is invalid
    return;
  }

  const supabaseAdmin = getTestSupabaseAdminClient();

  try {
    // Delete user from Supabase Auth
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      // Don't log UUID validation errors - they're expected for invalid IDs
      if (!deleteError.message.includes("Expected parameter to be UUID")) {
        console.warn(`[TestHelper] Failed to delete Supabase user ${userId}:`, deleteError.message);
      }
    }
  } catch (error: unknown) {
    // Don't log UUID validation errors - they're expected for invalid IDs
    const errorMessage =
      error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
    if (!errorMessage.includes("Expected parameter to be UUID")) {
      console.warn(`[TestHelper] Error deleting Supabase user ${userId}:`, error);
    }
  }

  try {
    // Clean up related database records
    // Note: This assumes RLS policies allow service_role to delete
    // If not, you may need to use direct database queries with service_role connection

    // Clean up in dependency order
    const cleanupQueries = [
      // Delete user-related data
      db
        .delete(userSchema)
        .where(eq(userSchema.id, userId)),
    ];

    for (const query of cleanupQueries) {
      try {
        // Add timeout to prevent hanging on connection issues
        await Promise.race([
          query,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Cleanup timeout")), 5000)),
        ]);
      } catch (error: unknown) {
        // Log but continue - some tables might not exist or have constraints
        // Connection timeouts are acceptable in test cleanup
        const err = error && typeof error === "object" ? error : {};
        const errMessage = "message" in err && typeof err.message === "string" ? err.message : "";
        const errCode = "code" in err ? err.code : undefined;
        if (errMessage.includes("timeout") || errCode === "CONNECT_TIMEOUT") {
          console.debug(`[TestHelper] Cleanup query timed out (non-fatal):`, errMessage);
        } else {
          console.debug(`[TestHelper] Cleanup query failed (non-fatal):`, error);
        }
      }
    }
  } catch (error) {
    console.warn(`[TestHelper] Error cleaning up database records for ${userId}:`, error);
  }
}

/**
 * Test wrapper that creates a test user, runs test function, then cleans up
 * Ensures test isolation and proper cleanup
 */
export async function withAuthenticatedUser<T>(
  testFn: (session: TestSession) => Promise<T>,
  options: TestUserOptions = {},
): Promise<T> {
  let testSession: TestSession | null = null;

  try {
    // Create and sign in test user
    const { password, ...session } = await createAndSignInTestUser(options);
    testSession = session;

    // Run test function
    return await testFn(session);
  } finally {
    // Clean up test user
    if (testSession) {
      await cleanupTestUser(testSession.user.id);
    }
  }
}

/**
 * Ensure test user exists in local database
 * Syncs Supabase Auth user with local database schema
 */
export async function ensureTestUserInDatabase(supabaseUser: SupabaseUser): Promise<void> {
  if (!supabaseUser || !supabaseUser.id) {
    throw new Error("ensureTestUserInDatabase: supabaseUser or supabaseUser.id is undefined");
  }

  try {
    const existing = await db
      .select()
      .from(userSchema)
      .where(eq(userSchema.id, supabaseUser.id))
      .limit(1);

    if (existing.length > 0) {
      // Update existing user
      await db
        .update(userSchema)
        .set({
          email: supabaseUser.email,
          name: supabaseUser.name || supabaseUser.email,
          username: supabaseUser.username,
          emailVerified: supabaseUser.emailVerified || false,
          image: supabaseUser.picture,
          updatedAt: new Date(),
        })
        .where(eq(userSchema.id, supabaseUser.id));
    } else {
      // Create new user
      await db.insert(userSchema).values({
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: supabaseUser.name || supabaseUser.email,
        username: supabaseUser.username,
        emailVerified: supabaseUser.emailVerified || false,
        image: supabaseUser.picture,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  } catch (error) {
    console.warn(`[TestHelper] Failed to sync test user to database:`, error);
    // Don't throw - allow test to continue
  }
}

/**
 * Create multiple test users for testing multi-user scenarios
 * Includes delays between user creations to avoid rate limiting
 */
export async function createMultipleTestUsers(
  count: number,
  options: TestUserOptions = {},
): Promise<Array<{ user: User; password: string }>> {
  const users: Array<{ user: User; password: string }> = [];

  for (let i = 0; i < count; i++) {
    const userOptions: TestUserOptions = {
      ...options,
      email: options.email ? `${i}_${options.email}` : `test_user_${Date.now()}_${i}@example.com`,
      name: options.name ? `${options.name} ${i + 1}` : `Test User ${i + 1}`,
    };

    const user = await createTestUser(userOptions);
    users.push(user);

    // Add delay between user creations (except for the last one)
    if (i < count - 1) {
      await sleep(1000); // 1 second delay between user creations
    }
  }

  return users;
}

/**
 * Clean up multiple test users
 */
export async function cleanupMultipleTestUsers(
  userIds: (string | undefined | null)[],
): Promise<void> {
  // Filter out invalid IDs and clean up in parallel
  const validUserIds = userIds.filter((id): id is string => !!id && typeof id === "string");
  await Promise.all(validUserIds.map((userId) => cleanupTestUser(userId)));
}
