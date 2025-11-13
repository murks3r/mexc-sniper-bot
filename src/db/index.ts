import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { RetryManager } from "../lib/resilience/retry-manager";
import * as schema from "./migrations/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for DB connection");
}

const client = postgres(process.env.DATABASE_URL, { max: 1 });

export const db = drizzle(client, { schema });
export * from "./migrations/schema";

// Export executeWithRetry for backward compatibility
export const executeWithRetry = RetryManager.executeWithRetry;

// Create and export Supabase clients
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const supabaseAdmin: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

export async function getUserPreferences(_userId: string) {
  throw new Error("getUserPreferences not implemented in db index; use dedicated service instead.");
}
