#!/usr/bin/env bun
/**
 * Check Next Snipe Target Script
 *
 * Queries the database for the next snipe target to execute.
 * Shows detailed information about the target including timing, priority, and configuration.
 *
 * Usage:
 *   bun run scripts/check-next-target.ts
 *   bun run scripts/check-next-target.ts --sync  # Sync calendar first, then check
 */

import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";
import { calendarSyncService } from "../src/services/calendar-to-database-sync";

interface TargetInfo {
  id: number;
  userId: string;
  vcoinId: string;
  symbolName: string;
  status: string;
  priority: number;
  positionSizeUsdt: number;
  targetExecutionTime: Date | null;
  confidenceScore: number;
  riskLevel: string;
  entryStrategy: string;
  takeProfitLevel: number;
  stopLossPercent: number;
  currentRetries: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
}

function formatTimeUntil(targetTime: Date | null): string {
  if (!targetTime) return "No execution time set";

  const now = new Date();
  const diff = targetTime.getTime() - now.getTime();

  if (diff < 0) {
    const minutesAgo = Math.floor(Math.abs(diff) / 60000);
    return `${minutesAgo} minutes ago (overdue)`;
  }

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatDate(date: Date | null): string {
  if (!date) return "N/A";
  return date.toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

async function getNextTarget(): Promise<TargetInfo | null> {
  try {
    const now = new Date();

    // Query for targets that are ready to execute
    // Priority order: ready > active > pending
    // Within each status, order by priority (1=highest) and execution time

    const readyTargets = await db
      .select()
      .from(snipeTargets)
      .where(
        and(
          eq(snipeTargets.status, "ready"),
          or(
            isNull(snipeTargets.targetExecutionTime),
            lte(snipeTargets.targetExecutionTime, now), // Include targets due now or in the past
          ),
        ),
      )
      .orderBy(asc(snipeTargets.priority), asc(snipeTargets.targetExecutionTime))
      .limit(1);

    if (readyTargets.length > 0) {
      return readyTargets[0] as TargetInfo;
    }

    // If no ready targets, check active targets (including future ones)
    const activeTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "active"))
      .orderBy(asc(snipeTargets.priority), asc(snipeTargets.targetExecutionTime))
      .limit(1);

    if (activeTargets.length > 0) {
      return activeTargets[0] as TargetInfo;
    }

    // If no ready/active targets, check pending targets
    const pendingTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "pending"))
      .orderBy(asc(snipeTargets.priority), asc(snipeTargets.targetExecutionTime))
      .limit(1);

    if (pendingTargets.length > 0) {
      return pendingTargets[0] as TargetInfo;
    }

    return null;
  } catch (error) {
    console.error("❌ Error querying database:", error);
    throw error;
  }
}

async function getTargetStats() {
  try {
    const stats = await db
      .select({
        status: snipeTargets.status,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(snipeTargets)
      .groupBy(snipeTargets.status);

    return stats;
  } catch (error) {
    console.error("❌ Error getting stats:", error);
    // Fallback: get all targets and count manually
    try {
      const allTargets = await db.select({ status: snipeTargets.status }).from(snipeTargets);

      const statusCounts = new Map<string, number>();
      allTargets.forEach((target) => {
        statusCounts.set(target.status, (statusCounts.get(target.status) || 0) + 1);
      });

      return Array.from(statusCounts.entries()).map(([status, count]) => ({
        status,
        count,
      }));
    } catch (fallbackError) {
      console.error("❌ Fallback stats query also failed:", fallbackError);
      return [];
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldSync = args.includes("--sync") || args.includes("-s");

  console.log("🎯 Checking for next snipe target...\n");
  console.log(`⏰ Current time: ${new Date().toISOString()}\n`);

  // Sync calendar if requested
  if (shouldSync) {
    console.log("🔄 Syncing calendar to create targets...");
    try {
      const syncResult = await calendarSyncService.syncCalendarToDatabase("system", {
        timeWindowHours: 72, // 3 days window
        forceSync: true,
        dryRun: false,
      });

      console.log("\n📊 Sync Results:");
      console.log(`   ✅ Success: ${syncResult.success}`);
      console.log(`   📝 Processed: ${syncResult.processed} launches`);
      console.log(`   ➕ Created: ${syncResult.created} targets`);
      console.log(`   🔄 Updated: ${syncResult.updated} targets`);
      console.log(`   ⏭️  Skipped: ${syncResult.skipped} targets`);

      if (syncResult.errors.length > 0) {
        console.log(`   ❌ Errors: ${syncResult.errors.length}`);
        syncResult.errors.forEach((error, index) => {
          console.log(`      ${index + 1}. ${error}`);
        });
      }
      console.log();
    } catch (error) {
      console.error("❌ Calendar sync failed:", error);
      console.log("⚠️  Continuing to check existing targets...\n");
    }
  }

  // Get target statistics
  const stats = await getTargetStats();
  if (stats.length > 0) {
    console.log("📊 Target Statistics:");
    stats.forEach((stat) => {
      console.log(`   ${stat.status}: ${stat.count}`);
    });
    console.log();
  }

  // Get next target
  const target = await getNextTarget();

  if (!target) {
    console.log("⚠️  No snipe targets found in database.");
    console.log("\n💡 To create targets:");
    console.log("   1. Run: bun run scripts/check-next-target.ts --sync");
    console.log("   2. Or trigger calendar sync via API: POST /api/sync/calendar-to-database");
    console.log("   3. Or wait for scheduled sync (every 30 minutes)");
    process.exit(0);
  }

  // Display target information
  console.log("🎯 NEXT TARGET TO SNIPE:");
  console.log("═".repeat(60));
  console.log(`   ID:              ${target.id}`);
  console.log(`   Symbol:          ${target.symbolName}`);
  console.log(`   VCoin ID:        ${target.vcoinId}`);
  console.log(`   Status:          ${target.status.toUpperCase()}`);
  console.log(`   Priority:       ${target.priority} (1=highest, 5=lowest)`);
  console.log(`   Position Size:  $${target.positionSizeUsdt.toFixed(2)} USDT`);
  console.log(`   Entry Strategy: ${target.entryStrategy}`);
  console.log(`   Take Profit:    Level ${target.takeProfitLevel}`);
  console.log(`   Stop Loss:      ${target.stopLossPercent}%`);
  console.log(`   Confidence:     ${target.confidenceScore.toFixed(1)}%`);
  console.log(`   Risk Level:     ${target.riskLevel}`);
  console.log(`   Retries:        ${target.currentRetries}/${target.maxRetries}`);
  console.log(`   User ID:        ${target.userId}`);
  console.log();
  console.log("⏰ TIMING:");
  console.log(`   Execution Time:  ${formatDate(target.targetExecutionTime)}`);
  console.log(`   Time Until:      ${formatTimeUntil(target.targetExecutionTime)}`);
  console.log(`   Created:         ${formatDate(target.createdAt)}`);
  console.log(`   Updated:         ${formatDate(target.updatedAt)}`);
  console.log("═".repeat(60));

  // Additional context
  if (target.status === "ready") {
    console.log("\n✅ Target is READY and can be executed immediately");
  } else if (target.status === "active") {
    console.log("\n🟡 Target is ACTIVE - execution time may have passed");
  } else if (target.status === "pending") {
    console.log("\n⏳ Target is PENDING - waiting for execution time");
  }

  // Check if target is overdue
  if (target.targetExecutionTime && target.targetExecutionTime < new Date()) {
    const minutesOverdue = Math.floor(
      (new Date().getTime() - target.targetExecutionTime.getTime()) / 60000,
    );
    console.log(`\n⚠️  WARNING: Target is ${minutesOverdue} minutes overdue!`);
  }
}

main().catch((error) => {
  console.error("\n❌ Script failed:", error);
  process.exit(1);
});
