/**
 * Authentication utility functions
 * Helper functions for checking anonymous user status and JWT claims
 */

import type { Session, User } from "@supabase/supabase-js";

/**
 * Check if a user is anonymous based on their JWT claims
 * Anonymous users have `is_anonymous: true` in their JWT
 */
export function isAnonymousUser(user: User | null | undefined): boolean {
  if (!user) return false;

  // Check app_metadata for is_anonymous flag
  // Supabase sets this in the JWT for anonymous users
  return user.app_metadata?.is_anonymous === true;
}

/**
 * Check if a session belongs to an anonymous user
 */
export function isAnonymousSession(session: Session | null | undefined): boolean {
  if (!session?.user) return false;
  return isAnonymousUser(session.user);
}

/**
 * Extract the is_anonymous claim from a JWT token
 * This is useful for RLS policies in PostgreSQL
 * Browser-safe implementation using atob
 */
export function getIsAnonymousFromToken(token: string | null | undefined): boolean {
  if (!token) return false;

  try {
    // JWT structure: header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    // Decode the payload (base64url) - browser-safe using atob
    const base64Url = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const base64 = base64Url.replace(/\s/g, "");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(""),
    );

    const payload = JSON.parse(jsonPayload);

    // Check for is_anonymous claim
    return payload.is_anonymous === true;
  } catch (error) {
    console.warn("[AuthUtils] Failed to decode JWT token:", error);
    return false;
  }
}

/**
 * Check if user can be upgraded (is anonymous and not already linked)
 */
export function canUpgradeAnonymousUser(user: User | null | undefined): boolean {
  if (!user) return false;
  return isAnonymousUser(user) && !user.email && !user.phone;
}

