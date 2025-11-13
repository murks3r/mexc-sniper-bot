#!/usr/bin/env bun

/**
 * Execute FASTER Target (ID: 179)
 * Quick execution script for FASTER token
 */

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";
import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";

async function executeFaster() {
  console.log("🎯 Executing FASTER (ID: 179)\n");

  try {
    // Get FASTER target
    const target = await db.query.snipeTargets.findFirst({
      where: eq(snipeTargets.id, 179),
    });

    if (!target) {
      console.error("❌ FASTER target not found");
      process.exit(1);
    }

    console.log(`📋 Symbol: ${target.symbolName}`);
    console.log(`   Status: ${target.status}`);
    console.log(`   Size: $${target.positionSizeUsdt}\n`);

    // Ensure status is ready
    if (target.status !== "ready") {
      await db.update(snipeTargets).set({ status: "ready" }).where(eq(snipeTargets.id, 179));
      console.log("✅ Status updated to 'ready'\n");
    }

    // Get core trading service and execute
    console.log("⚡ Executing...\n");
    const coreTrading = getCoreTrading();
    const result = await coreTrading.executeSnipeTarget(target.id);

    console.log("📊 Result:");
    console.log(JSON.stringify(result, null, 2));

    // Check database for updated status
    const updatedTarget = await db.query.snipeTargets.findFirst({
      where: eq(snipeTargets.id, 179),
    });

    console.log("\n📋 Updated Target Status:");
    console.log(`   Status: ${updatedTarget?.status}`);
    console.log(`   Exec Time: ${updatedTarget?.actualExecutionTime}`);
    console.log(`   Error: ${updatedTarget?.errorMessage}`);

    // Check execution history
    const execution = await db.query.executionHistory.findFirst({
      where: eq(snipeTargets.id, 179),
      orderBy: (executionHistory, { desc }) => [desc(executionHistory.requestedAt)],
    });

    if (execution) {
      console.log(`\n✅ EXECUTION RECORD CREATED!`);
      console.log(`   Status: ${execution.status}`);
      console.log(`   Order ID: ${execution.exchangeOrderId}`);
      console.log(`   Price: $${execution.executedPrice}`);
      console.log(`   Quantity: ${execution.executedQuantity}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

executeFaster();
