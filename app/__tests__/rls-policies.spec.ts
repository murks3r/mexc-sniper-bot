/**
 * RLS Policy Tests
 *
 * Comprehensive tests for Row Level Security policies to ensure:
 * - Users can only access their own data
 * - Users cannot access other users' data
 * - Unauthenticated access is blocked
 * - Service role can bypass RLS (for admin operations)
 *
 * These tests require a real Supabase test project with RLS enabled.
 * Set USE_REAL_SUPABASE=true and configure test Supabase credentials.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createMultipleTestUsers,
  cleanupMultipleTestUsers,
  signInTestUser,
  ensureTestUserInDatabase,
  getTestSupabaseAnonClient,
  getTestSupabaseAdminClient,
} from "@/src/lib/test-helpers/supabase-auth-test-helpers";
import { detectTestMode } from "@/src/lib/test-helpers/test-supabase-client";
import { db } from "@/src/db";
import { user as userSchema, userPreferences } from "@/src/db/schemas/auth";
import { snipeTargets, executionHistory } from "@/src/db/schemas/trading";
import { apiCredentials } from "@/src/db/schemas/trading";
import { eq } from "drizzle-orm";

const testMode = detectTestMode();
const skipIntegrationTests = testMode === "mock";

describe.skipIf(skipIntegrationTests)("RLS Policy Tests", () => {
  let user1Id: string;
  let user2Id: string;
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    // Create two test users
    const users = await createMultipleTestUsers(2, {
      email: `test_rls_${Date.now()}@example.com`,
    });

    // Sign in both users
    const user1Session = await signInTestUser(users[0]!.user.email!, users[0]!.password);
    const user2Session = await signInTestUser(users[1]!.user.email!, users[1]!.password);

    user1Id = users[0]!.user.id;
    user2Id = users[1]!.user.id;
    user1Token = user1Session.accessToken;
    user2Token = user2Session.accessToken;

    // Ensure users exist in database
    await ensureTestUserInDatabase(user1Session.supabaseUser);
    await ensureTestUserInDatabase(user2Session.supabaseUser);
  });

  afterAll(async () => {
    await cleanupMultipleTestUsers([user1Id, user2Id]);
  });

  describe("User Table RLS", () => {
    it("should allow user to view own profile", async () => {
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("user")
        .select("*")
        .eq("id", user1Id)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.id).toBe(user1Id);
    });

    it("should prevent user from viewing other user's profile", async () => {
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("user")
        .select("*")
        .eq("id", user2Id)
        .single();

      // Should either return null or error due to RLS
      expect(data).toBeNull();
      expect(error).toBeTruthy();
    });

    it("should prevent unauthenticated access to user profiles", async () => {
      const supabase = getTestSupabaseAnonClient();
      // Don't set session - unauthenticated

      const { data, error } = await supabase.from("user").select("*").limit(1);

      expect(data).toBeNull();
      expect(error).toBeTruthy();
    });
  });

  describe("Snipe Targets RLS", () => {
    let user1TargetId: number | null = null;
    let user2TargetId: number | null = null;

    beforeAll(async () => {
      // Create test snipe targets for both users using admin client (bypasses RLS)
      const adminSupabase = getTestSupabaseAdminClient();

      // Create target for user1
      const { data: target1 } = await adminSupabase
        .from("snipe_targets")
        .insert({
          user_id: user1Id,
          symbol_name: "TEST/USDT",
          vcoin_id: "test-coin-1",
          position_size_usdt: 100,
        })
        .select()
        .single();

      user1TargetId = target1?.id || null;

      // Create target for user2
      const { data: target2 } = await adminSupabase
        .from("snipe_targets")
        .insert({
          user_id: user2Id,
          symbol_name: "TEST2/USDT",
          vcoin_id: "test-coin-2",
          position_size_usdt: 200,
        })
        .select()
        .single();

      user2TargetId = target2?.id || null;
    });

    it("should allow user to view own snipe targets", async () => {
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("snipe_targets")
        .select("*")
        .eq("user_id", user1Id);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.length).toBeGreaterThan(0);
      expect(data?.every((target) => target.user_id === user1Id)).toBe(true);
    });

    it("should prevent user from viewing other user's snipe targets", async () => {
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("snipe_targets")
        .select("*")
        .eq("user_id", user2Id);

      // Should return empty array or error due to RLS
      expect(data?.length || 0).toBe(0);
    });

    it("should allow user to create own snipe target", async () => {
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("snipe_targets")
        .insert({
          user_id: user1Id,
          symbol_name: "NEW/USDT",
          vcoin_id: "new-coin",
          position_size_usdt: 50,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.user_id).toBe(user1Id);

      // Cleanup
      if (data?.id) {
        await supabase.from("snipe_targets").delete().eq("id", data.id);
      }
    });

    it("should prevent user from creating snipe target for another user", async () => {
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("snipe_targets")
        .insert({
          user_id: user2Id, // Trying to create for user2
          symbol_name: "HACK/USDT",
          vcoin_id: "hack-coin",
          position_size_usdt: 999,
        })
        .select()
        .single();

      // Should fail due to RLS policy check
      expect(error).toBeTruthy();
      expect(data).toBeNull();
    });
  });

  describe("API Credentials RLS", () => {
    it("should allow user to view own API credentials", async () => {
      // First create a credential using admin client
      const adminSupabase = getTestSupabaseAdminClient();
      const { data: credential } = await adminSupabase
        .from("api_credentials")
        .insert({
          user_id: user1Id,
          provider: "mexc",
          encrypted_api_key: "encrypted-key-1",
          encrypted_secret_key: "encrypted-secret-1",
        })
        .select()
        .single();

      // Now test user1 can view it
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("api_credentials")
        .select("*")
        .eq("user_id", user1Id);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.some((c) => c.id === credential?.id)).toBe(true);

      // Cleanup
      if (credential?.id) {
        await adminSupabase.from("api_credentials").delete().eq("id", credential.id);
      }
    });

    it("should prevent user from viewing other user's API credentials", async () => {
      // Create credential for user2 using admin client
      const adminSupabase = getTestSupabaseAdminClient();
      const { data: credential } = await adminSupabase
        .from("api_credentials")
        .insert({
          user_id: user2Id,
          provider: "mexc",
          encrypted_api_key: "encrypted-key-2",
          encrypted_secret_key: "encrypted-secret-2",
        })
        .select()
        .single();

      // Try to view as user1
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("api_credentials")
        .select("*")
        .eq("user_id", user2Id);

      // Should return empty array (RLS blocks access) or error
      // Note: RLS may return empty array even if data exists
      if (data) {
        expect(Array.isArray(data)).toBe(true);
        // If RLS is working, should be empty; if not, this test documents the issue
        expect(data.length).toBe(0);
      } else {
        expect(error).toBeTruthy();
      }

      // Cleanup
      if (credential?.id) {
        await adminSupabase.from("api_credentials").delete().eq("id", credential.id);
      }
    });
  });

  describe("User Preferences RLS", () => {
    it("should allow user to view own preferences", async () => {
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user1Id)
        .single();

      // May or may not exist, but if it does, user should be able to view it
      if (data) {
        expect(error).toBeNull();
        expect(data.user_id).toBe(user1Id);
      }
    });

    it("should prevent user from viewing other user's preferences", async () => {
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user2Id)
        .single();

      expect(data).toBeNull();
    });
  });

  describe("Execution History RLS", () => {
    it("should allow user to view own execution history", async () => {
      // Create execution history for user1 using admin client
      const adminSupabase = getTestSupabaseAdminClient();
      const { data: history } = await adminSupabase
        .from("execution_history")
        .insert({
          user_id: user1Id,
          symbol_name: "TEST/USDT",
          vcoin_id: "test-coin",
          action: "BUY",
          order_type: "MARKET",
          order_side: "BUY",
          requested_quantity: 100,
          status: "COMPLETED",
          requested_at: new Date().toISOString(),
        })
        .select()
        .single();

      // Test user1 can view it
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("execution_history")
        .select("*")
        .eq("user_id", user1Id);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.some((h) => h.id === history?.id)).toBe(true);

      // Cleanup
      if (history?.id) {
        await adminSupabase.from("execution_history").delete().eq("id", history.id);
      }
    });

    it("should prevent user from viewing other user's execution history", async () => {
      const supabase = getTestSupabaseAnonClient();
      await supabase.auth.setSession({
        access_token: user1Token,
        refresh_token: "dummy",
      });

      const { data, error } = await supabase
        .from("execution_history")
        .select("*")
        .eq("user_id", user2Id);

      expect(data?.length || 0).toBe(0);
    });
  });

  describe("Service Role Bypass", () => {
    it("should allow service role to bypass RLS", async () => {
      const adminSupabase = getTestSupabaseAdminClient();

      // Service role should be able to view all users
      const { data: users, error } = await adminSupabase
        .from("user")
        .select("*")
        .limit(10);

      expect(error).toBeNull();
      expect(users).toBeDefined();
      expect(users?.length).toBeGreaterThan(0);
    });

    it("should allow service role to view all snipe targets", async () => {
      const adminSupabase = getTestSupabaseAdminClient();

      const { data: targets, error } = await adminSupabase
        .from("snipe_targets")
        .select("*")
        .limit(10);

      expect(error).toBeNull();
      expect(targets).toBeDefined();
    });
  });

  describe("Unauthenticated Access", () => {
    it("should block unauthenticated access to protected tables", async () => {
      const supabase = getTestSupabaseAnonClient();
      // Ensure no session is set - unauthenticated
      await supabase.auth.signOut();

      const tables = ["snipe_targets", "api_credentials", "user_preferences", "execution_history"];

      for (const table of tables) {
        const { data, error } = await supabase.from(table).select("*").limit(1);

        // Supabase RLS behavior:
        // - If RLS policy blocks: returns empty array [] or null with error
        // - If RLS allows: returns data (shouldn't happen for unauthenticated)
        // Check that we don't get actual data rows
        if (data !== null && Array.isArray(data)) {
          // Empty array means RLS blocked successfully
          expect(data.length).toBe(0);
        } else {
          // Null with error also means blocked
          expect(data).toBeNull();
          // Error may or may not be present depending on RLS policy configuration
        }
      }
    });
  });
});


