#!/usr/bin/env bun

/**
 * Test Market Price Retrieval
 * Check if we can get current prices for various symbols
 */

import { UnifiedMexcServiceV2 } from "../src/services/api/unified-mexc-service-v2";

async function testPrices() {
  console.log("🔍 Testing Market Price Retrieval\n");
  console.log("=".repeat(60));

  const mexc = new UnifiedMexcServiceV2({
    apiKey: process.env.MEXC_API_KEY || "",
    secretKey: process.env.MEXC_SECRET_KEY || "",
  });

  const testSymbols = [
    "BTCUSDT", // Should definitely work
    "ETHUSDT", // Should definitely work
    "FASTERUSDT", // Our target
    "VFARMUSDT", // Our target
    "LIFEUSDT", // Future target
    "EDENAUSDT", // Future target
  ];

  for (const symbol of testSymbols) {
    try {
      console.log(`\n🧪 Testing: ${symbol}`);
      const price = await mexc.getCurrentPrice(symbol);
      console.log(`✅ Price: $${price}`);
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Test Complete");
  process.exit(0);
}

testPrices().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
