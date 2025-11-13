#!/usr/bin/env bun

/**
 * Manual Target Execution Script
 *
 * Directly executes a specific snipe target by ID.
 * Usage: bun run scripts/manual-target-execution.ts <target-id>
 * Example: bun run scripts/manual-target-execution.ts 191
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";
import { toSafeError } from "../src/lib/error-type-utils";
import { getLogger } from "../src/lib/unified-logger";
import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";

const logger = getLogger("manual-execution");

async function executeTargetById(targetId: number) {
  console.log(`🎯 Manual Execution of Target ID: ${targetId}\n`);
  console.log("=".repeat(60));

  try {
    // Get the target from database
    const targetResult = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.id, targetId))
      .limit(1);

    if (targetResult.length === 0) {
      console.error(`❌ Target ID ${targetId} not found`);
      process.exit(1);
    }

    const target = targetResult[0];

    console.log(`📋 Target Details:`);
    console.log(`   Symbol: ${target.symbolName}`);
    console.log(`   Status: ${target.status}`);
    console.log(`   Execution time: ${target.targetExecutionTime}`);
    console.log(`   Position size: $${target.positionSizeUsdt}`);
    console.log(`   Confidence: ${target.confidenceScore}%`);
    console.log(`   Stop loss: ${target.stopLossPercent}%`);
    console.log();

    if (target.status !== "ready") {
      console.warn(`⚠️  Target status is "${target.status}", not "ready"`);
      console.log(`   Updating status to "ready"...`);

      await db
        .update(snipeTargets)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(snipeTargets.id, targetId));

      console.log("✅ Status updated to 'ready'\n");
    }

    // Get core trading service
    console.log("🔧 Initializing core trading service...");
    const coreTrading = getCoreTrading();

    // Initialize service to ensure dependencies are ready
    console.log("   Ensuring service is initialized...");
    const initResult = await coreTrading.initialize();
    if (!initResult.success) {
      console.warn("   ⚠️  Service initialization reported an issue:", initResult.error);
    } else {
      console.log("   ✅ Service initialized");
    }

    // Enable auto-sniping if needed
    const serviceStatus = await coreTrading.getServiceStatus();
    if (!serviceStatus.autoSnipingEnabled) {
      console.log("   Auto-sniping not enabled, enabling now...");
      await coreTrading.updateConfig({ autoSnipingEnabled: true });
      console.log("   ✅ Auto-sniping enabled");
    }

    console.log("   ✅ Service ready\n");

    // Execute the target using the public helper
    console.log("⚡ Executing target...\n");
    const result = await coreTrading.executeSnipeTarget(targetId);

    console.log(`\n${"=".repeat(60)}`);
    console.log("📊 Execution Result:");
    console.log("=".repeat(60));

    if (result.success) {
      console.log("✅ EXECUTION SUCCESSFUL");
      console.log(`   Order ID: ${result.orderId ?? "n/a"}`);
      console.log(`   Executed price: $${result.executedPrice ?? result.price ?? "n/a"}`);
      console.log(
        `   Executed quantity: ${result.executedQuantity ?? result.executedQty ?? "n/a"}`,
      );
      console.log(`   Symbol: ${result.symbol ?? target.symbolName}`);
      console.log(`   Side: ${result.side ?? "BUY"}`);
      console.log(`   Total cost: $${result.cummulativeQuoteQty ?? "n/a"}`);
    } else {
      console.log("❌ EXECUTION FAILED");
      console.log(`   Error: ${result.error}`);
    }

    console.log("\n⏱️  Checking final status...");

    // Check final target status
    const finalResult = await db
      .select({
        status: snipeTargets.status,
        actualExecutionTime: snipeTargets.actualExecutionTime,
        executionPrice: snipeTargets.executionPrice,
        executionStatus: snipeTargets.executionStatus,
        errorMessage: snipeTargets.errorMessage,
      })
      .from(snipeTargets)
      .where(eq(snipeTargets.id, targetId))
      .limit(1);

    if (finalResult.length > 0) {
      const final = finalResult[0];
      console.log(`   Final status: ${final.status}`);
      if (final.actualExecutionTime) {
        console.log(`   Executed at: ${final.actualExecutionTime}`);
      }
      if (final.executionPrice) {
        console.log(`   Execution price: $${final.executionPrice}`);
      }
      if (final.errorMessage) {
        console.log(`   Error: ${final.errorMessage}`);
      }
    }

    // Check if position was created
    const positions = await db.execute(sql`
        SELECT id, symbol_name, status, entry_price, quantity 
        FROM positions 
        WHERE snipe_target_id = ${targetId}
        ORDER BY created_at DESC
        LIMIT 1
      `);

    if (Array.isArray(positions) && positions.length > 0) {
      const position = positions[0] as {
        id: number;
        symbol_name: string;
        status: string;
        entry_price: string;
        quantity: string;
      };
      console.log(`\n📍 Position created: ID ${position.id}`);
      console.log(`   Symbol: ${position.symbol_name}`);
      console.log(`   Status: ${position.status}`);
      console.log(`   Entry price: $${position.entry_price}`);
      console.log(`   Quantity: ${position.quantity}`);
    } else {
      console.log(`\n  No position created yet (may be delayed)`);
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("✅ Execution attempt completed");
    console.log("\n💡 Verify trade in:");
    console.log("   - snipe_targets table (status should be 'completed')");
    console.log("   - positions table (new position should exist)");
    console.log("   - execution_history table (execution record should exist)");

    process.exit(0);
  } catch (error) {
    const safeError = toSafeError(error);
    console.error(`\n${"=".repeat(60)}`);
    console.error("❌ Fatal error during execution:");
    console.error(safeError.message);
    console.error("\nStack trace:");
    console.error(safeError.stack);

    logger.error("Manual execution failed", { error: safeError });
    process.exit(1);
  }
}

// Main execution
const targetId = process.argv[2] ? parseInt(process.argv[2], 10) : null;

if (!targetId) {
  console.error("❌ Usage: bun run scripts/manual-target-execution.ts <target-id>");
  console.error("   Example: bun run scripts/manual-target-execution.ts 191");
  process.exit(1);
}

console.log("🔧 Manual Target Execution Tool\n");
executeTargetById(targetId);
