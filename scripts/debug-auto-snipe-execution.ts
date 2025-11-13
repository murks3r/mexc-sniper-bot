#!/usr/bin/env bun

/**
 * Debug Auto-Snipe Execution
 * Step through the execution to find where the price is getting lost
 */

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";
import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";

async function debugAutoSnipe() {
  console.log("🔍 Debugging Auto-Snipe Execution for FASTER\n");
  console.log("=".repeat(60));

  try {
    // Get the target
    const target = await db.query.snipeTargets.findFirst({
      where: eq(snipeTargets.id, 179),
    });

    if (!target) {
      console.error("❌ Target not found");
      process.exit(1);
    }

    console.log(`📋 Target: ${target.symbolName} (ID: ${target.id})`);
    console.log(`   Status: ${target.status}`);
    console.log(`   Symbol: ${target.symbolName}`);
    console.log(`   DB Symbol: ${target.symbolName}`);

    // Get core trading
    const coreTrading = getCoreTrading();
    const autoSniping = (coreTrading as any).autoSniping;

    console.log("\n🔧 Testing price fetch directly:");

    // Test normalizeSymbol
    const normalized = autoSniping.normalizeSymbol(target.symbolName);
    console.log(`1️⃣ Normalized symbol: '${target.symbolName}' -> '${normalized}'`);

    // Test getCurrentMarketPrice directly
    const price = await autoSniping.getCurrentMarketPrice(target.symbolName);
    console.log(`2️⃣ Current market price: $${price}`);

    // Test through checkPriceAvailability
    const priceCheck = await autoSniping.checkPriceAvailability(
      {
        ...target,
        symbol: target.symbolName,
        quantity: target.positionSizeUsdt,
        amount: target.positionSizeUsdt,
        confidence: target.confidenceScore,
        side: "BUY",
        orderType: "MARKET",
      },
      Date.now(),
    );
    console.log("3️⃣ Price check:", JSON.stringify(priceCheck, null, 2));

    console.log(`\n${"=".repeat(60)}`);

    if (priceCheck.result && !priceCheck.result.success) {
      console.log("\n❌ Price check FAILED - this is the bug!");
      console.log("   Error:", priceCheck.result.error);
    } else {
      console.log("\n✅ Price check PASSED");
      console.log("   Current price: $", priceCheck.currentPrice);
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

debugAutoSnipe();
