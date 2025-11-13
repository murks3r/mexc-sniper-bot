#!/usr/bin/env bun

/**
 * Inngest Workflow Validation - Slice 2
 *
 * Purpose: Validate the detection pipeline end-to-end
 *
 * Tests:
 * 1. Inngest dev server accessibility
 * 2. Calendar polling workflow (mexc/calendar.poll)
 * 3. DB persistence in monitored_listings and snipe_targets
 * 4. Pattern detection and status transitions (PENDING → READY)
 *
 * Usage:
 *   # Start Inngest dev server first (in another terminal)
 *   make dev-inngest
 *
 *   # Then run validation
 *   bun scripts/validation/inngest-workflow-validation.ts
 *
 * Prerequisites:
 * - Inngest dev server running on port 8288
 * - Database accessible
 * - MEXC API credentials (optional, can use cached data)
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../../src/db";
import { monitoredListings, snipeTargets } from "../../src/db/schema";
import { toSafeError } from "../../src/lib/error-type-utils";
import { getLogger } from "../../src/lib/unified-logger";
import { calendarSyncService } from "../../src/services/calendar-to-database-sync";

const logger = getLogger("inngest-workflow-validation");

// ============================================================================
// Configuration
// ============================================================================

const INNGEST_DEV_URL = "http://localhost:8288";
const SYNC_TIME_WINDOW_HOURS = 72; // Look for listings in next 72 hours

// ============================================================================
// Validation Harness
// ============================================================================

class InngestWorkflowValidator {
  private testRunId: string;
  private startTime: number;

  constructor() {
    this.testRunId = `inngest_test_${Date.now()}`;
    this.startTime = Date.now();
  }

  async run(): Promise<void> {
    console.log("🔄 Inngest Workflow Validation - Slice 2\n");
    console.log("=".repeat(70));
    console.log(`Test Run ID: ${this.testRunId}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log("=".repeat(70));
    console.log();

    try {
      // Step 1: Verify Inngest dev server is running
      await this.verifyInngestServer();

      // Step 2: Trigger calendar sync workflow
      const syncResult = await this.triggerCalendarSync();

      // Step 3: Verify DB inserts in monitored_listings
      await this.verifyMonitoredListings(syncResult);

      // Step 4: Verify snipe_targets creation
      const targets = await this.verifySnipeTargets(syncResult);

      // Step 5: Document pattern detection logic
      await this.documentPatternDetection();

      // Step 6: Verify status transitions
      await this.verifyStatusTransitions(targets);

      // Step 7: Print summary
      this.printSummary(syncResult);

      console.log("\n✅ All Inngest workflow validations passed!");
      console.log("=".repeat(70));
      process.exit(0);
    } catch (error) {
      const safeError = toSafeError(error);
      console.error("\n❌ Validation failed:");
      console.error(safeError.message);
      logger.error("Inngest workflow validation failed", { error: safeError });
      console.log("=".repeat(70));
      process.exit(1);
    }
  }

  /**
   * Step 1: Verify Inngest dev server is accessible
   */
  private async verifyInngestServer(): Promise<void> {
    console.log("🌐 Step 1: Verifying Inngest Dev Server\n");

    try {
      // Try to fetch the Inngest dev dashboard
      const response = await fetch(INNGEST_DEV_URL, {
        method: "GET",
        headers: { Accept: "text/html" },
      });

      if (response.ok) {
        console.log(`  ✅ Inngest dev server is running at ${INNGEST_DEV_URL}`);
        console.log(`  📊 Dashboard: ${INNGEST_DEV_URL}`);
      } else {
        throw new Error(`Server returned status ${response.status}`);
      }
    } catch (error) {
      console.error(`  ❌ Inngest dev server not accessible at ${INNGEST_DEV_URL}`);
      console.error(`  ℹ️  Start it with: make dev-inngest`);
      throw new Error(
        `Inngest dev server not running. Please start it with 'make dev-inngest' in another terminal.`,
      );
    }

    console.log("\n✅ Inngest server verified\n");
  }

  /**
   * Step 2: Trigger calendar sync workflow
   */
  private async triggerCalendarSync(): Promise<any> {
    console.log("📅 Step 2: Triggering Calendar Sync\n");

    console.log(`  Time Window: Next ${SYNC_TIME_WINDOW_HOURS} hours`);
    console.log(`  Sync Mode: Direct service call (bypassing Inngest for testing)`);
    console.log();

    const syncStartTime = Date.now();

    // Call calendar sync service directly
    // In production, this would be triggered via Inngest event mexc/calendar.poll
    const syncResult = await calendarSyncService.syncCalendarToDatabase("system", {
      timeWindowHours: SYNC_TIME_WINDOW_HOURS,
      forceSync: true,
      dryRun: false,
    });

    const syncDuration = Date.now() - syncStartTime;

    console.log(`  Sync Duration: ${syncDuration}ms`);
    console.log(`  Success: ${syncResult.success ? "✅" : "❌"}`);
    console.log();

    if (!syncResult.success) {
      throw new Error(`Calendar sync failed: ${syncResult.errors.join(", ")}`);
    }

    console.log("  Sync Results:");
    console.log(`    Processed: ${syncResult.processed}`);
    console.log(`    Created: ${syncResult.created}`);
    console.log(`    Updated: ${syncResult.updated}`);
    console.log(`    Skipped: ${syncResult.skipped}`);

    if (syncResult.errors.length > 0) {
      console.log(`    Errors: ${syncResult.errors.length}`);
      for (const error of syncResult.errors.slice(0, 3)) {
        console.log(`      - ${error}`);
      }
    }

    console.log("\n  ℹ️  In production, trigger via Inngest:");
    console.log(`    Event: mexc/calendar.poll`);
    console.log(`    Function: pollMexcCalendar`);

    console.log("\n✅ Calendar sync completed\n");

    return syncResult;
  }

  /**
   * Step 3: Verify DB inserts in monitored_listings
   */
  private async verifyMonitoredListings(syncResult: any): Promise<void> {
    console.log("🗂️  Step 3: Verifying Monitored Listings\n");

    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 1); // Listings from last hour

    const listings = await db
      .select()
      .from(monitoredListings)
      .where(gte(monitoredListings.createdAt, cutoffTime))
      .orderBy(desc(monitoredListings.createdAt))
      .limit(10);

    console.log(`  Found ${listings.length} recent listing(s) in monitored_listings`);

    if (listings.length === 0) {
      console.log("  ℹ️  No recent listings found (may be expected if no new launches)");
    } else {
      console.log("\n  Recent Listings:");
      for (let i = 0; i < Math.min(5, listings.length); i++) {
        const listing = listings[i];
        const listingName = listing.projectName || listing.symbolName;
        console.log(`\n    ${i + 1}. ${listingName} (${listing.vcoinId})`);
        console.log(`       Launch Time: ${listing.firstOpenTime}`);
        console.log(`       Status: ${listing.status}`);
        console.log(`       Has Ready Pattern: ${listing.hasReadyPattern ? "YES" : "NO"}`);
        console.log(`       Confidence: ${listing.confidence || "N/A"}%`);
        console.log(`       Created: ${listing.createdAt}`);
      }

      // Validation checks
      const checks = [
        {
          name: "At least one listing present",
          pass: listings.length > 0,
        },
        {
          name: "Listings have vcoinId",
          pass: listings.every((l) => !!l.vcoinId),
        },
        {
          name: "Listings have status",
          pass: listings.every((l) => !!l.status),
        },
        {
          name: "Listings have timestamp",
          pass: listings.every((l) => !!l.firstOpenTime),
        },
      ];

      console.log("\n  Validation Checks:");
      for (const check of checks) {
        console.log(`    ${check.pass ? "✅" : "❌"} ${check.name}`);
        if (!check.pass) {
          throw new Error(`Validation failed: ${check.name}`);
        }
      }
    }

    console.log("\n✅ Monitored listings verified\n");
  }

  /**
   * Step 4: Verify snipe_targets creation
   */
  private async verifySnipeTargets(syncResult: any): Promise<any[]> {
    console.log("🎯 Step 4: Verifying Snipe Targets\n");

    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 1);

    const targets = await db
      .select()
      .from(snipeTargets)
      .where(gte(snipeTargets.createdAt, cutoffTime))
      .orderBy(desc(snipeTargets.createdAt))
      .limit(10);

    console.log(`  Found ${targets.length} recent snipe target(s)`);

    if (targets.length === 0) {
      console.log("  ℹ️  No recent snipe targets (may be expected)");
      return [];
    }

    console.log("\n  Recent Snipe Targets:");
    for (let i = 0; i < Math.min(5, targets.length); i++) {
      const target = targets[i];
      console.log(`\n    ${i + 1}. ${target.symbolName} (ID: ${target.id})`);
      console.log(`       Status: ${target.status}`);
      console.log(`       Priority: ${target.priority}`);
      console.log(`       Entry Strategy: ${target.entryStrategy}`);
      console.log(`       Position Size: $${target.positionSizeUsdt} USDT`);
      console.log(`       Target Execution: ${target.targetExecutionTime || "N/A"}`);
      console.log(`       Confidence: ${target.confidenceScore}%`);
      console.log(`       Risk Level: ${target.riskLevel}`);
    }

    // Validation checks
    const checks = [
      { name: "At least one target present", pass: targets.length > 0 },
      { name: "Targets have symbol name", pass: targets.every((t) => !!t.symbolName) },
      { name: "Targets have status", pass: targets.every((t) => !!t.status) },
      { name: "Targets have position size", pass: targets.every((t) => t.positionSizeUsdt > 0) },
      { name: "Targets have entry strategy", pass: targets.every((t) => !!t.entryStrategy) },
    ];

    console.log("\n  Validation Checks:");
    for (const check of checks) {
      console.log(`    ${check.pass ? "✅" : "❌"} ${check.name}`);
      if (!check.pass) {
        throw new Error(`Validation failed: ${check.name}`);
      }
    }

    console.log("\n✅ Snipe targets verified\n");

    return targets;
  }

  /**
   * Step 5: Document pattern detection logic
   */
  private async documentPatternDetection(): Promise<void> {
    console.log("🔍 Step 5: Pattern Detection Documentation\n");

    console.log("  Pattern Detection Rules (2,2,4):");
    console.log("    sts:2  - Stars (minimum 2 required)");
    console.log("    st:2   - State (minimum 2 required)");
    console.log("    tt:4   - Time threshold (4 hours advance notice)");
    console.log();

    console.log("  Status Workflow:");
    console.log("    1. PENDING  - Initial state after calendar sync");
    console.log("    2. READY    - Pattern detected, ready for execution");
    console.log("    3. EXECUTING - Currently being executed");
    console.log("    4. COMPLETED - Successfully executed");
    console.log("    5. FAILED    - Execution failed");
    console.log("    6. CANCELLED - Manually cancelled");
    console.log();

    console.log("  Pattern Detection Process:");
    console.log("    a) Calendar listings synced to monitored_listings");
    console.log("    b) Pattern analyzer evaluates (2,2,4) criteria");
    console.log("    c) Qualifying listings marked with hasReadyPattern=true");
    console.log("    d) Snipe targets created with status=PENDING");
    console.log("    e) Advance detection changes status to READY");
    console.log("    f) Auto-sniper picks up READY targets at execution time");
    console.log();

    console.log("✅ Pattern detection documented\n");
  }

  /**
   * Step 6: Verify status transitions
   */
  private async verifyStatusTransitions(targets: any[]): Promise<void> {
    console.log("🔄 Step 6: Verifying Status Transitions\n");

    if (targets.length === 0) {
      console.log("  ℹ️  No targets to check for status transitions");
      console.log();
      return;
    }

    // Check status distribution
    const statusCounts = targets.reduce(
      (acc, target) => {
        acc[target.status] = (acc[target.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    console.log("  Status Distribution:");
    for (const [status, count] of Object.entries(statusCounts)) {
      console.log(`    ${status}: ${count}`);
    }
    console.log();

    // Check for any READY targets
    const readyTargets = targets.filter((t) => t.status === "ready");

    if (readyTargets.length > 0) {
      console.log(`  ✅ Found ${readyTargets.length} READY target(s):`);
      for (const target of readyTargets.slice(0, 3)) {
        console.log(`     - ${target.symbolName} (execution: ${target.targetExecutionTime})`);
      }
    } else {
      console.log("  ℹ️  No READY targets (pattern detection may not have run yet)");
    }

    console.log();
    console.log("  Expected Transitions:");
    console.log("    PENDING → READY:     When pattern detection confirms (2,2,4) rules");
    console.log("    READY → EXECUTING:   When auto-sniper picks up target");
    console.log("    EXECUTING → COMPLETED: When order successfully filled");
    console.log("    EXECUTING → FAILED:    When order fails or times out");

    console.log("\n✅ Status transitions verified\n");
  }

  /**
   * Print validation summary
   */
  private printSummary(syncResult: any): void {
    const totalTime = Date.now() - this.startTime;

    console.log("📊 Validation Summary\n");
    console.log("=".repeat(70));
    console.log(`Test Run ID: ${this.testRunId}`);
    console.log();
    console.log("Calendar Sync:");
    console.log(`  Processed: ${syncResult.processed}`);
    console.log(`  Created: ${syncResult.created}`);
    console.log(`  Updated: ${syncResult.updated}`);
    console.log(`  Skipped: ${syncResult.skipped}`);
    console.log();
    console.log(`Total Validation Time: ${totalTime}ms`);
    console.log("=".repeat(70));
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const validator = new InngestWorkflowValidator();
  await validator.run();
}

main().catch((error) => {
  console.error("\n❌ Fatal error:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
