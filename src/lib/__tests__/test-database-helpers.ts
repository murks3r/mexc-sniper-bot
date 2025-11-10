/**
 * Test Database Helpers
 *
 * Provides utilities for managing test data in Supabase
 * with proper cleanup and isolation between tests.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database-types";
import { createAuthTestHelpers, type TestUser } from "./auth-test-helpers";

export interface TestDatabaseHelpers {
  createTestSnipeTarget: (userId: string, overrides?: Partial<any>) => Promise<any>;
  createTestExecutionHistory: (userId: string, overrides?: Partial<any>) => Promise<any>;
  createTestApiCredentials: (userId: string, overrides?: Partial<any>) => Promise<any>;
  createTestUserPreferences: (userId: string, overrides?: Partial<any>) => Promise<any>;
  cleanupTestData: (userId: string) => Promise<void>;
  cleanupAllTestData: () => Promise<void>;
  getTestClient: () => SupabaseClient<Database>;
}

/**
 * Creates database test helpers for managing test data
 */
export function createTestDatabaseHelpers(): TestDatabaseHelpers {
  const authHelpers = createAuthTestHelpers();
  const serviceClient = authHelpers.createServiceClient();

  /**
   * Creates a test snipe target for a user
   */
  async function createTestSnipeTarget(userId: string, overrides: Partial<any> = {}) {
    const defaultTarget = {
      userId,
      vcoinId: `TEST_${Date.now()}`,
      symbolName: `TEST${Date.now()}USDT`,
      positionSizeUsdt: 100,
      status: "ready",
      priority: 1,
      confidenceScore: 85.0,
      targetExecutionTime: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
      currentRetries: 0,
      maxRetries: 3,
      riskLevel: "medium",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const targetData = { ...defaultTarget, ...overrides };

    const { data, error } = await serviceClient
      .from("snipe_targets")
      .insert(targetData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test snipe target: ${error.message}`);
    }

    return data;
  }

  /**
   * Creates test execution history for a user
   */
  async function createTestExecutionHistory(userId: string, overrides: Partial<any> = {}) {
    const defaultHistory = {
      userId,
      symbolName: `TEST${Date.now()}USDT`,
      vcoinId: `TEST_${Date.now()}`,
      executionType: "paper_trade",
      status: "completed",
      orderSide: "buy",
      orderType: "market",
      quantity: 50,
      price: 1.234,
      executedPrice: 1.234,
      executedQuantity: 50,
      totalValue: 61.7,
      orderId: `test_order_${Date.now()}`,
      clientOrderId: `test_client_${Date.now()}`,
      fills: JSON.stringify([
        {
          price: 1.234,
          quantity: 50,
          commission: 0.0123,
        },
      ]),
      commission: 0.0123,
      commissionAsset: "USDT",
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const historyData = { ...defaultHistory, ...overrides };

    const { data, error } = await serviceClient
      .from("execution_history")
      .insert(historyData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test execution history: ${error.message}`);
    }

    return data;
  }

  /**
   * Creates test API credentials for a user
   */
  async function createTestApiCredentials(userId: string, overrides: Partial<any> = {}) {
    const defaultCredentials = {
      userId,
      exchange: "mexc",
      apiKey: `test_api_key_${Date.now()}`,
      secretKey: `test_secret_key_${Date.now()}`,
      isActive: true,
      permissions: ["read", "trade"],
      lastUsed: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const credentialsData = { ...defaultCredentials, ...overrides };

    const { data, error } = await serviceClient
      .from("api_credentials")
      .insert(credentialsData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test API credentials: ${error.message}`);
    }

    return data;
  }

  /**
   * Creates test user preferences for a user
   */
  async function createTestUserPreferences(userId: string, overrides: Partial<any> = {}) {
    const defaultPreferences = {
      userId,
      defaultPositionSizeUsdt: 100,
      maxDailyTrades: 10,
      riskLevel: "medium",
      autoSnipingEnabled: true,
      takeProfitPercent: 10,
      stopLossPercent: 5,
      maxConcurrentPositions: 5,
      notificationsEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const preferencesData = { ...defaultPreferences, ...overrides };

    const { data, error } = await serviceClient
      .from("user_preferences")
      .insert(preferencesData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test user preferences: ${error.message}`);
    }

    return data;
  }

  /**
   * Cleans up all test data for a specific user
   */
  async function cleanupTestData(userId: string): Promise<void> {
    try {
      // Delete in order to respect foreign key constraints
      await serviceClient.from("execution_history").delete().eq("user_id", userId);
      await serviceClient.from("snipe_targets").delete().eq("user_id", userId);
      await serviceClient.from("api_credentials").delete().eq("user_id", userId);
      await serviceClient.from("user_preferences").delete().eq("user_id", userId);

      console.log(`✅ Cleaned up test data for user: ${userId}`);
    } catch (error) {
      console.warn(`⚠️ Failed to cleanup test data for user ${userId}:`, error);
    }
  }

  /**
   * Cleans up all test data (for test suite teardown)
   */
  async function cleanupAllTestData(): Promise<void> {
    try {
      // Delete all test users and their data
      const { data: testUsers } = await serviceClient
        .from("auth.users")
        .select("id")
        .like("email", "test_user_%@example.com");

      if (testUsers && testUsers.length > 0) {
        const userIds = testUsers.map((user: any) => user.id);

        // Delete data first (foreign key constraints)
        await serviceClient.from("execution_history").delete().in("user_id", userIds);
        await serviceClient.from("snipe_targets").delete().in("user_id", userIds);
        await serviceClient.from("api_credentials").delete().in("user_id", userIds);
        await serviceClient.from("user_preferences").delete().in("user_id", userIds);

        // Delete users using admin API
        for (const user of testUsers) {
          await serviceClient.auth.admin.deleteUser(user.id);
        }

        console.log(`✅ Cleaned up ${testUsers.length} test users and their data`);
      }
    } catch (error) {
      console.warn("⚠️ Failed to cleanup all test data:", error);
    }
  }

  /**
   * Gets a test client with anon privileges
   */
  function getTestClient(): SupabaseClient<Database> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    return createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return {
    createTestSnipeTarget,
    createTestExecutionHistory,
    createTestApiCredentials,
    createTestUserPreferences,
    cleanupTestData,
    cleanupAllTestData,
    getTestClient,
  };
}

/**
 * Sets up test environment with user and data
 */
export async function setupTestEnvironment(dataOverrides?: {
  snipeTargets?: Partial<any>[];
  executionHistory?: Partial<any>[];
  apiCredentials?: Partial<any>[];
  userPreferences?: Partial<any>;
}) {
  const authHelpers = createAuthTestHelpers();
  const dbHelpers = createTestDatabaseHelpers();

  // Create test user
  const testUser = await authHelpers.createTestUser();
  const signedInUser = await authHelpers.signInTestUser(testUser);

  // Create test data
  const testData: any = {};

  if (dataOverrides?.snipeTargets) {
    testData.snipeTargets = await Promise.all(
      dataOverrides.snipeTargets.map((override) =>
        dbHelpers.createTestSnipeTarget(signedInUser.id, override),
      ),
    );
  }

  if (dataOverrides?.executionHistory) {
    testData.executionHistory = await Promise.all(
      dataOverrides.executionHistory.map((override) =>
        dbHelpers.createTestExecutionHistory(signedInUser.id, override),
      ),
    );
  }

  if (dataOverrides?.apiCredentials) {
    testData.apiCredentials = await Promise.all(
      dataOverrides.apiCredentials.map((override) =>
        dbHelpers.createTestApiCredentials(signedInUser.id, override),
      ),
    );
  }

  if (dataOverrides?.userPreferences) {
    testData.userPreferences = await dbHelpers.createTestUserPreferences(
      signedInUser.id,
      dataOverrides.userPreferences,
    );
  }

  return {
    user: signedInUser,
    data: testData,
    authHelpers,
    dbHelpers,
    cleanup: async () => {
      await dbHelpers.cleanupTestData(signedInUser.id);
      await authHelpers.cleanupTestUser(signedInUser);
    },
  };
}
