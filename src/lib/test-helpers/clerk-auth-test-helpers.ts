/**
 * Clerk Auth Test Helpers
 *
 * Comprehensive utilities for testing Clerk authentication in unit and integration tests.
 * Provides functions to create test users, sign in, create authenticated requests, and cleanup.
 *
 * Security Notes:
 * - Never use secret keys in client-side code or public repos
 * - Use secret keys only in secure CI or server test setup
 * - Always clean up test users after tests
 * - Use deterministic test user emails for easier debugging
 */

import type { Session as ClerkSession, User as ClerkUser } from "@clerk/backend";
import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/src/db";
import { user as userSchema } from "@/src/db/schemas/auth";

// Helper to create Request-compatible object for tests
function createRequestForTest(
  url: string,
  headers: Headers,
  options: RequestInit = {},
): Request | NextRequest {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextRequest: NextRequestClass } = require("next/server");
    return new NextRequestClass(url, {
      ...options,
      headers,
    });
  } catch {
    return new Request(url, {
      ...options,
      headers,
    }) as unknown as NextRequest;
  }
}

export interface ClerkTestUserOptions {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  skipPasswordChecks?: boolean;
  skipEmailVerification?: boolean;
}

export interface ClerkTestSession {
  user: ClerkUser;
  session: ClerkSession;
  sessionToken: string;
  clerkUserId: string;
}

/**
 * Get Clerk client for test operations
 */
function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Clerk test environment variables not configured. Required: CLERK_SECRET_KEY");
  }
  return createClerkClient({ secretKey });
}

/**
 * Create a test user via Clerk API
 * Note: For real integration tests, requires CLERK_SECRET_KEY and proper Clerk setup
 */
export async function createClerkTestUser(
  options: ClerkTestUserOptions = {},
): Promise<{ user: ClerkUser; password: string }> {
  const {
    email = `test_user_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`,
    password = `TestPassword${Date.now()}!`,
    firstName = "Test",
    lastName = "User",
    username,
  } = options;

  const clerk = getClerkClient();

  // Use correct Clerk API - skipEmailVerification is not a valid parameter
  const userData = await clerk.users.createUser({
    emailAddress: [email],
    password,
    firstName,
    lastName,
    username,
    skipPasswordChecks: true,
  });

  if (!userData) {
    throw new Error("Failed to create test user: No user data returned");
  }

  return {
    user: userData as ClerkUser,
    password,
  };
}

/**
 * Create a session for a Clerk user
 * Note: Clerk sessions are typically created during sign-in, not manually
 * This is a placeholder for testing - real integration requires proper Clerk setup
 */
export async function createClerkSession(userId: string): Promise<ClerkSession> {
  // For now, return a mock session structure
  // Real implementation would use Clerk's session creation API
  return {
    id: `sess_${Date.now()}`,
    object: "session",
    userId,
    status: "active",
    lastActiveAt: Date.now(),
    expireAt: Date.now() + 3600 * 1000,
    abandonAt: Date.now() + 3600 * 1000,
  } as unknown as ClerkSession;
}

/**
 * Create a session token for a Clerk session
 * Note: Real implementation requires proper Clerk Backend API setup
 * See: https://clerk.com/docs/reference/backend-api/tag/sessions#post-sessions-session_id-tokens
 */
export async function createClerkSessionToken(sessionId: string): Promise<string> {
  // For unit tests, return a mock token
  // Real integration tests should use Clerk's Backend API directly
  return `mock-clerk-token-${sessionId}-${Date.now()}`;
}

/**
 * Create a test user and sign them in (create session + token)
 */
export async function createAndSignInClerkUser(
  options: ClerkTestUserOptions = {},
): Promise<ClerkTestSession & { password: string }> {
  const { user, password } = await createClerkTestUser(options);
  const session = await createClerkSession(user.id);
  const sessionToken = await createClerkSessionToken(session.id);

  return {
    user,
    session,
    sessionToken,
    clerkUserId: user.id,
    password,
  };
}

/**
 * Create an authenticated NextRequest with Clerk Authorization header
 */
export function createAuthenticatedClerkRequest(
  url: string,
  sessionToken: string,
  options: RequestInit = {},
): NextRequest {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${sessionToken}`);

  return createRequestForTest(url, headers, options) as NextRequest;
}

// Counter for generating unique IDs in tests
let mockIdCounter = 0;

/**
 * Create a mock Clerk test session (for unit tests)
 */
export function createMockClerkSession(
  overrides: Partial<ClerkTestSession> = {},
): ClerkTestSession {
  mockIdCounter += 1;
  const userId = overrides.clerkUserId || `user_${Date.now()}_${mockIdCounter}`;
  const sessionToken =
    overrides.sessionToken || `mock-session-token-${Date.now()}_${mockIdCounter}`;

  const mockUser = {
    id: userId,
    object: "user",
    username: `testuser_${Date.now()}`,
    firstName: "Test",
    lastName: "User",
    imageUrl: "",
    hasImage: false,
    primaryEmailAddressId: `email_${Date.now()}`,
    primaryPhoneNumberId: null,
    primaryWeb3WalletId: null,
    passwordEnabled: true,
    totpEnabled: false,
    backupCodeEnabled: false,
    twoFactorEnabled: false,
    banned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    profileImageUrl: "",
    emailAddresses: [
      {
        id: `email_${Date.now()}`,
        emailAddress: `test-${userId}@example.com`,
        verification: { status: "verified", strategy: "email_link" },
        linkedTo: [],
      },
    ],
    phoneNumbers: [],
    web3Wallets: [],
    externalAccounts: [],
    samlAccounts: [],
    publicMetadata: {},
    privateMetadata: {},
    unsafeMetadata: {},
    externalId: null,
    lastSignInAt: Date.now(),
    ...overrides.user,
  } as unknown as ClerkUser;

  const mockSession: ClerkSession = {
    id: `sess_${Date.now()}`,
    object: "session",
    userId: userId,
    status: "active",
    lastActiveAt: Date.now(),
    expireAt: Date.now() + 3600 * 1000,
    abandonAt: Date.now() + 3600 * 1000,
    ...overrides.session,
  } as ClerkSession;

  return {
    user: mockUser,
    session: mockSession,
    sessionToken,
    clerkUserId: userId,
    ...overrides,
  };
}

/**
 * Clean up Clerk test user and related data
 */
export async function cleanupClerkTestUser(userId: string | undefined | null): Promise<void> {
  if (!userId || typeof userId !== "string") {
    return;
  }

  const clerk = getClerkClient();

  try {
    await clerk.users.deleteUser(userId);
  } catch (error: unknown) {
    const errorMessage =
      error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
    if (!errorMessage.includes("not found")) {
      console.warn(`[ClerkTestHelper] Error deleting Clerk user ${userId}:`, error);
    }
  }

  try {
    // Clean up related database records
    await db.delete(userSchema).where(eq(userSchema.id, userId));
  } catch (error) {
    console.warn(`[ClerkTestHelper] Error cleaning up database records for ${userId}:`, error);
  }
}

/**
 * Test wrapper that creates a Clerk test user, runs test function, then cleans up
 */
export async function withAuthenticatedClerkUser<T>(
  testFn: (session: ClerkTestSession) => Promise<T>,
  options: ClerkTestUserOptions = {},
): Promise<T> {
  let testSession: ClerkTestSession | null = null;

  try {
    const { password: _password, ...session } = await createAndSignInClerkUser(options);
    testSession = session;
    return await testFn(session);
  } finally {
    if (testSession) {
      await cleanupClerkTestUser(testSession.clerkUserId);
    }
  }
}

/**
 * Ensure Clerk user exists in local database
 */
export async function ensureClerkUserInDatabase(clerkUser: ClerkUser): Promise<void> {
  if (!clerkUser || !clerkUser.id) {
    throw new Error("ensureClerkUserInDatabase: clerkUser or clerkUser.id is undefined");
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress || "";
  const name =
    clerkUser.firstName && clerkUser.lastName
      ? `${clerkUser.firstName} ${clerkUser.lastName}`
      : clerkUser.username || email;

  try {
    const existing = await db
      .select()
      .from(userSchema)
      .where(eq(userSchema.id, clerkUser.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userSchema)
        .set({
          email,
          name,
          username: clerkUser.username || null,
          emailVerified: clerkUser.emailAddresses[0]?.verification?.status === "verified",
          image: clerkUser.imageUrl || null,
          updatedAt: new Date(),
        })
        .where(eq(userSchema.id, clerkUser.id));
    } else {
      await db.insert(userSchema).values({
        id: clerkUser.id,
        email,
        name,
        username: clerkUser.username || null,
        emailVerified: clerkUser.emailAddresses[0]?.verification?.status === "verified",
        image: clerkUser.imageUrl || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  } catch (error) {
    console.warn(`[ClerkTestHelper] Failed to sync Clerk user to database:`, error);
  }
}

/**
 * Backward compatibility: Create test session (for migration from Supabase helpers)
 */
export function createTestSession(overrides: Partial<ClerkTestSession> = {}): ClerkTestSession {
  return createMockClerkSession(overrides);
}

/**
 * Backward compatibility: Create authenticated request
 */
export function createAuthenticatedRequest(
  url: string,
  sessionToken: string,
  options: RequestInit = {},
): NextRequest {
  return createAuthenticatedClerkRequest(url, sessionToken, options);
}
