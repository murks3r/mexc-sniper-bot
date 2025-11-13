/**
 * System Readiness Verification
 *
 * Comprehensive check to ensure everything is ready for active targets.
 */

import { and, eq, gte, lte, or } from "drizzle-orm";
import { db } from "@/src/db";
import { snipeTargets } from "@/src/db/schemas/trading";
import { getCoreTrading } from "@/src/services/trading/consolidated/core-trading/base-service";
import { getUnifiedAutoSnipingOrchestrator } from "@/src/services/trading/unified-auto-sniping-orchestrator";

interface ReadinessCheck {
  category: string;
  checks: Array<{
    name: string;
    status: "pass" | "fail" | "warning";
    message: string;
    details?: any;
  }>;
}

class SystemReadinessVerifier {
  private results: ReadinessCheck[] = [];

  private addCheck(
    category: string,
    name: string,
    status: "pass" | "fail" | "warning",
    message: string,
    details?: any,
  ) {
    let categoryResult = this.results.find((r) => r.category === category);
    if (!categoryResult) {
      categoryResult = { category, checks: [] };
      this.results.push(categoryResult);
    }
    categoryResult.checks.push({ name, status, message, details });
  }

  /**
   * Check 1: Autosniping Orchestrator Status
   */
  async checkAutosnipingStatus(): Promise<void> {
    console.log("\n🔍 Checking Autosniping Status...");

    try {
      const orchestrator = getUnifiedAutoSnipingOrchestrator();
      const status = await orchestrator.getStatus();

      this.addCheck(
        "Autosniping",
        "Initialized",
        status.isInitialized ? "pass" : "fail",
        status.isInitialized ? "Orchestrator is initialized" : "Orchestrator is NOT initialized",
        { isInitialized: status.isInitialized },
      );

      this.addCheck(
        "Autosniping",
        "Enabled",
        status.autoSnipingEnabled ? "pass" : "fail",
        status.autoSnipingEnabled ? "Auto-sniping is enabled" : "Auto-sniping is NOT enabled",
        { autoSnipingEnabled: status.autoSnipingEnabled },
      );

      this.addCheck(
        "Autosniping",
        "Active",
        status.isActive ? "pass" : "fail",
        status.isActive ? "Autosniping is active" : "Autosniping is NOT active",
        { isActive: status.isActive },
      );

      this.addCheck(
        "Autosniping",
        "Health",
        status.isHealthy ? "pass" : "fail",
        status.isHealthy ? "Service is healthy" : "Service is unhealthy",
        { isHealthy: status.isHealthy },
      );

      // Check user ID
      const coreTrading = getCoreTrading();
      const autoSniping = (coreTrading as any).autoSniping;
      const moduleStatus = autoSniping?.getStatus?.();
      const currentUserId = moduleStatus?.currentUserId;

      this.addCheck(
        "Autosniping",
        "User ID Set",
        currentUserId ? "pass" : "fail",
        currentUserId
          ? `User ID is set: ${currentUserId}`
          : "User ID is NOT set on auto-sniping module",
        { currentUserId: currentUserId || null },
      );

      // Check credentials
      const hasEnvCreds = !!(process.env.MEXC_API_KEY && process.env.MEXC_SECRET_KEY);
      this.addCheck(
        "Autosniping",
        "Credentials Available",
        hasEnvCreds ? "pass" : "fail",
        hasEnvCreds
          ? "MEXC credentials found in environment"
          : "MEXC credentials NOT found in environment",
        {
          hasMEXC_API_KEY: !!process.env.MEXC_API_KEY,
          hasMEXC_SECRET_KEY: !!process.env.MEXC_SECRET_KEY,
        },
      );
    } catch (error) {
      this.addCheck(
        "Autosniping",
        "Status Check",
        "fail",
        `Error checking autosniping status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check 2: Active Targets Status
   */
  async checkActiveTargets(): Promise<void> {
    console.log("\n🔍 Checking Active Targets...");

    try {
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      // Get all active targets
      const activeTargets = await db
        .select()
        .from(snipeTargets)
        .where(
          and(
            or(eq(snipeTargets.status, "active"), eq(snipeTargets.status, "ready")),
            or(
              lte(snipeTargets.targetExecutionTime, now),
              eq(snipeTargets.targetExecutionTime, null),
            ),
          ),
        )
        .orderBy(snipeTargets.targetExecutionTime);

      const totalActive = activeTargets.length;

      this.addCheck(
        "Active Targets",
        "Count",
        totalActive > 0 ? "pass" : "warning",
        totalActive > 0
          ? `Found ${totalActive} active target(s) ready for processing`
          : "No active targets found",
        { count: totalActive },
      );

      // Check each target's readiness
      let readyCount = 0;
      const issues: string[] = [];

      for (const target of activeTargets) {
        const targetIssues: string[] = [];

        if (!target.positionSizeUsdt || target.positionSizeUsdt <= 0) {
          targetIssues.push(`Missing or invalid position size (${target.positionSizeUsdt})`);
        }

        if (!target.confidenceScore || target.confidenceScore <= 0) {
          targetIssues.push(`Missing or invalid confidence score (${target.confidenceScore})`);
        }

        if (target.currentRetries >= target.maxRetries) {
          targetIssues.push(`Max retries exceeded (${target.currentRetries}/${target.maxRetries})`);
        }

        if (target.status === "failed") {
          targetIssues.push(`Target status is 'failed': ${target.errorMessage || "Unknown error"}`);
        }

        if (targetIssues.length === 0) {
          readyCount++;
        } else {
          issues.push(`${target.symbolName} (ID: ${target.id}): ${targetIssues.join(", ")}`);
        }
      }

      this.addCheck(
        "Active Targets",
        "Ready for Execution",
        readyCount === totalActive && totalActive > 0
          ? "pass"
          : readyCount > 0
            ? "warning"
            : "fail",
        `${readyCount}/${totalActive} targets are ready for execution`,
        {
          ready: readyCount,
          total: totalActive,
          issues: issues.length > 0 ? issues : undefined,
          targets: activeTargets.slice(0, 5).map((t) => ({
            id: t.id,
            symbol: t.symbolName,
            status: t.status,
            positionSize: t.positionSizeUsdt,
            confidence: t.confidenceScore,
            executionTime: t.targetExecutionTime?.toISOString(),
            retries: `${t.currentRetries}/${t.maxRetries}`,
          })),
        },
      );

      // Check for upcoming targets
      const upcomingTargets = await db
        .select()
        .from(snipeTargets)
        .where(
          and(
            or(eq(snipeTargets.status, "active"), eq(snipeTargets.status, "ready")),
            gte(snipeTargets.targetExecutionTime, now),
            lte(snipeTargets.targetExecutionTime, oneHourFromNow),
          ),
        )
        .orderBy(snipeTargets.targetExecutionTime);

      this.addCheck(
        "Active Targets",
        "Upcoming (Next Hour)",
        upcomingTargets.length > 0 ? "pass" : "warning",
        upcomingTargets.length > 0
          ? `Found ${upcomingTargets.length} target(s) scheduled in the next hour`
          : "No targets scheduled in the next hour",
        {
          count: upcomingTargets.length,
          targets: upcomingTargets.slice(0, 3).map((t) => ({
            symbol: t.symbolName,
            executionTime: t.targetExecutionTime?.toISOString(),
            timeUntil: t.targetExecutionTime
              ? Math.max(0, new Date(t.targetExecutionTime).getTime() - now.getTime())
              : null,
          })),
        },
      );
    } catch (error) {
      this.addCheck(
        "Active Targets",
        "Target Check",
        "fail",
        `Error checking active targets: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check 3: Database Connectivity
   */
  async checkDatabaseConnectivity(): Promise<void> {
    console.log("\n🔍 Checking Database Connectivity...");

    try {
      // Simple query to test connection
      const result = await db.execute(`SELECT 1 as test`);
      this.addCheck("Database", "Connection", "pass", "Database connection is working", {
        test: result,
      });
    } catch (error) {
      this.addCheck(
        "Database",
        "Connection",
        "fail",
        `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check 4: Environment Configuration
   */
  async checkEnvironmentConfig(): Promise<void> {
    console.log("\n🔍 Checking Environment Configuration...");

    const requiredEnvVars = [
      "MEXC_API_KEY",
      "MEXC_SECRET_KEY",
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ];

    const optionalEnvVars = [
      "MEXC_PAPER_TRADING",
      "PAPER_TRADING_MODE",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];

    for (const envVar of requiredEnvVars) {
      const value = process.env[envVar];
      this.addCheck(
        "Environment",
        envVar,
        value ? "pass" : "fail",
        value ? `${envVar} is set` : `${envVar} is NOT set (required)`,
        { isSet: !!value },
      );
    }

    for (const envVar of optionalEnvVars) {
      const value = process.env[envVar];
      this.addCheck(
        "Environment",
        envVar,
        value ? "pass" : "warning",
        value ? `${envVar} is set` : `${envVar} is not set (optional)`,
        { isSet: !!value },
      );
    }

    // Check paper trading mode
    const paperTrading =
      process.env.MEXC_PAPER_TRADING === "true" || process.env.PAPER_TRADING_MODE === "true";
    this.addCheck(
      "Environment",
      "Paper Trading Mode",
      "pass",
      paperTrading ? "Paper trading is enabled" : "Real trading mode (paper trading disabled)",
      { paperTrading },
    );
  }

  /**
   * Get all readiness check results
   */
  getResults(): ReadinessCheck[] {
    return this.results;
  }

  /**
   * Print comprehensive readiness report
   */
  printReport(): void {
    console.log(`\n${"=".repeat(80)}`);
    console.log("📋 SYSTEM READINESS REPORT");
    console.log("=".repeat(80));

    for (const result of this.results) {
      console.log(`\n## ${result.category}`);
      console.log("-".repeat(80));
      for (const check of result.checks) {
        const icon = check.status === "pass" ? "✅" : check.status === "fail" ? "❌" : "⚠️";
        console.log(`${icon} ${check.name}: ${check.message}`);
        if (check.details && Object.keys(check.details).length > 0) {
          console.log(`   Details:`, JSON.stringify(check.details, null, 2));
        }
      }
    }

    // Summary
    const totalChecks = this.results.reduce((sum, r) => sum + r.checks.length, 0);
    const passChecks = this.results.reduce(
      (sum, r) => sum + r.checks.filter((c) => c.status === "pass").length,
      0,
    );
    const failChecks = this.results.reduce(
      (sum, r) => sum + r.checks.filter((c) => c.status === "fail").length,
      0,
    );
    const warningChecks = this.results.reduce(
      (sum, r) => sum + r.checks.filter((c) => c.status === "warning").length,
      0,
    );

    console.log(`\n${"=".repeat(80)}`);
    console.log("📊 SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total Checks: ${totalChecks}`);
    console.log(`✅ Pass: ${passChecks}`);
    console.log(`⚠️  Warnings: ${warningChecks}`);
    console.log(`❌ Failures: ${failChecks}`);

    // Overall status
    const overallStatus =
      failChecks === 0
        ? warningChecks === 0
          ? "✅ READY"
          : "⚠️  READY WITH WARNINGS"
        : "❌ NOT READY";

    console.log(`\n${"=".repeat(80)}`);
    console.log(`🎯 OVERALL STATUS: ${overallStatus}`);
    console.log("=".repeat(80));

    if (failChecks > 0) {
      console.log("\n❌ Critical issues must be resolved before active targets can execute:");
      for (const result of this.results) {
        for (const check of result.checks) {
          if (check.status === "fail") {
            console.log(`   - ${result.category}: ${check.name} - ${check.message}`);
          }
        }
      }
    }

    if (warningChecks > 0 && failChecks === 0) {
      console.log("\n⚠️  Warnings (system should work but may have limitations):");
      for (const result of this.results) {
        for (const check of result.checks) {
          if (check.status === "warning") {
            console.log(`   - ${result.category}: ${check.name} - ${check.message}`);
          }
        }
      }
    }
  }

  /**
   * Run all checks
   */
  async runAllChecks(): Promise<void> {
    await this.checkDatabaseConnectivity();
    await this.checkEnvironmentConfig();
    await this.checkAutosnipingStatus();
    await this.checkActiveTargets();
  }
}

async function main() {
  console.log("🚀 System Readiness Verification");
  console.log("=".repeat(80));
  console.log(`Started: ${new Date().toISOString()}\n`);

  const verifier = new SystemReadinessVerifier();
  await verifier.runAllChecks();
  verifier.printReport();

  // Exit with appropriate code
  const hasFailures = verifier.getResults().some((r) => r.checks.some((c) => c.status === "fail"));
  process.exit(hasFailures ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { SystemReadinessVerifier };
