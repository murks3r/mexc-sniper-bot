#!/usr/bin/env bun

/**
 * Fix Sniping Targets - Convert active targets to ready status
 *
 * This script fixes targets stuck in "active" status by:
 * 1. Checking if their execution time has passed
 * 2. Marking past-due targets as "ready"
 */

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";

async function main() {
  console.log("🔧 Fixing Sniping Targets\n");

  // Get all active targets
  const activeTargets = await db
    .select()
    .from(snipeTargets)
    .where(eq(snipeTargets.status, "active"));

  console.log(`Found ${activeTargets.length} active targets\n`);

  const now = new Date();
  let updatedCount = 0;

  for (const target of activeTargets) {
    const execTime = target.targetExecutionTime;

    if (!execTime) {
      console.log(
        `⚠️  ${target.symbolName} (ID: ${target.id}) - No execution time set, marking as ready`,
      );
      await db
        .update(snipeTargets)
        .set({ status: "ready", updatedAt: now })
        .where(eq(snipeTargets.id, target.id));
      updatedCount++;
      continue;
    }

    // Check if execution time is in the past or within 5 minutes
    const timeDiff = execTime.getTime() - now.getTime();
    const minutesUntil = Math.floor(timeDiff / 60000);

    if (minutesUntil <= 5) {
      console.log(
        `✅ ${target.symbolName} (ID: ${target.id}) - Exec time ${minutesUntil} min away, marking as ready`,
      );
      await db
        .update(snipeTargets)
        .set({ status: "ready", updatedAt: now })
        .where(eq(snipeTargets.id, target.id));
      updatedCount++;
    } else {
      console.log(
        `⏳ ${target.symbolName} (ID: ${target.id}) - Exec time in ${minutesUntil} minutes, keeping as active`,
      );
    }
  }

  console.log(`\n✅ Updated ${updatedCount} targets to 'ready' status`);

  // Show ready targets
  const readyTargets = await db.select().from(snipeTargets).where(eq(snipeTargets.status, "ready"));

  console.log(`\n📋 Current ready targets: ${readyTargets.length}`);
  for (const target of readyTargets) {
    console.log(`   - ${target.symbolName} (ID: ${target.id})`);
  }
}

main().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
