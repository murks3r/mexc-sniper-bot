#!/usr/bin/env bun

/**
 * Execute FASTER Target (ID: 179)
 * Quick execution script for FASTER token
 */

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";
import { getUnifiedAutoSnipingOrchestrator } from "../src/services/trading/unified-auto-sniping-orchestrator";

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

    // Get auto-sniping module and execute
    console.log("⚡ Executing...\n");
    const autoSniping = getUnifiedAutoSnipingOrchestrator();

    // Convert to AutoSnipeTarget format
    const autoSnipeTarget = {
      ...target,
      symbol: target.symbolName,
      side: "buy" as const,
      orderType: "market" as const,
      quantity: target.positionSizeUsdt,
      amount: target.positionSizeUsdt,
      price: undefined,
      confidence: target.confidenceScore,
      scheduledAt: target.targetExecutionTime?.toISOString() || null,
      executedAt: null,
    };

    const result = await autoSniping.executeSnipeTarget(autoSnipeTarget);

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
