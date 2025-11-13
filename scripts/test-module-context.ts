#!/usr/bin/env bun

/**
 * Test Module Context
 * Check what services are available in the module context
 */

import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";

async function testModuleContext() {
  console.log("🔍 Testing Module Context\n");
  console.log("=".repeat(60));

  const coreTrading = getCoreTrading();
  const autoSniping = (coreTrading as any).autoSniping;

  console.log("\n📋 Context available services:");
  console.log("   mexcService:", autoSniping?.context?.mexcService ? "✅ AVAILABLE" : "❌ MISSING");
  console.log(
    "   marketDataService:",
    autoSniping?.context?.marketDataService ? "✅ AVAILABLE" : "❌ MISSING",
  );
  console.log("   marketData:", autoSniping?.context?.marketData ? "✅ AVAILABLE" : "❌ MISSING");

  if (autoSniping?.context?.mexcService) {
    console.log("\n🔧 Testing mexcService in context:");

    const hasGetTicker = typeof autoSniping.context.mexcService.getTicker === "function";
    const hasGetCurrentPrice =
      typeof autoSniping.context.mexcService.getCurrentPrice === "function";

    console.log(`   getTicker method: ${hasGetTicker ? "✅" : "❌"}`);
    console.log(`   getCurrentPrice method: ${hasGetCurrentPrice ? "✅" : "❌"}`);

    if (hasGetCurrentPrice) {
      try {
        const price = await autoSniping.context.mexcService.getCurrentPrice("FASTERUSDT");
        console.log(`   Price fetch test: $${price}`);
      } catch (error) {
        console.log(`   Price fetch error: ${error.message}`);
      }
    }

    if (hasGetTicker) {
      try {
        const ticker = await autoSniping.context.mexcService.getTicker("FASTERUSDT");
        console.log(`   Ticker success: ${ticker.success}`);
      } catch (error) {
        console.log(`   Ticker error: ${error.message}`);
      }
    }
  } else {
    console.log("\n❌ MEXC service missing from context!");
  }

  // Check base service mexcService
  console.log("\n🔧 Testing base service mexcService:");
  const baseHasMethods = typeof (coreTrading as any).mexcService?.getCurrentPrice === "function";
  console.log(`   Base service has methods: ${baseHasMethods ? "✅" : "❌"}`);

  if (baseHasMethods) {
    const price = await (coreTrading as any).mexcService.getCurrentPrice("FASTERUSDT");
    console.log(`   Base service price: $${price}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  process.exit(0);
}

testModuleContext().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
