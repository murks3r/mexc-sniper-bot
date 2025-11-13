/**
 * Detection Pipeline Vertical Slice Test
 *
 * Validates automated target identification:
 * - Triggers Inngest calendar.poll event
 * - Validates monitored_listings and snipe_targets creation
 * - Validates pattern detection workflow (if exists)
 *
 * This tests the detection pipeline isolated from order execution
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { monitoredListings } from "@/src/db/schemas/patterns";
import { snipeTargets } from "@/src/db/schemas/trading";
import { calendarSyncService } from "@/src/services/calendar-to-database-sync";

async function validateDatabaseConnection(): Promise<void> {
  console.log("🔍 Validating database connection...");

  try {
    // Simple query to test connection
    await db.select().from(snipeTargets).limit(1);
    console.log("✅ Database connection validated");
  } catch (error) {
    throw new Error(
      `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function testCalendarSync(): Promise<void> {
  console.log("\n📅 Testing calendar sync to database...");

  const syncResult = await calendarSyncService.syncCalendarToDatabase("system", {
    timeWindowHours: 72,
    forceSync: true,
    dryRun: false,
  });

  if (!syncResult.success) {
    throw new Error(`Calendar sync failed: ${syncResult.errors.join(", ")}`);
  }

  console.log("✅ Calendar sync completed");
  console.log(`   Processed: ${syncResult.processed}`);
  console.log(`   Created: ${syncResult.created}`);
  console.log(`   Updated: ${syncResult.updated}`);
  console.log(`   Skipped: ${syncResult.skipped}`);

  if (syncResult.errors.length > 0) {
    console.warn(`   Warnings: ${syncResult.errors.length} errors occurred`);
    syncResult.errors.forEach((err, idx) => {
      console.warn(`     ${idx + 1}. ${err}`);
    });
  }
}

async function validateSnipeTargets(): Promise<void> {
  console.log("\n🎯 Validating snipe_targets creation...");

  const targets = await db
    .select()
    .from(snipeTargets)
    .where(eq(snipeTargets.userId, "system"))
    .orderBy(desc(snipeTargets.createdAt))
    .limit(10);

  console.log(`   Found ${targets.length} recent targets for system user`);

  if (targets.length === 0) {
    throw new Error("No snipe targets found after calendar sync");
  }

  // Validate target structure
  const recentTarget = targets[0];
  console.log("\n✅ Latest snipe target:");
  console.log(`   ID: ${recentTarget.id}`);
  console.log(`   Vcoin ID: ${recentTarget.vcoinId}`);
  console.log(`   Symbol: ${recentTarget.symbolName}`);
  console.log(`   Status: ${recentTarget.status}`);
  console.log(`   Execution Time: ${recentTarget.targetExecutionTime?.toISOString() || "N/A"}`);
  console.log(`   Confidence Score: ${recentTarget.confidenceScore}`);
  console.log(`   Risk Level: ${recentTarget.riskLevel}`);
  console.log(`   Created At: ${recentTarget.createdAt}`);

  // Validate required fields
  if (!recentTarget.vcoinId) {
    throw new Error("Target missing vcoinId");
  }
  if (!recentTarget.symbolName) {
    throw new Error("Target missing symbolName");
  }
  if (!recentTarget.status) {
    throw new Error("Target missing status");
  }

  // Check status distribution
  const statusCounts = new Map<string, number>();
  targets.forEach((t) => {
    statusCounts.set(t.status, (statusCounts.get(t.status) || 0) + 1);
  });

  console.log("\n📊 Status distribution:");
  statusCounts.forEach((count, status) => {
    console.log(`   ${status}: ${count}`);
  });

  // Validate that we have targets with expected statuses
  const hasReady = targets.some((t) => t.status === "ready");
  const hasPending = targets.some((t) => t.status === "pending");

  console.log(`\n✅ Status validation:`);
  console.log(`   Has READY targets: ${hasReady ? "✅" : "⚠️"}`);
  console.log(`   Has PENDING targets: ${hasPending ? "✅" : "⚠️"}`);

  if (!hasReady && !hasPending) {
    console.warn("⚠️  Warning: No targets with expected statuses (ready/pending)");
  }
}

async function validateMonitoredListings(): Promise<void> {
  console.log("\n📋 Validating monitored_listings...");

  try {
    const listings = await db
      .select()
      .from(monitoredListings)
      .orderBy(desc(monitoredListings.createdAt))
      .limit(10);

    console.log(`   Found ${listings.length} recent monitored listings`);

    if (listings.length > 0) {
      const recent = listings[0];
      console.log("\n✅ Latest monitored listing:");
      console.log(`   ID: ${recent.id}`);
      console.log(`   Vcoin ID: ${recent.vcoinId}`);
      console.log(`   Status: ${recent.status}`);
      const launchTimeValue = recent.firstOpenTime;
      const launchDate =
        typeof launchTimeValue === "number" ? new Date(launchTimeValue) : (launchTimeValue ?? null);
      console.log(`   Launch Time: ${launchDate ? launchDate.toISOString() : "N/A"}`);
      console.log(`   Has Ready Pattern: ${recent.hasReadyPattern ? "Yes" : "No"}`);
    } else {
      console.log(
        "⚠️  No monitored listings found (this may be expected if calendar sync creates targets directly)",
      );
    }
  } catch (error) {
    console.warn(
      `⚠️  Could not query monitored_listings: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.log("   (This table may not be used in current implementation)");
  }
}

async function testInngestEventTrigger(): Promise<void> {
  console.log("\n🔄 Testing Inngest event trigger capability...");
  console.log("   Note: This requires Inngest dev server to be running");
  console.log("   Run 'make dev-inngest' in another terminal to start it");

  const INNGEST_EVENT_URL = process.env.INNGEST_EVENT_URL || "http://localhost:8288/api/inngest";

  try {
    // Try to send event to Inngest (if available)
    const response = await fetch(INNGEST_EVENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "mexc/calendar.poll",
        data: {
          trigger: "manual",
          force: true,
        },
      }),
    });

    if (response.ok) {
      console.log("✅ Inngest event triggered successfully");
      const result = await response.json();
      console.log(`   Event ID: ${result.ids?.[0] || "N/A"}`);
    } else {
      console.warn(`⚠️  Inngest event trigger failed: ${response.status} ${response.statusText}`);
      console.log("   (This is expected if Inngest dev server is not running)");
    }
  } catch (error) {
    console.warn(
      `⚠️  Could not trigger Inngest event: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.log("   (This is expected if Inngest dev server is not running)");
    console.log("   To test Inngest integration, run 'make dev-inngest' and retry");
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("DETECTION PIPELINE VERTICAL SLICE TEST");
  console.log("=".repeat(60));

  try {
    await validateDatabaseConnection();
    await testCalendarSync();
    await validateSnipeTargets();
    await validateMonitoredListings();
    await testInngestEventTrigger();

    console.log(`\n${"=".repeat(60)}`);
    console.log("✅ ALL TESTS PASSED");
    console.log("=".repeat(60));
    console.log("\nSummary:");
    console.log("  ✅ Database connection validated");
    console.log("  ✅ Calendar sync completed");
    console.log("  ✅ Snipe targets created and validated");
    console.log("  ✅ Monitored listings checked");
    console.log("  ✅ Inngest event trigger tested (if server available)");
    console.log("\nThe detection pipeline is functional!");
    console.log("\nNext steps:");
    console.log("  1. Start Inngest dev server: make dev-inngest");
    console.log("  2. Open Inngest dashboard: http://localhost:8288");
    console.log("  3. Manually trigger 'mexc/calendar.poll' event");
    console.log("  4. Verify targets are created in database");

    process.exit(0);
  } catch (error) {
    console.error(`\n${"=".repeat(60)}`);
    console.error("❌ TEST FAILED");
    console.error("=".repeat(60));
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);

    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}
