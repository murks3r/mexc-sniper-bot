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

  // @ts-expect-error - accessing private member
  const autoSniping = coreTrading.autoSniping;

  if (autoSniping?.context?.mexcService) {
    console.log("✅ MEXC service available in context");
    try {
      const price = await autoSniping.context.mexcService.getCurrentPrice("FASTERUSDT");
      console.log(`✅ Price via context: $${price}`);
    } catch (error) {
      console.log(`❌ Context price error: ${error.message}`);
    }

    try {
      const ticker = await autoSniping.context.mexcService.getTicker("FASTERUSDT");
      console.log(`✅ Ticker via context success: ${ticker.success}`);
      console.log(`   Ticker data:`, ticker.data);
    } catch (error) {
      console.log(`❌ Context ticker error: ${error.message}`);
    }
  } else {
    console.log("❌ MEXC service NOT available in context");
    console.log("   Context keys:", Object.keys(autoSniping?.context || {}));
  }

  // Test normalizeSymbol
  console.log("\n4️⃣ Testing normalizeSymbol:");
  if (autoSniping?.normalizeSymbol) {
    const normalized = autoSniping.normalizeSymbol("FASTER");
    console.log(`✅ 'FASTER' -> '${normalized}'`);
  } else {
    console.log("❌ normalizeSymbol not available");
  }

  // Test getCurrentMarketPrice
  console.log("\n5️⃣ Testing getCurrentMarketPrice:");
  if (autoSniping?.getCurrentMarketPrice) {
    try {
      const price = await autoSniping.getCurrentMarketPrice("FASTER");
      console.log(`✅ Price: $${price}`);
    } catch (error) {
      console.log(`❌ Price fetch error: ${error.message}`);
    }

    try {
      const price = await autoSniping.getCurrentMarketPrice("FASTERUSDT");
      console.log(`✅ Price (USDT suffix): $${price}`);
    } catch (error) {
      console.log(`❌ Price fetch error (USDT): ${error.message}`);
    }
  } else {
    console.log("❌ getCurrentMarketPrice not available");
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("\n📊 Debug complete");
  process.exit(0);
}

debugPriceFetch().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
