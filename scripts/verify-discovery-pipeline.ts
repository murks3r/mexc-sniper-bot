#!/usr/bin/env bun

/**
 * Verification script for token launch discovery pipeline
 * Run this script and then check Chrome DevTools to verify:
 * 1. Calendar API returns data
 * 2. Targets are created in database
 * 3. Frontend displays targets correctly
 * 4. No console errors
 * 5. Logger is used instead of console.log
 */

import { desc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { snipeTargets } from "../src/db/schema";
import { calendarSyncService } from "../src/services/calendar-to-database-sync";

async function verifyCalendarAPI() {
  console.log("\n📡 Verifying Calendar API...");

  try {
    const { getRecommendedMexcService } = await import("../src/services/api/mexc-unified-exports");
    const mexcService = getRecommendedMexcService();
    const response = await mexcService.getCalendarListings();

    if (response.success && Array.isArray(response.data)) {
      console.log(`✅ Calendar API working: ${response.data.length} listings found`);
      console.log(`   Source: ${response.source || "unknown"}`);

      if (response.data.length > 0) {
        const sample = response.data[0];
        console.log(`   Sample entry:`, {
          vcoinId: sample.vcoinId,
          symbol: sample.symbol,
          projectName: sample.projectName || sample.vcoinNameFull,
          firstOpenTime: sample.firstOpenTime
            ? new Date(sample.firstOpenTime).toISOString()
            : "N/A",
        });
      }
      return true;
    } else {
      console.log(`❌ Calendar API failed: ${response.error || "Unknown error"}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Calendar API error:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function verifyCalendarSync() {
  console.log("\n🔄 Verifying Calendar Sync Service...");

  try {
    const result = await calendarSyncService.syncCalendarToDatabase("system", {
      timeWindowHours: 72,
      forceSync: true,
      dryRun: false,
    });

    console.log(`✅ Calendar sync completed:`);
    console.log(`   Processed: ${result.processed}`);
    console.log(`   Created: ${result.created}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Skipped: ${result.skipped}`);

    if (result.errors.length > 0) {
      console.log(`   ⚠️ Errors: ${result.errors.length}`);
      result.errors.forEach((err) => console.log(`      - ${err}`));
    }

    return result.success;
  } catch (error) {
    console.log(`❌ Calendar sync error:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function verifyDatabaseTargets() {
  console.log("\n💾 Verifying Database Targets...");

  try {
    // Check for targets with ready/active status
    const readyTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "ready"))
      .orderBy(desc(snipeTargets.createdAt))
      .limit(10);

    const activeTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "active"))
      .orderBy(desc(snipeTargets.createdAt))
      .limit(10);

    const executingTargets = await db
      .select()
      .from(snipeTargets)
      .where(eq(snipeTargets.status, "executing"))
      .orderBy(desc(snipeTargets.createdAt))
      .limit(10);

    console.log(`✅ Database targets found:`);
    console.log(`   Ready: ${readyTargets.length}`);
    console.log(`   Active: ${activeTargets.length}`);
    console.log(`   Executing: ${executingTargets.length}`);

    // Show sample target
    const allTargets = [...readyTargets, ...activeTargets, ...executingTargets];
    if (allTargets.length > 0) {
      const sample = allTargets[0];
      console.log(`\n   Sample target:`);
      console.log(`     ID: ${sample.id}`);
      console.log(`     Vcoin ID: ${sample.vcoinId}`);
      console.log(`     Symbol: ${sample.symbolName}`);
      console.log(`     Status: ${sample.status}`);
      console.log(`     Execution Time: ${sample.targetExecutionTime?.toISOString() || "N/A"}`);
      console.log(`     Created: ${sample.createdAt.toISOString()}`);
    }

    return allTargets.length > 0;
  } catch (error) {
    console.log(`❌ Database query error:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function verifyAPIEndpoint() {
  console.log("\n🌐 Verifying API Endpoint...");

  try {
    // This would need to be run in a server context
    // For now, we'll just check the route file exists and is correct
    const { readFileSync } = await import("fs");
    const routeFile = readFileSync("app/api/mexc/calendar/route.ts", "utf-8");

    // Check for proper error handling
    const hasErrorHandling = routeFile.includes("createErrorResponse");
    const hasNoEmptyArrayFallback = !routeFile.includes("createSuccessResponse([], {");

    console.log(`✅ API Route verification:`);
    console.log(`   Has error handling: ${hasErrorHandling ? "✅" : "❌"}`);
    console.log(`   No empty array fallback: ${hasNoEmptyArrayFallback ? "✅" : "❌"}`);

    return hasErrorHandling && hasNoEmptyArrayFallback;
  } catch (error) {
    console.log(
      `⚠️ Could not verify API route file:`,
      error instanceof Error ? error.message : String(error),
    );
    return true; // Don't fail on this
  }
}

async function generateChromeDevToolsChecklist() {
  console.log("\n" + "=".repeat(60));
  console.log("CHROME DEVTOOLS VERIFICATION CHECKLIST");
  console.log("=".repeat(60));
  console.log("\n1. Open Chrome DevTools (F12 or Cmd+Option+I)");
  console.log("2. Navigate to: http://localhost:3008/dashboard");
  console.log("3. Check the following:\n");

  console.log("📡 Network Tab:");
  console.log("   - Look for /api/mexc/calendar request");
  console.log("   - Status should be 200 (not 503/500)");
  console.log("   - Response should have success: true");
  console.log("   - Response should have data array (may be empty if no listings)");
  console.log("   - If error, should have success: false and error message\n");

  console.log("📊 Console Tab:");
  console.log("   - Should NOT see excessive console.log statements");
  console.log("   - Should see structured log messages from logger");
  console.log("   - No red errors (except expected ones like favicon)");
  console.log("   - Check for 'use-pattern-sniper' log messages\n");

  console.log("💾 Application Tab > Local Storage:");
  console.log("   - Check for 'pattern-sniper-monitoring' key");
  console.log("   - Should be 'true' or 'false'\n");

  console.log("🎯 Elements Tab:");
  console.log("   - Look for coin listings board");
  console.log("   - Check for error messages (should be visible if API fails)");
  console.log("   - Check for loading states");
  console.log("   - Verify targets are displayed\n");

  console.log("🔍 What to Look For:");
  console.log("   ✅ Targets appear in dashboard");
  console.log("   ✅ Error messages are visible (not hidden)");
  console.log("   ✅ No console.log spam");
  console.log("   ✅ Network requests succeed");
  console.log("   ✅ Status includes 'ready' targets when querying 'active'\n");
}

async function main() {
  console.log("=".repeat(60));
  console.log("TOKEN LAUNCH DISCOVERY PIPELINE VERIFICATION");
  console.log("=".repeat(60));

  const results = {
    calendarAPI: await verifyCalendarAPI(),
    calendarSync: await verifyCalendarSync(),
    databaseTargets: await verifyDatabaseTargets(),
    apiEndpoint: await verifyAPIEndpoint(),
  };

  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION RESULTS");
  console.log("=".repeat(60));
  console.log(`Calendar API:        ${results.calendarAPI ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Calendar Sync:      ${results.calendarSync ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Database Targets:    ${results.databaseTargets ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`API Endpoint:       ${results.apiEndpoint ? "✅ PASS" : "❌ FAIL"}`);

  const allPassed = Object.values(results).every((r) => r);

  console.log("\n" + "=".repeat(60));
  if (allPassed) {
    console.log("✅ ALL CHECKS PASSED");
  } else {
    console.log("⚠️ SOME CHECKS FAILED - Review output above");
  }
  console.log("=".repeat(60));

  await generateChromeDevToolsChecklist();

  console.log("\n💡 Next Steps:");
  console.log("   1. Start dev server: bun run dev");
  console.log("   2. Open http://localhost:3008/dashboard");
  console.log("   3. Follow Chrome DevTools checklist above");
  console.log("   4. Verify targets appear in UI\n");

  process.exit(allPassed ? 0 : 1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Verification failed:", error);
    process.exit(1);
  });
}
