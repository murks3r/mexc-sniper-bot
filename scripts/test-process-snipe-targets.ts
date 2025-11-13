#!/usr/bin/env bun

/**
 * Test processSnipeTargets directly
 * This is what the service calls internally
 */

import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";

async function testProcessSnipeTargets() {
  console.log("🔍 Testing processSnipeTargets\n");
  console.log("=".repeat(60));

  const coreTrading = getCoreTrading();
  const autoSniping = (coreTrading as any).autoSniping;

  try {
    console.log("⚡ Calling processSnipeTargets...");
    const result = await autoSniping.processSnipeTargets();

    console.log("\n📊 Result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("\n❌ Error:", error);
  }

  console.log(`\n${"=".repeat(60)}`);
  process.exit(0);
}

testProcessSnipeTargets().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
