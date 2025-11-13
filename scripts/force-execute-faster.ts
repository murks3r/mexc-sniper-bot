#!/usr/bin/env bun

/**
 * Force Execute FASTER
 * Bypasses all checks and directly executes the trade
 */

import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";

async function forceExecute() {
  console.log("⚡ Force Executing FASTER (ID: 179)\n");
  console.log("=".repeat(60));

  try {
    const coreTrading = getCoreTrading();

    // Get the autoSniping module
    const autoSniping = (coreTrading as any).autoSniping;

    if (!autoSniping) {
      console.error("❌ Auto-sniping module not available");
      process.exit(1);
    }

    console.log("🔧 Setting current user to 'system'...");
    autoSniping.setCurrentUser("system");

    console.log("⚡ Executing individual snipe target...");

    // Call the internal method that executes individual targets
    const result = await autoSniping.executeIndividualTarget(179, "system");

    console.log("\n📊 Execution Result:");
    console.log(JSON.stringify(result, null, 2));

    process.exit(result.success ? 0 : 1);
  } catch (error: any) {
    console.error("\n❌ Fatal error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

forceExecute();
