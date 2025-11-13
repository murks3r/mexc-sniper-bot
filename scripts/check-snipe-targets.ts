#!/usr/bin/env bun

/**
 * Check snipe targets status
 */

import { desc, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";

async function main() {
  console.log("🔍 Checking Snipe Targets\n");

  // Get all active, ready, and pending targets
  const targets = await db
    .select()
    .from(snipeTargets)
    .where(inArray(snipeTargets.status, ["active", "ready", "pending", "executing"]))
    .orderBy(snipeTargets.targetExecutionTime, desc(snipeTargets.createdAt))
    .limit(20);

  console.log(`Found ${targets.length} targets in active/ready/pending/executing status:\n`);

  const now = new Date();

  for (const target of targets) {
    const execTime = target.targetExecutionTime;
    const timeUntil = execTime ? execTime.getTime() - now.getTime() : null;
    const isPast = timeUntil !== null && timeUntil < 0;

    console.log(`ID: ${target.id} | Symbol: ${target.symbolName}`);
    console.log(`  Status: ${target.status}`);
    console.log(`  Confidence: ${target.confidenceScore}`);
    console.log(`  Execution Time: ${execTime?.toISOString() || "Not set"}`);
    console.log(
      `  Time Until: ${timeUntil ? (isPast ? `PAST DUE by ${Math.abs(timeUntil / 1000 / 60).toFixed(1)}m` : `${(timeUntil / 1000 / 60).toFixed(1)}m`) : "N/A"}`,
    );
    console.log(`  Retries: ${target.currentRetries}/${target.maxRetries}`);
    console.log(`  Position Size: ${target.positionSizeUsdt} USDT`);
    console.log(`  Created: ${target.createdAt.toISOString()}`);
    console.log(`  Updated: ${target.updatedAt.toISOString()}`);
    if (target.errorMessage) {
      console.log(`  Error: ${target.errorMessage}`);
    }
    console.log("");
  }

  // Summary by status
  const statusCounts = targets.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log("\n📊 Summary by Status:");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  // Check past due targets that are not ready
  const pastDueNotReady = targets.filter((t) => {
    if (!t.targetExecutionTime) return false;
    const timeUntil = t.targetExecutionTime.getTime() - now.getTime();
    return timeUntil < 0 && t.status !== "ready";
  });

  if (pastDueNotReady.length > 0) {
    console.log(`\n⚠️  ${pastDueNotReady.length} past due targets are not in 'ready' status:`);
    for (const t of pastDueNotReady) {
      console.log(`  - ${t.symbolName} (ID: ${t.id}, Status: ${t.status})`);
    }
  }
}

main().catch(console.error);
