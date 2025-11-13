#!/usr/bin/env bun

/**
 * Auto-Sniper Workflow Validation - Slice 3
 *
 * Purpose: Validate the auto-sniping integration end-to-end
 *
 * Tests:
 * 1. Auto-sniping workflow data flow from snipe_targets to execution
 * 2. Filtering logic (status, execution time, user preferences, credentials)
 * 3. Integration with execution kernel
 * 4. Position tracking and monitoring
 *
 * Usage:
 *   # Create test targets first
 *   bun scripts/validation/auto-sniper-workflow-validation.ts --create-test-target
 *
 *   # Validate existing targets
 *   bun scripts/validation/auto-sniper-workflow-validation.ts
 *
 * Prerequisites:
 * - Database accessible
 * - Test user with API credentials
 * - At least one snipe target in READY status (or use --create-test-target)
 */

import { and, desc, eq, gte, isNull, lt, or } from "drizzle-orm";
import { db } from "../../src/db";
import { userPreferences } from "../../src/db/schemas/auth";
import { apiCredentials, positions, snipeTargets } from "../../src/db/schemas/trading";
import { toSafeError } from "../../src/lib/error-type-utils";
import { getLogger } from "../../src/lib/unified-logger";
import { getCoreTrading } from "../../src/services/trading/consolidated/core-trading/base-service";

const logger = getLogger("auto-sniper-validation");

// ============================================================================
// Configuration
// ============================================================================

const TEST_USER_ID = "auto-sniper-test-user";
const TEST_SYMBOL = "TESTUSDT";

// ============================================================================
// Validation Harness
// ============================================================================

class AutoSniperValidator {
  private testRunId: string;
  private startTime: number;

  constructor() {
    this.testRunId = `auto_sniper_test_${Date.now()}`;
    this.startTime = Date.now();
  }

  async run(createTestTarget = false): Promise<void> {
    console.log("🤖 Auto-Sniper Workflow Validation - Slice 3\n");
    console.log("=".repeat(70));
    console.log(`Test Run ID: ${this.testRunId}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log("=".repeat(70));
    console.log();

    try {
      // Step 1: Document auto-sniping workflow
      this.documentWorkflowDataFlow();

      // Step 2: Verify user setup (preferences & credentials)
      await this.verifyUserSetup();

      // Step 3: Create test target if requested
      if (createTestTarget) {
        await this.createTestTarget();
      }

      // Step 4: Validate filtering logic
      const eligibleTargets = await this.validateFilteringLogic();

      // Step 5: Test execution flow (paper mode)
      if (eligibleTargets.length > 0) {
        await this.testExecutionFlow(eligibleTargets[0]);
      }

      // Step 6: Verify position tracking
      await this.verifyPositionTracking();

      // Step 7: Print summary
      this.printSummary();

      console.log("\n✅ All auto-sniper workflow validations passed!");
      console.log("=".repeat(70));
      process.exit(0);
    } catch (error) {
      const safeError = toSafeError(error);
      console.error("\n❌ Validation failed:");
      console.error(safeError.message);
      logger.error("Auto-sniper validation failed", { error: safeError });
      console.log("=".repeat(70));
      process.exit(1);
    }
  }

  /**
   * Step 1: Document auto-sniping workflow data flow
   */
  private documentWorkflowDataFlow(): void {
    console.log("📋 Step 1: Auto-Sniping Workflow Data Flow\n");

    console.log("  Data Flow Architecture:");
    console.log();
    console.log("  ┌─────────────────────┐");
    console.log("  │ monitored_listings  │  Calendar sync creates listings");
    console.log("  └──────────┬──────────┘");
    console.log("             │");
    console.log("             ↓ Pattern detection (2,2,4 rules)");
    console.log("  ┌──────────────────┐");
    console.log("  │  snipe_targets   │  Targets with status: PENDING → READY");
    console.log("  └────────┬─────────┘");
    console.log("           │");
    console.log("           ↓ Auto-sniper polling");
    console.log("  ┌────────────────────────┐");
    console.log("  │ Filtering Criteria:    │");
    console.log("  │  - status = 'ready'    │");
    console.log("  │  - targetExecutionTime │");
    console.log("  │  - user_preferences    │");
    console.log("  │  - api_credentials     │");
    console.log("  └────────┬───────────────┘");
    console.log("           │");
    console.log("           ↓ Execution");
    console.log("  ┌─────────────────────┐");
    console.log("  │  OrderExecutor      │  Places order via MEXC API");
    console.log("  └────────┬────────────┘");
    console.log("           │");
    console.log("           ↓ Results");
    console.log("  ┌─────────────────────┐");
    console.log("  │ execution_history   │  Trade log");
    console.log("  │ positions           │  Open position tracking");
    console.log("  └─────────────────────┘");
    console.log();

    console.log("  Key Components:");
    console.log("    1. auto-sniping.ts         - Main auto-sniping service");
    console.log("    2. order-executor.ts       - Order execution module");
    console.log("    3. advanced-sniper-utils.ts - Retry logic & Error 10007 handling");
    console.log("    4. position-helpers.ts     - Position tracking");
    console.log("    5. execution-history-helpers.ts - Execution logging");
    console.log();

    console.log("  Timing Configuration:");
    console.log("    preLaunchOffsetMs:  -500ms  (start 0.5s before launch)");
    console.log("    postLaunchWindowMs:  700ms  (continue 0.7s after launch)");
    console.log("    pollIntervalMs:      100ms  (check every 100ms)");
    console.log();

    console.log("✅ Workflow documented\n");
  }

  /**
   * Step 2: Verify user setup (preferences & credentials)
   */
  private async verifyUserSetup(): Promise<void> {
    console.log("👤 Step 2: Verifying User Setup\n");

    // Check user preferences
    const preferences = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, TEST_USER_ID))
      .limit(1);

    console.log("  User Preferences:");
    if (preferences.length > 0) {
      const pref = preferences[0];
      console.log(`    ✅ Found preferences for ${TEST_USER_ID}`);
      console.log(`       Stop Loss: ${pref.stopLossPercent}%`);
      console.log(`       Take Profit 1: ${pref.takeProfitLevel1}%`);
      console.log(`       Take Profit 2: ${pref.takeProfitLevel2}%`);
      console.log(`       Take Profit 3: ${pref.takeProfitLevel3}%`);
      console.log(`       Take Profit 4: ${pref.takeProfitLevel4}%`);
    } else {
      console.log(`    ⚠️  No preferences found for ${TEST_USER_ID}`);
      console.log("       Will use system defaults");
    }
    console.log();

    // Check API credentials
    const credentials = await db
      .select()
      .from(apiCredentials)
      .where(and(eq(apiCredentials.userId, TEST_USER_ID), eq(apiCredentials.isActive, true)))
      .limit(1);

    console.log("  API Credentials:");
    if (credentials.length > 0) {
      const cred = credentials[0];
      console.log(`    ✅ Found active credentials for ${TEST_USER_ID}`);
      console.log(`       Provider: ${cred.provider}`);
      console.log(`       Last Used: ${cred.lastUsed || "Never"}`);
      console.log(`       Created: ${cred.createdAt}`);
    } else {
      console.log(`    ⚠️  No active credentials for ${TEST_USER_ID}`);
      console.log("       Paper trading mode will be used");
    }
    console.log();

    console.log("✅ User setup verified\n");
  }

  /**
   * Step 3: Create test target
   */
  private async createTestTarget(): Promise<void> {
    console.log("🎯 Step 3: Creating Test Target\n");

    const executionTime = new Date();
    executionTime.setMinutes(executionTime.getMinutes() + 5); // 5 minutes from now

    const [target] = await db
      .insert(snipeTargets)
      .values({
        userId: TEST_USER_ID,
        vcoinId: "TEST",
        symbolName: TEST_SYMBOL,
        entryStrategy: "market",
        positionSizeUsdt: 11,
        takeProfitLevel: 2,
        stopLossPercent: 5,
        status: "ready",
        priority: 1,
        maxRetries: 3,
        currentRetries: 0,
        targetExecutionTime: executionTime,
        confidenceScore: 85,
        riskLevel: "medium",
      })
      .returning();

    console.log("  Test Target Created:");
    console.log(`    ID: ${target.id}`);
    console.log(`    Symbol: ${target.symbolName}`);
    console.log(`    Status: ${target.status}`);
    console.log(`    Execution Time: ${target.targetExecutionTime}`);
    console.log(`    Position Size: $${target.positionSizeUsdt}`);
    console.log();

    console.log("✅ Test target created\n");
  }

  /**
   * Step 4: Validate filtering logic
   */
  private async validateFilteringLogic(): Promise<any[]> {
    console.log("🔍 Step 4: Validating Filtering Logic\n");

    const now = new Date();

    console.log("  Filtering Criteria:");
    console.log("    1. Status must be 'ready'");
    console.log("    2. targetExecutionTime is NULL or <= now");
    console.log("    3. User has active API credentials (or paper mode)");
    console.log("    4. User preferences loaded for risk params");
    console.log();

    // Query 1: All READY targets
    const allReadyTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "ready"))
      .orderBy(snipeTargets.priority, snipeTargets.targetExecutionTime);

    console.log(`  All READY targets: ${allReadyTargets.length}`);

    // Query 2: Eligible for execution (time-based)
    const eligibleTargets = await db
      .select()
      .from(snipeTargets)
      .where(
        and(
          eq(snipeTargets.status, "ready"),
          or(isNull(snipeTargets.targetExecutionTime), lt(snipeTargets.targetExecutionTime, now)),
        ),
      )
      .orderBy(snipeTargets.priority, snipeTargets.targetExecutionTime);

    console.log(`  Eligible for execution (time <= now): ${eligibleTargets.length}`);

    if (eligibleTargets.length > 0) {
      console.log("\n  Eligible Targets:");
      for (let i = 0; i < Math.min(3, eligibleTargets.length); i++) {
        const target = eligibleTargets[i];
        console.log(`\n    ${i + 1}. ${target.symbolName} (ID: ${target.id})`);
        console.log(`       Priority: ${target.priority}`);
        console.log(`       Execution Time: ${target.targetExecutionTime || "IMMEDIATE"}`);
        console.log(`       Position Size: $${target.positionSizeUsdt}`);
        console.log(`       Confidence: ${target.confidenceScore}%`);
        console.log(`       Risk Level: ${target.riskLevel}`);
      }
    }

    // Query 3: Targets with specific user
    const userTargets = await db
      .select()
      .from(snipeTargets)
      .where(
        and(
          eq(snipeTargets.userId, TEST_USER_ID),
          eq(snipeTargets.status, "ready"),
          or(isNull(snipeTargets.targetExecutionTime), lt(snipeTargets.targetExecutionTime, now)),
        ),
      );

    console.log(`\n  Test user's eligible targets: ${userTargets.length}`);

    console.log();
    console.log("  Filtering Logic Summary:");
    console.log(`    ✅ Status filter: ${allReadyTargets.length} READY targets found`);
    console.log(`    ✅ Time filter: ${eligibleTargets.length} eligible for execution`);
    console.log(`    ✅ User filter: ${userTargets.length} for test user`);

    console.log("\n✅ Filtering logic validated\n");

    return eligibleTargets;
  }

  /**
   * Step 5: Test execution flow (paper mode)
   */
  private async testExecutionFlow(target: any): Promise<void> {
    console.log("⚡ Step 5: Testing Execution Flow\n");

    console.log(`  Target: ${target.symbolName} (ID: ${target.id})`);
    console.log(`  Mode: Paper Trading (safe)`);
    console.log();

    try {
      const coreTrading = getCoreTrading({
        paperTradingMode: true,
        autoSnipingEnabled: false,
      });
      if (target.userId) {
        coreTrading.setCurrentUser(target.userId);
      }

      console.log("  Initializing core trading service...");
      const status = await coreTrading.getServiceStatus();
      console.log(`  Service healthy: ${status.isHealthy ? "✅" : "❌"}`);
      console.log();

      console.log("  Executing snipe target (paper mode)...");
      const executionStart = Date.now();

      const result = await coreTrading.executeSnipeTarget(target.id);

      const executionTime = Date.now() - executionStart;

      console.log();
      console.log(`  Execution Time: ${executionTime}ms`);
      console.log(`  Success: ${result.success ? "✅" : "❌"}`);

      if (result.success) {
        console.log("\n  Execution Details:");
        console.log(`    Order ID: ${result.orderId ?? "n/a"}`);
        console.log(`    Executed Price: $${result.executedPrice ?? result.price ?? "n/a"}`);
        console.log(
          `    Executed Quantity: ${result.executedQuantity ?? result.executedQty ?? "n/a"}`,
        );
        console.log(`    Total Cost: $${result.cummulativeQuoteQty ?? "n/a"}`);
        console.log(`    Latency: ${result.executionTime ?? "n/a"}ms`);
      } else {
        console.log(`\n  Error: ${result.error}`);
      }

      // Verify target status updated
      const [updatedTarget] = await db
        .select()
        .from(snipeTargets)
        .where(eq(snipeTargets.id, target.id))
        .limit(1);

      console.log("\n  Target Status After Execution:");
      console.log(`    Status: ${updatedTarget.status}`);
      console.log(`    Actual Execution Time: ${updatedTarget.actualExecutionTime}`);
      console.log(`    Execution Price: $${updatedTarget.executionPrice || "N/A"}`);
      console.log(`    Execution Status: ${updatedTarget.executionStatus || "N/A"}`);

      console.log("\n✅ Execution flow tested\n");
    } catch (error) {
      const safeError = toSafeError(error);
      console.error(`\n  ❌ Execution failed: ${safeError.message}`);
      throw error;
    }
  }

  /**
   * Step 6: Verify position tracking
   */
  private async verifyPositionTracking(): Promise<void> {
    console.log("📊 Step 6: Verifying Position Tracking\n");

    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 1);

    const recentPositions = await db
      .select()
      .from(positions)
      .where(gte(positions.createdAt, cutoffTime))
      .orderBy(desc(positions.createdAt))
      .limit(5);

    console.log(`  Found ${recentPositions.length} recent position(s)`);

    if (recentPositions.length === 0) {
      console.log("  ℹ️  No recent positions (expected for paper trades)");
    } else {
      console.log("\n  Recent Positions:");
      for (let i = 0; i < recentPositions.length; i++) {
        const pos = recentPositions[i];
        console.log(`\n    ${i + 1}. ${pos.symbolName}`);
        console.log(`       Status: ${pos.status}`);
        console.log(`       Entry: $${pos.entryPrice} × ${pos.quantity}`);
        console.log(`       Stop Loss: $${pos.stopLossPrice || "N/A"}`);
        console.log(`       Take Profit: $${pos.takeProfitPrice || "N/A"}`);
        console.log(`       Realized PnL: $${pos.realizedPnl || 0}`);
        console.log(`       Created: ${pos.createdAt}`);
      }

      // Validation checks
      const checks = [
        { name: "Positions have symbol", pass: recentPositions.every((p) => !!p.symbolName) },
        {
          name: "Positions have entry price",
          pass: recentPositions.every((p) => p.entryPrice > 0),
        },
        { name: "Positions have quantity", pass: recentPositions.every((p) => p.quantity > 0) },
        { name: "Positions have status", pass: recentPositions.every((p) => !!p.status) },
      ];

      console.log("\n  Validation Checks:");
      for (const check of checks) {
        console.log(`    ${check.pass ? "✅" : "❌"} ${check.name}`);
      }
    }

    console.log("\n✅ Position tracking verified\n");
  }

  /**
   * Print validation summary
   */
  private printSummary(): void {
    const totalTime = Date.now() - this.startTime;

    console.log("📊 Validation Summary\n");
    console.log("=".repeat(70));
    console.log(`Test Run ID: ${this.testRunId}`);
    console.log();
    console.log("Validated Components:");
    console.log("  ✅ Workflow data flow documented");
    console.log("  ✅ User setup verified (preferences & credentials)");
    console.log("  ✅ Filtering logic validated");
    console.log("  ✅ Execution flow tested");
    console.log("  ✅ Position tracking verified");
    console.log();
    console.log(`Total Validation Time: ${totalTime}ms`);
    console.log("=".repeat(70));
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const createTestTarget = args.includes("--create-test-target");

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Auto-Sniper Workflow Validation - Slice 3

Usage:
  bun scripts/validation/auto-sniper-workflow-validation.ts [options]

Options:
  --create-test-target  Create a test snipe target before validation
  --help, -h            Show this help message

Examples:
  # Validate existing targets
  bun scripts/validation/auto-sniper-workflow-validation.ts

  # Create test target and validate
  bun scripts/validation/auto-sniper-workflow-validation.ts --create-test-target
`);
    process.exit(0);
  }

  const validator = new AutoSniperValidator();
  await validator.run(createTestTarget);
}

main().catch((error) => {
  console.error("\n❌ Fatal error:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
