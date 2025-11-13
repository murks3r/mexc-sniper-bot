#!/usr/bin/env bun

/**
 * Comprehensive Sniping Diagnostic Tool
 *
 * Checks all conditions required for sniping to work:
 * 1. Service initialization and status
 * 2. Snipe targets in database
 * 3. User preferences configuration
 * 4. MEXC credentials validation
 * 5. Service configuration
 * 6. Active monitoring intervals
 */

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { userPreferences } from "../src/db/schemas/auth";
import { positions, snipeTargets } from "../src/db/schemas/trading";
import { getLogger } from "../src/lib/unified-logger";
import { UnifiedMexcValidationService } from "../src/lib/unified-mexc-validation";
import { getUserCredentials } from "../src/services/api/user-credentials-service";
import { getCoreTrading } from "../src/services/trading/consolidated/core-trading/base-service";
import { getUnifiedAutoSnipingOrchestrator } from "../src/services/trading/unified-auto-sniping-orchestrator";

const logger = getLogger("sniping-diagnostic");

interface DiagnosticResult {
  check: string;
  status: "✅" | "❌" | "⚠️";
  message: string;
  details?: unknown;
}

const results: DiagnosticResult[] = [];

function addResult(check: string, status: "✅" | "❌" | "⚠️", message: string, details?: unknown) {
  results.push({ check, status, message, details });
  console.log(`${status} ${check}: ${message}`);
  if (details) {
    console.log(`   Details:`, JSON.stringify(details, null, 2));
  }
}

async function checkServiceStatus() {
  try {
    const orchestrator = getUnifiedAutoSnipingOrchestrator();
    const status = await orchestrator.getStatus();

    addResult(
      "Service Initialized",
      status.isInitialized ? "✅" : "❌",
      status.isInitialized ? "Service is initialized" : "Service is NOT initialized",
      { isInitialized: status.isInitialized },
    );

    addResult(
      "Auto-Sniping Enabled",
      status.autoSnipingEnabled ? "✅" : "❌",
      status.autoSnipingEnabled ? "Auto-sniping is enabled" : "Auto-sniping is DISABLED",
      { autoSnipingEnabled: status.autoSnipingEnabled },
    );

    addResult(
      "Service Active",
      status.isActive ? "✅" : "❌",
      status.isActive ? "Service is actively monitoring" : "Service is NOT active",
      { isActive: status.isActive, isHealthy: status.isHealthy },
    );

    addResult(
      "Service Health",
      status.isHealthy ? "✅" : "❌",
      status.isHealthy ? "Service is healthy" : "Service health check FAILED",
      { isHealthy: status.isHealthy },
    );

    return status;
  } catch (error) {
    addResult(
      "Service Status Check",
      "❌",
      `Failed to check service status: ${error instanceof Error ? error.message : String(error)}`,
      { error },
    );
    return null;
  }
}

async function checkSnipeTargets() {
  try {
    // Check for ready targets
    const readyTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "ready"))
      .limit(10);

    // Check for active targets
    const activeTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "active"))
      .limit(10);

    // Check for executing targets
    const executingTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "executing"))
      .limit(10);

    // Check for pending targets
    const pendingTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "pending"))
      .limit(10);

    const totalTargets =
      readyTargets.length + activeTargets.length + executingTargets.length + pendingTargets.length;

    addResult(
      "Ready Targets",
      readyTargets.length > 0 ? "✅" : "❌",
      `Found ${readyTargets.length} ready target(s)`,
      {
        targets: readyTargets.map((t) => ({
          id: t.id,
          symbol: t.symbolName,
          execTime: t.targetExecutionTime,
        })),
      },
    );

    addResult(
      "Active Targets",
      activeTargets.length > 0 ? "✅" : "⚠️",
      `Found ${activeTargets.length} active target(s)`,
      { targets: activeTargets.map((t) => ({ id: t.id, symbol: t.symbolName })) },
    );

    addResult(
      "Total Targets",
      totalTargets > 0 ? "✅" : "❌",
      `Total targets in database: ${totalTargets}`,
      {
        ready: readyTargets.length,
        active: activeTargets.length,
        executing: executingTargets.length,
        pending: pendingTargets.length,
      },
    );

    // Check for targets that should be executable now
    const now = new Date();
    const executableTargets = readyTargets.filter(
      (t) => !t.targetExecutionTime || t.targetExecutionTime <= now,
    );

    addResult(
      "Executable Targets (Ready + Past Due)",
      executableTargets.length > 0 ? "✅" : "❌",
      `Found ${executableTargets.length} target(s) ready to execute`,
      {
        targets: executableTargets.map((t) => ({
          id: t.id,
          symbol: t.symbolName,
          execTime: t.targetExecutionTime,
        })),
      },
    );

    return { readyTargets, activeTargets, executableTargets };
  } catch (error) {
    addResult(
      "Snipe Targets Check",
      "❌",
      `Failed to check snipe targets: ${error instanceof Error ? error.message : String(error)}`,
      { error },
    );
    return null;
  }
}

async function checkUserPreferences(userId?: string) {
  if (!userId) {
    addResult("User Preferences", "⚠️", "No user ID provided - checking system defaults", {});
    return null;
  }

  try {
    const prefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (prefs.length === 0) {
      addResult("User Preferences", "⚠️", "No user preferences found - will use defaults", {});
      return null;
    }

    const pref = prefs[0];
    const hasBuyAmount = !!pref.defaultBuyAmountUsdt && pref.defaultBuyAmountUsdt > 0;
    const hasStopLoss = !!pref.stopLossPercent;
    const hasTakeProfit = !!pref.defaultTakeProfitLevel;

    addResult(
      "User Preferences",
      hasBuyAmount && hasStopLoss && hasTakeProfit ? "✅" : "⚠️",
      hasBuyAmount && hasStopLoss && hasTakeProfit
        ? "User preferences configured"
        : "User preferences incomplete",
      {
        hasBuyAmount,
        hasStopLoss,
        hasTakeProfit,
        buyAmount: pref.defaultBuyAmountUsdt,
        stopLoss: pref.stopLossPercent,
        takeProfit: pref.defaultTakeProfitLevel,
      },
    );

    return pref;
  } catch (error) {
    addResult(
      "User Preferences Check",
      "❌",
      `Failed to check user preferences: ${error instanceof Error ? error.message : String(error)}`,
      { error },
    );
    return null;
  }
}

async function checkMexcCredentials(userId?: string) {
  if (!userId) {
    addResult(
      "MEXC Credentials",
      "⚠️",
      "No user ID provided - checking environment credentials",
      {},
    );
    return null;
  }

  try {
    const creds = await getUserCredentials(userId, "mexc");

    if (!creds || !creds.apiKey || !creds.secretKey) {
      addResult("MEXC Credentials", "❌", "No MEXC credentials found for user", {});
      return null;
    }

    addResult("MEXC Credentials Found", "✅", "MEXC credentials found", {
      hasApiKey: !!creds.apiKey,
      hasSecretKey: !!creds.secretKey,
    });

    // Validate credentials
    try {
      const validation = await UnifiedMexcValidationService.validateCredentials(
        userId,
        {
          apiKey: creds.apiKey,
          secretKey: creds.secretKey,
        },
        { timeoutMs: 5000, includeAccountInfo: true },
      );

      addResult(
        "MEXC Credentials Validation",
        validation.credentialsValid ? "✅" : "❌",
        validation.credentialsValid
          ? "Credentials are valid"
          : `Credentials validation failed: ${validation.error}`,
        {
          valid: validation.credentialsValid,
          connected: validation.connected,
          error: validation.error,
          balance: validation.accountInfo?.totalValue,
        },
      );

      return { creds, validation };
    } catch (validationError) {
      addResult(
        "MEXC Credentials Validation",
        "❌",
        `Validation error: ${validationError instanceof Error ? validationError.message : String(validationError)}`,
        { error: validationError },
      );
      return { creds, validation: null };
    }
  } catch (error) {
    addResult(
      "MEXC Credentials Check",
      "❌",
      `Failed to check MEXC credentials: ${error instanceof Error ? error.message : String(error)}`,
      { error },
    );
    return null;
  }
}

async function checkServiceConfiguration() {
  try {
    const coreTrading = getCoreTrading();
    const status = await coreTrading.getServiceStatus();

    addResult("Service Configuration", "✅", "Service configuration retrieved", {
      autoSnipingEnabled: status.autoSnipingEnabled,
      maxConcurrentPositions: status.maxConcurrentPositions,
      snipeCheckInterval: status.snipeCheckInterval,
      paperTradingMode: status.paperTradingMode,
    });

    return status;
  } catch (error) {
    addResult(
      "Service Configuration Check",
      "❌",
      `Failed to check service configuration: ${error instanceof Error ? error.message : String(error)}`,
      { error },
    );
    return null;
  }
}

async function checkActivePositions() {
  try {
    const openPositions = await db
      .select()
      .from(positions)
      .where(eq(positions.status, "open"))
      .limit(10);

    addResult(
      "Open Positions",
      openPositions.length >= 0 ? "✅" : "⚠️",
      `Found ${openPositions.length} open position(s)`,
      { positions: openPositions.map((p) => ({ id: p.id, symbol: p.symbol, status: p.status })) },
    );

    return openPositions;
  } catch (error) {
    addResult(
      "Active Positions Check",
      "❌",
      `Failed to check active positions: ${error instanceof Error ? error.message : String(error)}`,
      { error },
    );
    return null;
  }
}

async function main() {
  const userId = process.env.USER_ID || process.argv[2];

  console.log("🔍 Sniping Diagnostic Tool\n");
  console.log(`User ID: ${userId || "Not provided (checking system-wide)"}\n`);
  console.log("=".repeat(60) + "\n");

  // Run all checks
  const serviceStatus = await checkServiceStatus();
  const targets = await checkSnipeTargets();
  const prefs = await checkUserPreferences(userId);
  const creds = await checkMexcCredentials(userId);
  const config = await checkServiceConfiguration();
  const positions = await checkActivePositions();

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY\n");

  const criticalChecks = results.filter(
    (r) =>
      r.check.includes("Service Initialized") ||
      r.check.includes("Auto-Sniping Enabled") ||
      r.check.includes("Service Active") ||
      r.check.includes("Executable Targets"),
  );

  const failedCritical = criticalChecks.filter((r) => r.status === "❌");
  const warnings = results.filter((r) => r.status === "⚠️");

  if (failedCritical.length === 0) {
    console.log("✅ All critical checks passed!");
  } else {
    console.log(`❌ ${failedCritical.length} critical check(s) failed:`);
    failedCritical.forEach((r) => {
      console.log(`   - ${r.check}: ${r.message}`);
    });
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} warning(s):`);
    warnings.forEach((r) => {
      console.log(`   - ${r.check}: ${r.message}`);
    });
  }

  // Recommendations
  console.log("\n💡 RECOMMENDATIONS:\n");

  if (!serviceStatus?.isInitialized) {
    console.log("1. Initialize the service: POST /api/auto-sniping/control with action=start");
  }

  if (!serviceStatus?.autoSnipingEnabled) {
    console.log("2. Enable auto-sniping: POST /api/auto-sniping/control with action=start");
  }

  if (!serviceStatus?.isActive) {
    console.log(
      "3. Start auto-sniping monitoring: POST /api/auto-sniping/control with action=start",
    );
  }

  if (!targets?.executableTargets || targets.executableTargets.length === 0) {
    console.log("4. Create snipe targets: POST /api/snipe-targets");
    console.log("   Or sync calendar: POST /api/calendar/sync");
  }

  if (!creds?.validation?.credentialsValid && userId) {
    console.log("5. Configure valid MEXC credentials: POST /api/api-credentials");
  }

  if (!prefs && userId) {
    console.log("6. Configure user preferences: POST /api/user-preferences");
  }

  console.log("\n" + "=".repeat(60));

  process.exit(failedCritical.length > 0 ? 1 : 0);
}

main().catch((error) => {
  logger.error("Diagnostic script failed", error);
  console.error("❌ Diagnostic script failed:", error);
  process.exit(1);
});
