import type { User } from "@clerk/nextjs/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabaseClient, syncClerkUserWithDatabase } from "./clerk-supabase-client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  username?: string | null;
  picture?: string;
  emailVerified: boolean;
}

/**
 * Get current authenticated user from Clerk
 */
export async function getClerkUser(): Promise<User | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  return await clerkClient.users.getUser(userId);
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireClerkAuth(): Promise<AuthenticatedUser> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Authentication required");
  }

  const user = await clerkClient.users.getUser(userId);

  if (!user) {
    throw new Error("Authentication required");
  }

  // Sync user with database
  await syncClerkUserWithDatabase(user);

  const primaryEmail = user.emailAddresses[0];

  return {
    id: user.id,
    email: primaryEmail?.emailAddress || "",
    name:
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.username ||
      primaryEmail?.emailAddress ||
      "",
    username: user.username,
    picture: user.imageUrl,
    emailVerified: primaryEmail?.verification?.status === "verified",
  };
}

/**
 * Check if user is authenticated
 */
export async function isClerkAuthenticated(): Promise<boolean> {
  const { userId } = await auth();
  return !!userId;
}

/**
 * Get Clerk user ID from session
 */
export async function getClerkUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Require Clerk user ID - throws if not authenticated
 */
export async function requireClerkUserId(): Promise<string> {
  const userId = await getClerkUserId();

  if (!userId) {
    throw new Error("Authentication required");
  }

  return userId;
}

/**
 * Get Clerk token for Supabase RLS
 */
export async function getClerkToken(): Promise<string | null> {
  const { getToken } = await auth();

  try {
    return await getToken({ template: "supabase" });
  } catch (_error) {
    // Logger not available in this context, silent fail
    return null;
  }
}

/**
 * Verify user exists in database
 */
export async function verifyUserInDatabase(clerkUserId: string): Promise<boolean> {
  try {
    const adminClient = createAdminSupabaseClient();
    const { data, error } = await adminClient
      .from("auth.user")
      .select("id")
      .eq("id", clerkUserId)
      .single();

    if (error) {
      // Logger not available in this context, silent fail
      return false;
    }

    return !!data;
  } catch (_error) {
    // Logger not available in this context, silent fail
    return false;
  }
}
