#!/usr/bin/env bun

/**
 * Direct Target Execution Script
 *
 * Bypasses the job queue system and directly executes ready snipe targets.
 * Use this when the job queue is not processing targets properly.
 */

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";
import { toSafeError } from "../src/lib/error-type-utils";
import { getLogger } from "../src/lib/unified-logger";
import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";

const logger = getLogger("direct-execution");

async function executeReadyTargets() {
  console.log("🚀 Direct Execution of Ready Targets\n");
  console.log("=".repeat(60));

  try {
    const now = new Date();

    // Get all ready targets that are past their execution time
    const readyTargets = await db
      .select()
      .from(snipeTargets)
      .where(
        and(
          eq(snipeTargets.status, "ready"),
          or(isNull(snipeTargets.targetExecutionTime), lt(snipeTargets.targetExecutionTime, now)),
        ),
      )
      .orderBy(snipeTargets.priority, snipeTargets.targetExecutionTime);

    console.log(`📋 Found ${readyTargets.length} ready target(s)\n`);

    if (readyTargets.length === 0) {
      console.log("❌ No ready targets to execute");
      return;
    }

    // Get the core trading service (which contains the auto-sniping module)
    console.log("🔧 Initializing core trading service...");
    const coreTrading = getCoreTrading();
    const status = await coreTrading.getServiceStatus();

    console.log(`✅ Service status: ${status.isHealthy ? "HEALTHY" : "UNHEALTHY"}`);
    console.log(`   Auto-sniping enabled: ${status.autoSnipingEnabled}`);
    console.log(`   Active positions: ${status.activePositions}`);
    console.log();

    if (!status.autoSnipingEnabled) {
      console.log("⚠️  Auto-sniping is not enabled, enabling now...");
      await coreTrading.updateConfig({ autoSnipingEnabled: true });
      console.log("✅ Auto-sniping enabled\n");
    }

    // Execute each target
    console.log("⚡ Executing targets:\n");

    for (const target of readyTargets) {
      console.log(`🎯 Target: ${target.symbolName} (ID: ${target.id})`);
      console.log(`   Execution time: ${target.targetExecutionTime || "IMMEDIATE"}`);
      console.log(`   Position size: $${target.positionSizeUsdt}`);
      console.log(`   Confidence: ${target.confidenceScore}%`);

      try {
        // Use the auto-sniping module to execute this target
        const result = await coreTrading.executeSnipeTarget(target.id);

        if (result.success) {
          console.log(`✅ SUCCESS: Order ${result.data?.orderId} executed`);
          console.log(`   Executed price: $${result.data?.executedPrice}`);
          console.log(`   Executed quantity: ${result.data?.executedQuantity}`);
        } else {
          console.log(`❌ FAILED: ${result.error}`);
        }
      } catch (error) {
        const safeError = toSafeError(error);
        console.log(`❌ ERROR: ${safeError.message}`);
        logger.error(`Failed to execute target ${target.id}`, { target, error: safeError });
      }

      console.log("-".repeat(60));
    }

    // Check results
    console.log("\n📊 Execution Summary:");
    console.log("=".repeat(60));

    const completedTargets = await db
      .select({
        id: snipeTargets.id,
        symbol: snipeTargets.symbolName,
        status: snipeTargets.status,
        execTime: snipeTargets.actualExecutionTime,
      })
      .from(snipeTargets)
      .where(
        eq(snipeTargets.id, readyTargets[0].id), // Just checking the first one as example
      );

    // Get positions created
    const positions = await db.execute(sql`
      SELECT symbol_name, status, entry_price, quantity, created_at 
      FROM positions 
      WHERE created_at > now() - interval '5 minutes'
      ORDER BY created_at DESC
    `);

    console.log(`\n✅ Execution completed!`);
    console.log(`\n💡 Check positions table to verify trades were created.`);

    process.exit(0);
  } catch (error) {
    const safeError = toSafeError(error);
    console.error("\n❌ Fatal error:");
    console.error(safeError.message);
    logger.error("Direct execution failed", { error: safeError });
    process.exit(1);
  }
}

// Run the execution
console.log("⏱️  Starting direct target execution...\n");
executeReadyTargets();
