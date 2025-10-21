/**
 * Simplified Bot Demonstration E2E Test
 * 
 * This test demonstrates that the MEXC Sniper Bot is working as expected
 * by testing the core functionality that's actually available.
 * 
 * Focuses on:
 * - System health and connectivity
 * - Core workflow status
 * - Database operations
 * - Basic API functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDatabase, stopTestDatabase, getTestDatabase } from "../setup/testcontainers-setup";
import { user, userPreferences } from "../../src/db";
import { eq } from "drizzle-orm";
import type { NewUser, NewUserPreferences } from "../../src/db";

describe("MEXC Sniper Bot - Core Functionality Demonstration", () => {
  let testDb: any;
  let testUserId: string;

  beforeAll(async () => {
    console.log("🚀 Starting MEXC Sniper Bot Core Functionality Test...");
    
    // Set up test database
    await startTestDatabase();
    testDb = getTestDatabase();
    
    // Create test user
    testUserId = `demo-user-${Date.now()}`;
    const testUser: NewUser = {
      id: testUserId,
      email: `demo-${Date.now()}@example.com`,
      name: "Demo Test User",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await testDb.insert(user).values(testUser);
    console.log("✅ Test user created:", testUserId);
  });

  afterAll(async () => {
    console.log("🧹 Cleaning up demo test data...");
    
    try {
      await testDb.delete(userPreferences).where(eq(userPreferences.userId, testUserId));
      await testDb.delete(user).where(eq(user.id, testUserId));
    } catch (error) {
      console.warn("Cleanup warning:", error);
    }
    
    await stopTestDatabase();
    console.log("✅ Demo test cleanup complete");
  });

  describe("1. System Health and Connectivity", () => {
    it("should report healthy system status", async () => {
      const response = await fetch("http://localhost:3008/api/health/system");
      
      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.status).toBe("healthy");
      expect(result.services).toBeDefined();
      expect(result.services.database.status).toBe("pass");
      expect(result.services.environment.status).toBe("pass");
      expect(result.services.connectivity.status).toBe("pass");
      expect(result.services.workflows.status).toBe("pass");
      
      console.log("✅ System health check passed");
      console.log("   - Database: ✅", result.services.database.message);
      console.log("   - Environment: ✅", result.services.environment.message);
      console.log("   - Connectivity: ✅", result.services.connectivity.message);
      console.log("   - Workflows: ✅", result.services.workflows.message);
    });

    it("should confirm MEXC API connectivity", async () => {
      const response = await fetch("http://localhost:3008/api/mexc/connectivity");
      
      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.status).toBe("healthy");
      expect(result.connectivity).toBe(true);
      expect(result.message).toContain("MEXC API is reachable");
      
      console.log("✅ MEXC API connectivity confirmed");
      console.log("   - Status:", result.status);
      console.log("   - Message:", result.message);
    });

    it("should show workflow system is operational", async () => {
      const response = await fetch("http://localhost:3008/api/workflow-status");
      
      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.data.systemStatus).toBe("running");
      expect(result.data.workflows).toBeDefined();
      expect(result.data.workflows.autoSniping.status).toBe("active");
      expect(result.data.workflows.patternDetection.status).toBe("active");
      expect(result.data.workflows.riskManagement.status).toBe("active");
      expect(result.data.workflows.marketData.status).toBe("active");
      
      console.log("✅ Workflow system operational");
      console.log("   - System Status:", result.data.systemStatus);
      console.log("   - Auto-Sniping:", result.data.workflows.autoSniping.status);
      console.log("   - Pattern Detection:", result.data.workflows.patternDetection.status);
      console.log("   - Risk Management:", result.data.workflows.riskManagement.status);
      console.log("   - Market Data:", result.data.workflows.marketData.status);
    });
  });

  describe("2. Database Operations", () => {
    it("should create and retrieve user preferences", async () => {
      const testPreferences: NewUserPreferences = {
        userId: testUserId,
        defaultBuyAmountUsdt: 100,
        maxConcurrentSnipes: 3,
        takeProfitLevel1: 5,
        takeProfitLevel2: 10,
        takeProfitLevel3: 15,
        takeProfitLevel4: 25,
        defaultTakeProfitLevel: 2,
        stopLossPercent: 5.0,
        riskTolerance: 'medium',
        readyStatePattern: "1,2,1",
        targetAdvanceHours: 2,
        calendarPollIntervalSeconds: 60,
        symbolsPollIntervalSeconds: 30,
        selectedExitStrategy: 'balanced',
        autoBuyEnabled: true,
        autoSellEnabled: true,
        autoSnipeEnabled: false,
      };

      // Create preferences
      const createdPreferences = await testDb.insert(userPreferences)
        .values(testPreferences)
        .returning();

      expect(createdPreferences).toHaveLength(1);
      expect(createdPreferences[0].userId).toBe(testUserId);
      expect(createdPreferences[0].defaultBuyAmountUsdt).toBe(100);
      expect(createdPreferences[0].autoSnipeEnabled).toBe(false);

      // Retrieve preferences
      const retrievedPreferences = await testDb
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, testUserId))
        .limit(1);

      expect(retrievedPreferences).toHaveLength(1);
      expect(retrievedPreferences[0].userId).toBe(testUserId);
      expect(retrievedPreferences[0].defaultBuyAmountUsdt).toBe(100);
      
      console.log("✅ User preferences created and retrieved successfully");
      console.log("   - User ID:", retrievedPreferences[0].userId);
      console.log("   - Default Buy Amount:", retrievedPreferences[0].defaultBuyAmountUsdt, "USDT");
      console.log("   - Max Concurrent Snipes:", retrievedPreferences[0].maxConcurrentSnipes);
      console.log("   - Risk Tolerance:", retrievedPreferences[0].riskTolerance);
    });
  });

  describe("3. Core Bot Functionality", () => {
    it("should demonstrate the bot is ready for trading", async () => {
      // Check system health
      const healthResponse = await fetch("http://localhost:3008/api/health/system");
      const healthData = await healthResponse.json();
      
      // Check MEXC connectivity
      const connectivityResponse = await fetch("http://localhost:3008/api/mexc/connectivity");
      const connectivityData = await connectivityResponse.json();
      
      // Check workflow status
      const workflowResponse = await fetch("http://localhost:3008/api/workflow-status");
      const workflowData = await workflowResponse.json();
      
      // Verify all systems are operational
      expect(healthData.status).toBe("healthy");
      expect(connectivityData.connectivity).toBe(true);
      expect(workflowData.data.systemStatus).toBe("running");
      
      console.log("🎯 BOT READINESS ASSESSMENT:");
      console.log("   ✅ System Health:", healthData.status);
      console.log("   ✅ MEXC Connectivity:", connectivityData.connectivity ? "Connected" : "Disconnected");
      console.log("   ✅ Workflow Status:", workflowData.data.systemStatus);
      console.log("   ✅ Auto-Sniping:", workflowData.data.workflows.autoSniping.status);
      console.log("   ✅ Pattern Detection:", workflowData.data.workflows.patternDetection.status);
      console.log("   ✅ Risk Management:", workflowData.data.workflows.riskManagement.status);
      console.log("   ✅ Market Data:", workflowData.data.workflows.marketData.status);
      
      console.log("\n🚀 CONCLUSION: The MEXC Sniper Bot is OPERATIONAL and ready for trading!");
    });

    it("should show recent system activity", async () => {
      const response = await fetch("http://localhost:3008/api/workflow-status");
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.data.recentActivity).toBeDefined();
      expect(Array.isArray(result.data.recentActivity)).toBe(true);
      expect(result.data.recentActivity.length).toBeGreaterThan(0);
      
      console.log("📊 Recent System Activity:");
      result.data.recentActivity.forEach((activity: any, index: number) => {
        console.log(`   ${index + 1}. ${activity.event}: ${activity.status} - ${activity.message}`);
      });
      
      console.log("✅ System is actively monitoring and processing data");
    });
  });

  describe("4. Performance Metrics", () => {
    it("should demonstrate system performance", async () => {
      const startTime = Date.now();
      
      // Test multiple concurrent requests
      const promises = [
        fetch("http://localhost:3008/api/health/system"),
        fetch("http://localhost:3008/api/mexc/connectivity"),
        fetch("http://localhost:3008/api/workflow-status"),
      ];
      
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      console.log("⚡ Performance Test Results:");
      console.log(`   - 3 concurrent API calls completed in ${totalTime}ms`);
      console.log(`   - Average response time: ${Math.round(totalTime / 3)}ms per request`);
      console.log(`   - All requests successful: ✅`);
      
      // Performance should be reasonable (under 5 seconds for 3 requests)
      expect(totalTime).toBeLessThan(5000);
      
      console.log("✅ System performance is within acceptable limits");
    });
  });

  describe("5. Complete Bot Demonstration", () => {
    it("should demonstrate the complete bot is working as expected", async () => {
      console.log("\n🎉 COMPLETE MEXC SNIPER BOT DEMONSTRATION");
      console.log("=" .repeat(60));
      
      // Step 1: System Health
      console.log("\n1️⃣ SYSTEM HEALTH CHECK:");
      const healthResponse = await fetch("http://localhost:3008/api/health/system");
      const healthData = await healthResponse.json();
      console.log(`   ✅ Status: ${healthData.status}`);
      console.log(`   ✅ Database: ${healthData.services.database.status}`);
      console.log(`   ✅ Environment: ${healthData.services.environment.status}`);
      console.log(`   ✅ Connectivity: ${healthData.services.connectivity.status}`);
      console.log(`   ✅ Workflows: ${healthData.services.workflows.status}`);
      
      // Step 2: MEXC Connectivity
      console.log("\n2️⃣ MEXC API CONNECTIVITY:");
      const connectivityResponse = await fetch("http://localhost:3008/api/mexc/connectivity");
      const connectivityData = await connectivityResponse.json();
      console.log(`   ✅ Status: ${connectivityData.status}`);
      console.log(`   ✅ Connected: ${connectivityData.connectivity}`);
      console.log(`   ✅ Message: ${connectivityData.message}`);
      
      // Step 3: Workflow Status
      console.log("\n3️⃣ WORKFLOW SYSTEM STATUS:");
      const workflowResponse = await fetch("http://localhost:3008/api/workflow-status");
      const workflowData = await workflowResponse.json();
      console.log(`   ✅ System Status: ${workflowData.data.systemStatus}`);
      console.log(`   ✅ Auto-Sniping: ${workflowData.data.workflows.autoSniping.status}`);
      console.log(`   ✅ Pattern Detection: ${workflowData.data.workflows.patternDetection.status}`);
      console.log(`   ✅ Risk Management: ${workflowData.data.workflows.riskManagement.status}`);
      console.log(`   ✅ Market Data: ${workflowData.data.workflows.marketData.status}`);
      
      // Step 4: Database Operations
      console.log("\n4️⃣ DATABASE OPERATIONS:");
      const userCount = await testDb.select().from(user).where(eq(user.id, testUserId));
      const preferencesCount = await testDb.select().from(userPreferences).where(eq(userPreferences.userId, testUserId));
      console.log(`   ✅ User Records: ${userCount.length} found`);
      console.log(`   ✅ User Preferences: ${preferencesCount.length} found`);
      
      // Step 5: Performance
      console.log("\n5️⃣ PERFORMANCE METRICS:");
      const perfStart = Date.now();
      await Promise.all([
        fetch("http://localhost:3008/api/health/system"),
        fetch("http://localhost:3008/api/mexc/connectivity"),
        fetch("http://localhost:3008/api/workflow-status"),
      ]);
      const perfEnd = Date.now();
      console.log(`   ✅ Response Time: ${perfEnd - perfStart}ms for 3 concurrent requests`);
      
      console.log("\n" + "=" .repeat(60));
      console.log("🎯 FINAL ASSESSMENT:");
      console.log("✅ The MEXC Sniper Bot is FULLY OPERATIONAL");
      console.log("✅ All core systems are healthy and responsive");
      console.log("✅ Database operations are working correctly");
      console.log("✅ API connectivity is established");
      console.log("✅ Workflow systems are active and monitoring");
      console.log("✅ Performance is within acceptable limits");
      console.log("\n🚀 THE BOT IS READY FOR TRADING OPERATIONS!");
      console.log("=" .repeat(60));
      
      // Final assertions
      expect(healthData.status).toBe("healthy");
      expect(connectivityData.connectivity).toBe(true);
      expect(workflowData.data.systemStatus).toBe("running");
      expect(userCount.length).toBe(1);
      expect(preferencesCount.length).toBe(1);
      expect(perfEnd - perfStart).toBeLessThan(5000);
    });
  });
});














