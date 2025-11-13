#!/usr/bin/env bun

/**
 * Debug Price Fetch for FASTER
 * Check what's happening in the price fetch process
 */

import { UnifiedMexcServiceV2 } from "../src/services/api/unified-mexc-service-v2";
import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";

async function debugPriceFetch() {
  console.log("🔍 Debugging Price Fetch for FASTER\n");
  console.log("=".repeat(60));

  // Test direct MEXC service
  console.log("\n1️⃣ Testing direct MEXC service:");
  const mexc = new UnifiedMexcServiceV2({
    apiKey: process.env.MEXC_API_KEY || "",
    secretKey: process.env.MEXC_SECRET_KEY || "",
  });

  try {
    const price = await mexc.getCurrentPrice("FASTERUSDT");
    console.log(`✅ Direct price: $${price}`);
  } catch (error) {
    console.log(`❌ Direct error: ${error.message}`);
  }

  // Test ticker
  console.log("\n2️⃣ Testing ticker API:");
  try {
    const ticker = await mexc.getTicker("FASTERUSDT");
    console.log(`✅ Ticker success: ${ticker.success}`);
    console.log(`   Ticker data:`, ticker.data);
  } catch (error) {
    console.log(`❌ Ticker error: ${error.message}`);
  }

  // Test through core trading
  console.log("\n3️⃣ Testing through core trading service:");
  const coreTrading = getCoreTrading();
  const moduleContext = coreTrading.getModuleContext();
  const coreMexc = moduleContext.mexcService;

  if (coreMexc) {
    console.log("✅ MEXC service available in core trading context");
    try {
      const price = await coreMexc.getCurrentPrice("FASTERUSDT");
      console.log(`✅ Price via core context: $${price}`);
    } catch (error) {
      console.log(`❌ Core context price error: ${error.message}`);
    }

    try {
      const ticker = await coreMexc.getTicker("FASTERUSDT");
      console.log(`✅ Core ticker success: ${ticker.success}`);
      console.log(`   Core ticker data:`, ticker.data);
    } catch (error) {
      console.log(`❌ Core ticker error: ${error.message}`);
    }
  } else {
    console.log("❌ MEXC service NOT exposed via module context");
  }

  const marketDataService = moduleContext.marketDataService;
  if (marketDataService) {
    console.log("\n4️⃣ Testing marketDataService bridge:");
    const { price } = await marketDataService.getCurrentPrice("FASTERUSDT");
    console.log(price ? `✅ Market data price: $${price}` : "❌ No price from market data service");
  } else {
    console.log("\n4️⃣ Market data service not configured in context");
  }

  console.log("\n5️⃣ Context configuration snapshot:");
  console.log(`   maxConcurrentPositions: ${moduleContext.config.maxConcurrentPositions}`);
  console.log(`   snipeCheckInterval: ${moduleContext.config.snipeCheckInterval}ms`);
  console.log(`   paperTradingMode: ${moduleContext.config.enablePaperTrading ? "ON" : "OFF"}`);

  console.log(`\n${"=".repeat(60)}`);
  console.log("\n📊 Debug complete");
  process.exit(0);
}

debugPriceFetch().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
