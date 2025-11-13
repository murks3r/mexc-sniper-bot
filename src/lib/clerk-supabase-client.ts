import type { User } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

/**
 * Create a Supabase client with Clerk token injection for RLS
 * This client should be used in client components with Clerk auth
 */
export function createClerkSupabaseClient(getToken: () => Promise<string | null>) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: async (url, options = {}) => {
        const clerkToken = await getToken();

        if (clerkToken) {
          const headers = new Headers(options.headers);
          headers.set("Authorization", `Bearer ${clerkToken}`);
          options.headers = headers;
        }

        return fetch(url, options);
      },
    },
  });
}

/**
 * Create a Supabase client for server-side use with Clerk user
 */
export function createServerSupabaseWithClerk(clerkUserId: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${clerkUserId}`,
      },
    },
  });
}

/**
 * Create admin Supabase client (bypasses RLS)
 * Use with caution - only for server-side admin operations
 */
export function createAdminSupabaseClient() {
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Sync Clerk user with Supabase database
 */
export async function syncClerkUserWithDatabase(user: User) {
  const adminClient = createAdminSupabaseClient();

  const { error } = await adminClient.from("auth.user").upsert(
    {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      name:
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.username ||
        user.emailAddresses[0]?.emailAddress,
      username: user.username,
      emailVerified: user.emailAddresses[0]?.verification?.status === "verified",
      image: user.imageUrl,
      createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
      updatedAt: new Date(),
    },
    {
      onConflict: "id",
    },
  );

  if (error) {
    console.error("Error syncing Clerk user with database:", error);
    throw error;
  }
}
