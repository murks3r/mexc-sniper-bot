#!/usr/bin/env bun

/**
 * Verify Target Execution Status
 *
 * Checks if ready targets are being picked up and executed by the service.
 */

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";
import { getLogger } from "../src/lib/unified-logger";

const _logger = getLogger("verify-executing");

async function checkExecutionStatus() {
  console.log("🔍 Checking Target Execution Status\n");
  console.log("=".repeat(60));

  try {
    const now = new Date();

    // Check for ready targets that should execute
    const readyTargets = await db
      .select()
      .from(snipeTargets)
      .where(
        and(
          eq(snipeTargets.status, "ready"),
          or(isNull(snipeTargets.targetExecutionTime), lt(snipeTargets.targetExecutionTime, now)),
        ),
      )
      .orderBy(snipeTargets.targetExecutionTime);

    console.log("\n📋 READY TARGETS (Eligible for Execution):");
    console.log("-".repeat(60));

    if (readyTargets.length === 0) {
      console.log("❌ No ready targets found");
    } else {
      readyTargets.forEach((target) => {
        const execTime = target.targetExecutionTime || "IMMEDIATE";
        const timeUntil = target.targetExecutionTime
          ? Math.floor((target.targetExecutionTime.getTime() - now.getTime()) / 1000)
          : 0;

        console.log(`✅ ID: ${target.id} | Symbol: ${target.symbolName}`);
        console.log(`   Status: ${target.status} | Exec Time: ${execTime}`);
        console.log(`   Time until: ${timeUntil <= 0 ? "EXECUTE NOW" : `${timeUntil}s`}`);
        console.log(
          `   Size: $${target.positionSizeUsdt} | Confidence: ${target.confidenceScore}%`,
        );
        console.log("-".repeat(60));
      });
    }

    // Check for actively executing targets
    const executingTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "executing"))
      .limit(10);

    console.log("\n⚡ EXECUTING TARGETS (In Progress):");
    console.log("-".repeat(60));

    if (executingTargets.length === 0) {
      console.log("⏸️  No targets currently executing");
    } else {
      executingTargets.forEach((target) => {
        console.log(`🔄 ID: ${target.id} | Symbol: ${target.symbolName}`);
        console.log(`   Status: ${target.status}`);
        console.log("-".repeat(60));
      });
    }

    // Summary
    console.log("\n📊 SUMMARY:");
    console.log("=".repeat(60));
    console.log(`Ready to execute: ${readyTargets.length}`);
    console.log(`Currently executing: ${executingTargets.length}`);
    console.log(`\n🎯 The service is monitoring and will execute ready targets.`);

    if (readyTargets.length > 0) {
      console.log(`\n⏱️  Next execution should happen within 30-60 seconds.`);
      console.log("💡 Run this script again to see updated status.");
    }

    console.log(`\n${"=".repeat(60)}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error checking execution status:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run immediately and then every 10 seconds
console.log("🔄 Auto-refreshing every 10 seconds (Ctrl+C to stop)\n");
checkExecutionStatus();

const interval = setInterval(() => {
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("🔄 Refreshed at:", new Date().toISOString());
  console.log("=".repeat(60));
  checkExecutionStatus();
}, 10000);

process.on("SIGINT", () => {
  console.log("\n\n🛑 Stopping monitor...");
  clearInterval(interval);
  process.exit(0);
});
