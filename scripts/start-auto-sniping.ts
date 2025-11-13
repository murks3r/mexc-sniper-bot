#!/usr/bin/env bun

/**
 * Quick Start Script for Auto-Sniping Service
 *
 * Initializes and starts the auto-sniping service programmatically.
 * Use this when the HTTP API is not available.
 */

import { getLogger } from "../src/lib/unified-logger";
import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";
import { getUnifiedAutoSnipingOrchestrator } from "../src/services/trading/unified-auto-sniping-orchestrator";

const _logger = getLogger("start-auto-sniping");

async function startAutoSniping() {
  console.log("🚀 Starting Auto-Sniping Service...\n");

  try {
    // Get orchestrator
    const orchestrator = getUnifiedAutoSnipingOrchestrator();

    // Check current status
    const status = await orchestrator.getStatus();
    console.log("📊 Current Status:");
    console.log(`   - Initialized: ${status.isInitialized}`);
    console.log(`   - Active: ${status.isActive}`);
    console.log(`   - Auto-sniping Enabled: ${status.autoSnipingEnabled}`);
    console.log(`   - Healthy: ${status.isHealthy}`);
    console.log(`   - Processed Targets: ${status.processedTargets}`);
    console.log();

    // Initialize if needed
    if (!status.isInitialized) {
      console.log("🔧 Initializing orchestrator...");
      await orchestrator.initialize();
      console.log("✅ Orchestrator initialized\n");
    }

    // Update config to enable auto-sniping
    const coreTrading = getCoreTrading();
    console.log("⚙️  Enabling auto-sniping...");
    await coreTrading.updateConfig({
      autoSnipingEnabled: true,
      paperTradingMode: false,
    });
    console.log("✅ Auto-sniping enabled\n");

    // Start the service
    console.log("▶️  Starting auto-sniping monitoring...");
    const result = await orchestrator.start();

    if (result.success) {
      console.log("✅ Auto-sniping service started successfully!");
      console.log("\n📈 New Status:");
      const newStatus = await orchestrator.getStatus();
      console.log(`   - Initialized: ${newStatus.isInitialized}`);
      console.log(`   - Active: ${newStatus.isActive}`);
      console.log(`   - Auto-sniping Enabled: ${newStatus.autoSnipingEnabled}`);
      console.log(`   - Healthy: ${newStatus.isHealthy}`);
      console.log(`\n🎯 The service is now actively monitoring for ready targets.`);
      console.log("⏱️  Targets will be executed when their execution time arrives.");

      process.exit(0);
    } else {
      console.error("❌ Failed to start auto-sniping:", result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error starting auto-sniping service:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n\n🛑 Shutting down auto-sniping service...");
  try {
    const orchestrator = getUnifiedAutoSnipingOrchestrator();
    await orchestrator.stop();
    console.log("✅ Service stopped gracefully");
  } catch (error) {
    console.error(
      "⚠️  Error during shutdown:",
      error instanceof Error ? error.message : String(error),
    );
  }
  process.exit(0);
});

startAutoSniping();
