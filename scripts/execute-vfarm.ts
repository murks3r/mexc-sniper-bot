#!/usr/bin/env bun

/**
 * Execute VFARM Target (ID: 191)
 * Quick execution script without error handling complexity
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";
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

    // @ts-expect-error - accessing private member
    const autoSniping = coreTrading.autoSniping;

    if (!autoSniping) {
      console.error("❌ Auto-sniping module not available");
      process.exit(1);
    }

    const result = await autoSniping.executeSnipeTarget(target, undefined);

    console.log("📊 Result:");
    console.log(JSON.stringify(result, null, 2));

    // Check if trade was created
    const position = await db.query.positions.findFirst({
      where: sql`snipe_target_id = 191 AND created_at > NOW() - INTERVAL '2 minutes'`,
    });

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
