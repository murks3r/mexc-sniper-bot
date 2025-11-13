#!/usr/bin/env bun

/**
 * Execute VFARM Target (ID: 191)
 * Quick execution script without error handling complexity
 */

import { desc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { positions, snipeTargets } from "../src/db/schemas/trading";
import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";

async function executeVfarm() {
  console.log("🎯 Executing VFARM (ID: 191)\n");

  try {
    // Get VFARM target
    const target = await db.query.snipeTargets.findFirst({
      where: eq(snipeTargets.id, 191),
    });

    if (!target) {
      console.error("❌ VFARM target not found");
      process.exit(1);
    }

    console.log(`📋 Symbol: ${target.symbolName}`);
    console.log(`   Status: ${target.status}`);
    console.log(`   Size: $${target.positionSizeUsdt}\n`);

    // Ensure status is ready
    if (target.status !== "ready") {
      await db.update(snipeTargets).set({ status: "ready" }).where(eq(snipeTargets.id, 191));
      console.log("✅ Status updated to 'ready'\n");
    }

    // Get core trading and execute
    console.log("⚡ Executing...\n");
    const coreTrading = getCoreTrading();

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
      // @ts-expect-error - targetExecutionTime from database is string but interface expects Date
      scheduledAt: target.targetExecutionTime,
      executedAt: null,
    };

    const result = await coreTrading.executeSnipeTarget(autoSnipeTarget);

    console.log("📊 Result:");
    console.log(JSON.stringify(result, null, 2));

    // Check if trade was created
    const [position] = await db
      .select()
      .from(positions)
      .where(eq(positions.snipeTargetId, 191))
      .orderBy(desc(positions.createdAt))
      .limit(1);

    if (position) {
      console.log(`\n✅ POSITION CREATED!`);
      console.log(`   ID: ${position.id}`);
      console.log(`   Symbol: ${position.symbolName}`);
      console.log(`   Price: $${position.entryPrice}`);
      console.log(`   Quantity: ${position.quantity}`);
    } else {
      console.log(`\n⚠️  No position created yet`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

executeVfarm();
