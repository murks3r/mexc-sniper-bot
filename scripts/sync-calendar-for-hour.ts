#!/usr/bin/env bun
/**
 * Calendar Sync Script for Upcoming Hour
 *
 * Syncs calendar data to create snipe targets for launches within the next 60 minutes.
 * This ensures targets are ready for auto-sniping execution.
 *
 * Usage:
 *   bun run scripts/sync-calendar-for-hour.ts
 */

import { calendarSyncService } from "../src/services/calendar-to-database-sync";

async function main() {
  console.log("🔄 Starting calendar sync for upcoming hour...");
  console.log(`⏰ Current time: ${new Date().toISOString()}`);

  try {
    // Sync with a 1-hour window to ensure targets for the next hour are created
    const result = await calendarSyncService.syncCalendarToDatabase("system", {
      timeWindowHours: 1, // Focus on next hour
      forceSync: true, // Force sync even if one is running
      dryRun: false, // Actually create targets
    });

    console.log("\n📊 Sync Results:");
    console.log(`   ✅ Success: ${result.success}`);
    console.log(`   📝 Processed: ${result.processed} launches`);
    console.log(`   ➕ Created: ${result.created} targets`);
    console.log(`   🔄 Updated: ${result.updated} targets`);
    console.log(`   ⏭️  Skipped: ${result.skipped} targets`);
    console.log(`   ❌ Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log("\n⚠️  Errors encountered:");
      result.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }

    if (result.success && result.processed > 0) {
      console.log("\n✅ Calendar sync completed successfully!");
      console.log(`   Found ${result.processed} launches in the next hour`);
      console.log(`   Created/updated ${result.created + result.updated} targets`);
    } else if (result.processed === 0) {
      console.log("\n⚠️  No launches found in the next hour");
    } else {
      console.log("\n❌ Calendar sync completed with errors");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Calendar sync failed:", error);
    process.exit(1);
  }
}

main();
