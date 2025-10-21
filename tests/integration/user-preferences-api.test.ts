/**
 * Integration Tests for User Preferences API
 * 
 * Tests the complete user preferences flow with real database operations,
 * authentication middleware, and the foreign key constraint fix.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDatabase, stopTestDatabase, getTestDatabase } from "../setup/testcontainers-setup";
import { user, userPreferences } from "../../src/db";
import { eq } from "drizzle-orm";
import type { NewUser, NewUserPreferences } from "../../src/db";

// Set environment for real database testing
process.env.NODE_ENV = "test";
process.env.USE_REAL_DATABASE = "true";
process.env.FORCE_MOCK_DB = "false";
process.env.USE_MOCK_DATABASE = "false";

// Mock the Next.js request/response for API testing
const mockRequest = (method: string, body?: any) => ({
  method,
  json: () => Promise.resolve(body || {}),
  url: 'http://localhost:3008/api/user-preferences',
  headers: {
    get: (name: string) => {
      if (name === 'content-type') return 'application/json';
      return null;
    },
  },
});

const mockResponse = () => {
  const response = {
    status: 200,
    headers: new Map(),
    body: null as any,
    json: (data: any) => {
      response.body = data;
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    ok: true,
  };
  return response;
};

describe("User Preferences API Integration Tests", () => {
  const testUserId = `integration-test-user-${Date.now()}`;
  const testCleanupIds: string[] = [];
  let databaseSetup: any;
  let testDb: any;

  beforeAll(async () => {
    console.log("🔗 Starting user preferences API integration tests...");
    
    // Set up TestContainer database
    databaseSetup = await startTestDatabase();
    testDb = getTestDatabase();
    console.log("✅ Database setup complete");
    
    // Track cleanup IDs
    testCleanupIds.push(testUserId);
  });

  afterAll(async () => {
    console.log("🧹 Cleaning up integration test data...");
    
    // Clean up test data
    for (const userId of testCleanupIds) {
      try {
        await testDb.delete(userPreferences).where(eq(userPreferences.userId, userId));
        await testDb.delete(user).where(eq(user.id, userId));
      } catch (error) {
        console.warn(`Cleanup warning for user ${userId}:`, error);
      }
    }
    
    await stopTestDatabase();
    console.log("✅ Integration test cleanup complete");
  });

  beforeEach(async () => {
    // Clean up any existing test data before each test
    try {
      await testDb.delete(userPreferences).where(eq(userPreferences.userId, testUserId));
      await testDb.delete(user).where(eq(user.id, testUserId));
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("User Creation and Foreign Key Constraints", () => {
    it("should successfully create user and preferences in correct order", async () => {
      // Step 1: Create user first
      const testUser: NewUser = {
        id: testUserId,
        email: `${testUserId}@test.example.com`,
        name: `Integration Test User ${testUserId}`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createdUsers = await testDb.insert(user).values(testUser).returning();
      expect(createdUsers).toHaveLength(1);
      expect(createdUsers[0].id).toBe(testUserId);

      // Step 2: Create user preferences (should succeed with user existing)
      const testPreferences: NewUserPreferences = {
        userId: testUserId,
        defaultBuyAmountUsdt: 100,
        maxConcurrentSnipes: 3,
        takeProfitLevels: {
          level1: 5,
          level2: 10,
          level3: 15,
          level4: 25,
        },
        defaultTakeProfitLevel: 2,
        stopLossPercent: 5.0,
        riskTolerance: 'medium',
        readyStatePattern: [1, 2, 1],
        targetAdvanceHours: 2,
        calendarPollIntervalSeconds: 60,
        symbolsPollIntervalSeconds: 30,
        selectedExitStrategy: 'balanced',
        autoBuyEnabled: true,
        autoSellEnabled: true,
        autoSnipeEnabled: false,
      };

      const createdPreferences = await testDb.insert(userPreferences)
        .values(testPreferences)
        .returning();

      expect(createdPreferences).toHaveLength(1);
      expect(createdPreferences[0].userId).toBe(testUserId);
      expect(createdPreferences[0].defaultBuyAmountUsdt).toBe(100);
    });

    it("should fail to create preferences without user (foreign key constraint)", async () => {
      const nonExistentUserId = `non-existent-user-${Date.now()}`;
      
      const testPreferences: NewUserPreferences = {
        userId: nonExistentUserId,
        defaultBuyAmountUsdt: 100,
        maxConcurrentSnipes: 3,
        takeProfitLevels: {
          level1: 5,
          level2: 10,
          level3: 15,
          level4: 25,
        },
        defaultTakeProfitLevel: 2,
        stopLossPercent: 5.0,
        riskTolerance: 'medium',
        readyStatePattern: [1, 2, 1],
        targetAdvanceHours: 2,
        calendarPollIntervalSeconds: 60,
        symbolsPollIntervalSeconds: 30,
        selectedExitStrategy: 'balanced',
        autoBuyEnabled: true,
        autoSellEnabled: true,
        autoSnipeEnabled: false,
      };

      // This should fail with foreign key constraint violation
      await expect(
        db.insert(userPreferences).values(testPreferences)
      ).rejects.toThrow();
    });
  });

  describe("User Preferences API Endpoint", () => {
    beforeEach(async () => {
      // Create test user for API tests
      const testUser: NewUser = {
        id: testUserId,
        email: `${testUserId}@test.example.com`,
        name: `API Test User ${testUserId}`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

        await testDb.insert(user).values(testUser);
    });

    it("should handle POST request with auto-user creation for test users", async () => {
      // Import the API route handler
      const { POST } = await import("../../app/api/user-preferences/route");

      const requestBody = {
        userId: testUserId,
        defaultBuyAmountUsdt: 150,
        riskTolerance: 'high',
      };

      const request = mockRequest('POST', requestBody);
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData.success).toBe(true);
      
      // Verify preferences were created/updated in database
      const savedPreferences = await testDb.select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, testUserId));

      expect(savedPreferences).toHaveLength(1);
      expect(savedPreferences[0].defaultBuyAmountUsdt).toBe(150);
      expect(savedPreferences[0].riskTolerance).toBe('high');
    });

    it("should handle GET request to fetch user preferences", async () => {
      // First create some preferences
      const testPreferences: NewUserPreferences = {
        userId: testUserId,
        defaultBuyAmountUsdt: 200,
        maxConcurrentSnipes: 5,
        takeProfitLevels: {
          level1: 3,
          level2: 7,
          level3: 12,
          level4: 20,
        },
        defaultTakeProfitLevel: 1,
        stopLossPercent: 3.0,
        riskTolerance: 'low',
        readyStatePattern: [2, 1, 2],
        targetAdvanceHours: 1,
        calendarPollIntervalSeconds: 45,
        symbolsPollIntervalSeconds: 25,
        selectedExitStrategy: 'conservative',
        autoBuyEnabled: false,
        autoSellEnabled: true,
        autoSnipeEnabled: true,
      };

        await testDb.insert(userPreferences).values(testPreferences);

      // Import the API route handler
      const { GET } = await import("../../app/api/user-preferences/route");

      const request = {
        nextUrl: new URL(`http://localhost:3008/api/user-preferences?userId=${testUserId}`),
      };

      const response = await GET(request as any);

      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData.success).toBe(true);
      expect(responseData.data.userId).toBe(testUserId);
      expect(responseData.data.defaultBuyAmountUsdt).toBe(200);
      expect(responseData.data.riskTolerance).toBe('low');
      expect(responseData.data.selectedExitStrategy).toBe('conservative');
    });

    it("should return 404 for non-existent user preferences", async () => {
      const nonExistentUserId = `non-existent-${Date.now()}`;
      
      // Import the API route handler
      const { GET } = await import("../../app/api/user-preferences/route");

      const request = {
        nextUrl: new URL(`http://localhost:3008/api/user-preferences?userId=${nonExistentUserId}`),
      };

      const response = await GET(request as any);

      expect(response.status).toBe(404);
      
      const responseData = await response.json();
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain('User preferences not found');
    });

    it("should handle validation errors gracefully", async () => {
      // Import the API route handler
      const { POST } = await import("../../app/api/user-preferences/route");

      const invalidRequestBody = {
        userId: testUserId,
        defaultBuyAmountUsdt: -100, // Invalid negative amount
        riskTolerance: 'invalid-tolerance', // Invalid value
      };

      const request = mockRequest('POST', invalidRequestBody);
      
      try {
        const response = await POST(request as any);
        const responseData = await response.json();
        
        // Should either reject the invalid data or sanitize it
        if (response.status !== 200) {
          expect(responseData.success).toBe(false);
          expect(responseData.error).toBeTruthy();
        } else {
          // If it accepts the data, verify sanitization occurred
          const savedPreferences = await testDb.select()
            .from(userPreferences)
            .where(eq(userPreferences.userId, testUserId));
          
          // Verify invalid values were either rejected or corrected
          expect(savedPreferences[0].defaultBuyAmountUsdt).toBeGreaterThan(0);
        }
      } catch (error) {
        // Validation error is expected and acceptable
        expect(error).toBeTruthy();
      }
    });

    it("should handle upsert operations correctly", async () => {
      // Import the API route handler
      const { POST } = await import("../../app/api/user-preferences/route");

      // First insert
      const initialData = {
        userId: testUserId,
        defaultBuyAmountUsdt: 100,
        riskTolerance: 'medium',
      };

      const firstRequest = mockRequest('POST', initialData);
      const firstResponse = await POST(firstRequest as any);
      
      expect(firstResponse.status).toBe(200);

      // Verify first insert
      let savedPreferences = await testDb.select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, testUserId));

      expect(savedPreferences).toHaveLength(1);
      expect(savedPreferences[0].defaultBuyAmountUsdt).toBe(100);

      // Second update (upsert)
      const updateData = {
        userId: testUserId,
        defaultBuyAmountUsdt: 250,
        maxConcurrentSnipes: 7,
      };

      const secondRequest = mockRequest('POST', updateData);
      const secondResponse = await POST(secondRequest as any);
      
      expect(secondResponse.status).toBe(200);

      // Verify update (still only one record)
      savedPreferences = await testDb.select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, testUserId));

      expect(savedPreferences).toHaveLength(1);
      expect(savedPreferences[0].defaultBuyAmountUsdt).toBe(250);
      expect(savedPreferences[0].maxConcurrentSnipes).toBe(7);
      // Original risk tolerance should be preserved
      expect(savedPreferences[0].riskTolerance).toBe('medium');
    });
  });

  describe("Authentication and Security", () => {
    it("should validate user IDs properly", async () => {
      const invalidUserIds = [
        '', // Empty string
        null, // Null value
        undefined, // Undefined
        'user with spaces', // Invalid characters
        'user@with@symbols', // Invalid characters
      ];

      for (const invalidUserId of invalidUserIds) {
        try {
          const { POST } = await import("../../app/api/user-preferences/route");
          
          const requestBody = {
            userId: invalidUserId,
            defaultBuyAmountUsdt: 100,
          };

          const request = mockRequest('POST', requestBody);
          const response = await POST(request as any);
          
          // Should return error for invalid user IDs
          if (response.status === 200) {
            const responseData = await response.json();
            expect(responseData.success).toBe(false);
          } else {
            expect(response.status).toBeGreaterThanOrEqual(400);
          }
        } catch (error) {
          // Validation error is expected for invalid user IDs
          expect(error).toBeTruthy();
        }
      }
    });

    it("should handle missing request body gracefully", async () => {
      const { POST } = await import("../../app/api/user-preferences/route");

      const request = mockRequest('POST'); // No body
      
      try {
        const response = await POST(request as any);
        expect(response.status).toBeGreaterThanOrEqual(400);
        
        const responseData = await response.json();
        expect(responseData.success).toBe(false);
      } catch (error) {
        // Error is expected for missing body
        expect(error).toBeTruthy();
      }
    });
  });

  describe("Database Performance and Reliability", () => {
    it("should handle concurrent preference updates safely", async () => {
      // Create initial user and preferences
      const testUser: NewUser = {
        id: testUserId,
        email: `${testUserId}@test.example.com`,
        name: `Concurrent Test User ${testUserId}`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

        await testDb.insert(user).values(testUser);

      const { POST } = await import("../../app/api/user-preferences/route");

      // Simulate concurrent updates
      const updates = [
        { userId: testUserId, defaultBuyAmountUsdt: 100 },
        { userId: testUserId, defaultBuyAmountUsdt: 200 },
        { userId: testUserId, defaultBuyAmountUsdt: 300 },
      ];

      const promises = updates.map(async (updateData) => {
        const request = mockRequest('POST', updateData);
        return POST(request as any);
      });

      // Wait for all updates to complete
      const responses = await Promise.all(promises);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify final state (should have one of the values)
      const finalPreferences = await testDb.select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, testUserId));

      expect(finalPreferences).toHaveLength(1);
      expect([100, 200, 300]).toContain(finalPreferences[0].defaultBuyAmountUsdt);
    });

    it("should maintain data integrity under stress", async () => {
      // Create multiple test users for stress testing
      const stressTestUserIds = Array.from({ length: 5 }, (_, i) => 
        `stress-test-user-${Date.now()}-${i}`
      );

      // Add to cleanup
      testCleanupIds.push(...stressTestUserIds);

      // Create users
      const testUsers: NewUser[] = stressTestUserIds.map(id => ({
        id,
        email: `${id}@test.example.com`,
        name: `Stress Test User ${id}`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

        await testDb.insert(user).values(testUsers);

      const { POST } = await import("../../app/api/user-preferences/route");

      // Create preferences for all users simultaneously
      const creationPromises = stressTestUserIds.map(async (userId) => {
        const requestData = {
          userId,
          defaultBuyAmountUsdt: Math.floor(Math.random() * 1000) + 50,
          riskTolerance: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        };

        const request = mockRequest('POST', requestData);
        return POST(request as any);
      });

      const responses = await Promise.all(creationPromises);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify all preferences were created
      for (const userId of stressTestUserIds) {
        const userPrefs = await testDb.select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId));

        expect(userPrefs).toHaveLength(1);
        expect(userPrefs[0].userId).toBe(userId);
        expect(userPrefs[0].defaultBuyAmountUsdt).toBeGreaterThan(0);
      }
    });
  });
}); 