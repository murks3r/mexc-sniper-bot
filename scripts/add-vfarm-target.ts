#!/usr/bin/env bun

/**
 * Script to manually add VFARM (VeriFarm) as a snipe target
 *
 * Usage:
 *   bun run scripts/add-vfarm-target.ts [userId] [vcoinId] [executionTime]
 *
 * Examples:
 *   bun run scripts/add-vfarm-target.ts user_123 abc123def456 2024-01-15T10:00:00Z
 *   bun run scripts/add-vfarm-target.ts user_123 abc123def456  # Uses current time + 1 hour
 */

import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";
import { resolveRiskParams } from "../src/lib/risk-defaults";
import { createSimpleLogger } from "../src/lib/unified-logger";

const logger = createSimpleLogger("AddVFARMTarget");

interface AddTargetOptions {
  userId: string;
  vcoinId?: string;
  symbolName: string;
  executionTime?: Date;
  positionSizeUsdt?: number;
}

async function addVFARMTarget(options: AddTargetOptions) {
  const {
    userId,
    vcoinId = "VFARM", // Default vcoinId, should be replaced with actual MEXC vcoinId
    symbolName = "VFARM",
    executionTime,
    positionSizeUsdt = 100, // Default position size
  } = options;

  try {
    // Resolve risk parameters (uses user preferences or defaults)
    const riskParams = await resolveRiskParams({}, userId);

    // Default execution time: 1 hour from now if not provided
    const targetExecutionTime = executionTime || new Date(Date.now() + 60 * 60 * 1000);

    // Check if target already exists
    const existing = await db
      .select()
      .from(snipeTargets)
      .where(and(eq(snipeTargets.userId, userId), eq(snipeTargets.symbolName, symbolName)))
      .limit(1);

    if (existing.length > 0) {
      logger.warn("Target already exists", { existing: existing[0] });
      console.log(`⚠️  Target for ${symbolName} already exists:`);
      console.log(`   ID: ${existing[0].id}`);
      console.log(`   Status: ${existing[0].status}`);
      console.log(`   Execution Time: ${existing[0].targetExecutionTime}`);
      return existing[0];
    }

    // Create new snipe target
    const newTarget = {
      userId,
      vcoinId,
      symbolName,
      positionSizeUsdt,
      stopLossPercent: riskParams.stopLossPercent,
      takeProfitLevel: riskParams.takeProfitLevel,
      takeProfitCustom: riskParams.takeProfitCustom,
      targetExecutionTime,
      status: "active" as const,
      confidenceScore: 90.0, // High confidence for manual targets
      riskLevel: "medium" as const,
      priority: 1, // High priority
      maxRetries: 3,
      currentRetries: 0,
      entryStrategy: "market" as const,
    };

    const result = await db.insert(snipeTargets).values(newTarget).returning();

    if (result.length === 0) {
      throw new Error("Failed to insert snipe target");
    }

    logger.info("VFARM target created successfully", { target: result[0] });
    console.log(`✅ Successfully created snipe target for ${symbolName}:`);
    console.log(`   ID: ${result[0].id}`);
    console.log(`   Symbol: ${result[0].symbolName}`);
    console.log(`   VCoin ID: ${result[0].vcoinId}`);
    console.log(`   Status: ${result[0].status}`);
    console.log(`   Execution Time: ${result[0].targetExecutionTime}`);
    console.log(`   Position Size: ${result[0].positionSizeUsdt} USDT`);
    console.log(`   Stop Loss: ${result[0].stopLossPercent}%`);
    console.log(`   Take Profit Level: ${result[0].takeProfitLevel}`);
    console.log(`   Confidence: ${result[0].confidenceScore}%`);

    return result[0];
  } catch (error) {
    logger.error(
      "Failed to create VFARM target",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: bun run scripts/add-vfarm-target.ts <userId> [vcoinId] [executionTime]");
    console.log("");
    console.log("Arguments:");
    console.log("  userId        - Your Clerk user ID (required)");
    console.log("  vcoinId       - MEXC vcoinId for VFARM (optional, defaults to 'VFARM')");
    console.log("  executionTime - ISO datetime string (optional, defaults to 1 hour from now)");
    console.log("");
    console.log("Examples:");
    console.log("  bun run scripts/add-vfarm-target.ts user_2abc123def456");
    console.log("  bun run scripts/add-vfarm-target.ts user_2abc123def456 abc123def456");
    console.log(
      "  bun run scripts/add-vfarm-target.ts user_2abc123def456 abc123def456 2024-01-15T10:00:00Z",
    );
    console.log("");
    console.log("💡 To find your user ID:");
    console.log("   1. Sign in to the dashboard");
    console.log("   2. Check the browser console or network tab for API calls");
    console.log("   3. Or check the database users table");
    process.exit(1);
  }

  const userId = args[0];
  const vcoinId = args[1];
  const executionTimeStr = args[2];

  let executionTime: Date | undefined;
  if (executionTimeStr) {
    executionTime = new Date(executionTimeStr);
    if (Number.isNaN(executionTime.getTime())) {
      console.error(`❌ Invalid execution time format: ${executionTimeStr}`);
      console.error("   Use ISO format: 2024-01-15T10:00:00Z");
      process.exit(1);
    }
  }

  try {
    await addVFARMTarget({
      userId,
      vcoinId,
      symbolName: "VFARM",
      executionTime,
    });
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);
