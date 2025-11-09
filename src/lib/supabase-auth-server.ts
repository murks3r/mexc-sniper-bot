import type { CookieOptions } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/src/db";
import { user as authUser } from "@/src/db/schemas/auth";
import { createSupabaseAdminClient } from "@/src/lib/supabase-auth";

interface SupabaseUser {
  id: string;
  email: string;
  name: string;
  username?: string;
  picture?: string;
  emailVerified: boolean;
}

interface SupabaseSession {
  user: SupabaseUser | null;
  isAuthenticated: boolean;
  accessToken?: string;
}

/**
 * Debug function to extract cookie information from request
 */
export function debugRequestCookies(request: NextRequest): Record<string, unknown> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return { present: false, cookies: [] };
  }

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const cookieMap: Record<string, string> = {};

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split("=");
    if (name) {
      cookieMap[name.trim()] = decodeURIComponent(valueParts.join("="));
    }
  }

  return {
    present: true,
    cookieHeader,
    cookieCount: cookies.length,
    cookies: cookieMap,
    supabaseCookies: Object.keys(cookieMap).filter(
      (key) => key.startsWith("sb-") || key.includes("supabase"),
    ),
  };
}

function createSupabaseServerClientFromRequest(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables not configured");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        const cookieHeader = request.headers.get("cookie");
        if (!cookieHeader) return undefined;
        const cookies = cookieHeader.split(";").map((c) => c.trim());
        const target = cookies.find((c) => c.startsWith(`${name}=`));
        if (target) return decodeURIComponent(target.split("=")[1]);
        return undefined;
      },
      set(_name: string, _value: string, _options: CookieOptions) {
        // Not supported via request in this helper
      },
      remove(_name: string, _options: CookieOptions) {
        // Not supported via request in this helper
      },
    },
  });
}

export async function getSessionFromRequest(request: NextRequest): Promise<SupabaseSession> {
  try {
    const supabase = createSupabaseServerClientFromRequest(request);
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      return { user: null, isAuthenticated: false };
    }

    if (!session?.user) {
      return { user: null, isAuthenticated: false };
    }

    const user = session.user as any;
    const supabaseUser: SupabaseUser = {
      id: user.id,
      email: user.email ?? "",
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User",
      username: user.user_metadata?.username,
      picture: user.user_metadata?.picture || user.user_metadata?.avatar_url,
      emailVerified: !!user.email_confirmed_at,
    };

    return {
      user: supabaseUser,
      isAuthenticated: true,
      accessToken: session.access_token,
    };
  } catch {
    return { user: null, isAuthenticated: false };
  }
}

export async function requireAuthFromRequest(request: NextRequest): Promise<SupabaseUser> {
  const session = await getSessionFromRequest(request);
  if (!session.isAuthenticated || !session.user) {
    throw new Error("Authentication required");
  }

  // Ensure the authenticated user exists in auth.user (same approach as user-preferences)
  try {
    const existing = await db
      .select()
      .from(authUser)
      .where(eq(authUser.id, session.user.id))
      .limit(1);

    if (existing.length === 0) {
      try {
        const supabase = createSupabaseAdminClient();
        const { data: userData, error } = await supabase.auth.admin.getUserById(session.user.id);

        if (!error && userData?.user) {
          const realUserData = {
            id: userData.user.id,
            email: userData.user.email || session.user.email,
            name:
              userData.user.user_metadata?.name ||
              userData.user.user_metadata?.full_name ||
              session.user.name ||
              session.user.email,
            emailVerified: !!userData.user.email_confirmed_at,
            createdAt: new Date(userData.user.created_at),
            updatedAt: new Date(userData.user.updated_at),
          };
          // Simple upsert logic
          try {
            await db.insert(authUser).values(realUserData);
          } catch (error: any) {
            if (error.code === "23505") {
              // Unique violation
              await db
                .update(authUser)
                .set({
                  email: realUserData.email,
                  name: realUserData.name,
                  emailVerified: realUserData.emailVerified,
                  updatedAt: new Date(),
                })
                .where(eq(authUser.id, realUserData.id));
            } else {
              throw error;
            }
          }
        } else {
          await db.insert(authUser).values({
            id: session.user.id,
            email: session.user.email,
            name: session.user.name || session.user.email,
            emailVerified: !!session.user.emailVerified,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          // Simple upsert logic
          try {
            await db.insert(authUser).values({
              id: session.user.id,
              email: session.user.email,
              name: session.user.name || session.user.email,
              emailVerified: !!session.user.emailVerified,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          } catch (error: any) {
            if (error.code === "23505") {
              // Unique violation
              await db
                .update(authUser)
                .set({
                  email: session.user.email,
                  name: session.user.name || session.user.email,
                  emailVerified: !!session.user.emailVerified,
                  updatedAt: new Date(),
                })
                .where(eq(authUser.id, session.user.id));
            } else {
              throw error;
            }
          }
        }
      } catch (_adminErr) {
        await db.insert(authUser).values({
          id: session.user.id,
          email: session.user.email,
          name: session.user.name || session.user.email,
          emailVerified: !!session.user.emailVerified,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        // Simple upsert logic
        try {
          await db.insert(authUser).values({
            id: session.user.id,
            email: session.user.email,
            name: session.user.name || session.user.email,
            emailVerified: !!session.user.emailVerified,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        } catch (error: any) {
          if (error.code === "23505") {
            // Unique violation
            await db
              .update(authUser)
              .set({
                email: session.user.email,
                name: session.user.name || session.user.email,
                emailVerified: !!session.user.emailVerified,
                updatedAt: new Date(),
              })
              .where(eq(authUser.id, session.user.id));
          } else {
            throw error;
          }
        }
      }
    }
  } catch (_syncErr) {
    // Non-blocking: if we fail to sync, protected route still proceeds
  }
  return session.user;
}
