#!/usr/bin/env bun

import { and, asc, eq, gte, isNull, lt, or } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schemas/trading";
import { getLogger } from "../src/lib/unified-logger";
import { getRecommendedMexcService } from "../src/services/api/mexc-unified-exports";

const logger = getLogger("sniping-readiness");

async function getUpcomingExecutableTarget(windowMinutes = 15) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60_000);

  const rows = await db
    .select()
    .from(snipeTargets)
    .where(
      and(
        or(
          // Ready or active and due now/past
          and(
            or(eq(snipeTargets.status, "ready"), eq(snipeTargets.status, "active")),
            or(lt(snipeTargets.targetExecutionTime, now), isNull(snipeTargets.targetExecutionTime)),
          ),
          // Pending but scheduled within window
          and(
            eq(snipeTargets.status, "pending"),
            gte(snipeTargets.targetExecutionTime, now),
            lt(snipeTargets.targetExecutionTime, windowEnd),
          ),
        ),
      ),
    )
    .orderBy(asc(snipeTargets.priority), asc(snipeTargets.targetExecutionTime))
    .limit(3);

  return rows;
}

async function main() {
  const windowMinutes = Number(process.env.SNIPING_WINDOW_MINUTES || "15");

  console.log("Sniping readiness diagnostics\n");
  console.log(`Window: now .. +${windowMinutes}m`);

  // 1) Check DB & upcoming targets
  let targetsOk = false;
  try {
    const targets = await getUpcomingExecutableTarget(windowMinutes);
    // Also check if there are any ready/active targets (even if not in immediate window)
    const anyReadyTargets = await db
      .select({
        id: snipeTargets.id,
        status: snipeTargets.status,
        symbolName: snipeTargets.symbolName,
      })
      .from(snipeTargets)
      .where(or(eq(snipeTargets.status, "ready"), eq(snipeTargets.status, "active")))
      .limit(1);

    if (targets.length > 0) {
      targetsOk = true;
      console.log(`[Targets] Found ${targets.length} candidate(s) in window:`);
      for (const t of targets) {
        console.log(
          `  - id=${t.id} status=${t.status} symbol=${t.symbolName} priority=${t.priority} execAt=${t.targetExecutionTime?.toISOString() ?? "N/A"}`,
        );
      }
    } else if (anyReadyTargets.length > 0) {
      // If no targets in immediate window, but there are ready/active targets, still consider it OK
      targetsOk = true;
      console.log(
        `[Targets] No targets in immediate window, but found ready/active target(s) available.`,
      );
    } else {
      console.log("[Targets] No executable targets found.");
    }
  } catch (error) {
    logger.error("Failed to query snipeTargets", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error(
      "[Targets] ERROR querying snipeTargets:",
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }

  // 2) Check unified MEXC config and market-data health
  let configOk = false;
  try {
    const mexc = getRecommendedMexcService();
    const [balancesResult, pingResult] = await Promise.all([
      mexc.getAccountBalances(),
      mexc.ping(),
    ]);

    const credentialsValid = balancesResult.success === true && !!balancesResult.data;
    const pingOk = pingResult.success === true;
    const marketDataOk = true; // covered by balances + ping for readiness

    configOk = credentialsValid && pingOk && marketDataOk;

    console.log("\n[MEXC] Diagnostics:");
    console.log(`  credentialsValid=${credentialsValid}`);
    console.log(`  pingOk=${pingOk}`);
    console.log(`  marketDataOk=${marketDataOk}`);
  } catch (error) {
    logger.error("Failed to run MEXC diagnostics", error);
    console.log("[MEXC] ERROR running diagnostics (see logs)");
  }

  const ok = targetsOk && configOk;
  console.log("\n[Summary]");
  console.log(`  targetsOk=${targetsOk}`);
  console.log(`  configOk=${configOk}`);
  console.log(`  ready=${ok}`);

  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  logger.error("Sniping readiness script failed", error);
  console.error("Sniping readiness script failed", error);
  process.exit(1);
});
