// Build-safe imports - avoid structured logger to prevent webpack bundling issues
import { calendarSyncService } from "@/src/services/calendar-to-database-sync";
import { inngest } from "./client";

// Inngest step interface
interface InngestStep {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
}

// Simplified type definitions (no agents)
interface SyncResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function isSyncResult(value: unknown): value is SyncResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).success === "boolean" &&
    typeof (value as any).processed === "number" &&
    typeof (value as any).created === "number" &&
    typeof (value as any).updated === "number" &&
    typeof (value as any).skipped === "number" &&
    Array.isArray((value as any).errors)
  );
}

// MEXC Calendar polling event data
interface MexcCalendarPollRequestedData {
  trigger?: string;
  force?: boolean;
}

// Removed unused event data interfaces (agent-based workflows removed)

// MEXC Calendar Polling Function - Simplified (no agents)
export const pollMexcCalendar = inngest.createFunction(
  { id: "poll-mexc-calendar" },
  { event: "mexc/calendar.poll" },
  async ({
    event,
    step,
  }: {
    event: { data: MexcCalendarPollRequestedData };
    step: InngestStep;
  }) => {
    const { trigger = "manual", force = false } = event.data;

    // Sync Calendar to Database (direct API call, no agents)
    const syncResult = await step.run("calendar-to-database-sync", async () => {
      return await calendarSyncService.syncCalendarToDatabase("system", {
        timeWindowHours: 72, // 3 days to cover tomorrow's listings
        forceSync: force,
        dryRun: false,
      });
    });

    // Type guard for sync result
    if (!isSyncResult(syncResult)) {
      throw new Error("Invalid sync result format");
    }

      if (!syncResult.success) {
        throw new Error(`Calendar sync failed: ${syncResult.errors.join(", ")}`);
      }

    return {
      status: "success",
      trigger,
      sync: {
        processed: syncResult.processed,
        created: syncResult.created,
        updated: syncResult.updated,
        skipped: syncResult.skipped,
        errors: syncResult.errors,
      },
      timestamp: new Date().toISOString(),
      metadata: {
        databaseSynced: syncResult.success,
      },
    };
  },
);

// Removed agent-based workflows: watchMexcSymbol, analyzeMexcPatterns, createMexcTradingStrategy
// These are no longer needed - calendar sync creates targets directly

// Export all functions for Inngest registration
export const functions = [
  // Core trading workflows (simplified - no agents)
  pollMexcCalendar,
  // Removed: watchMexcSymbol, analyzeMexcPatterns, createMexcTradingStrategy (agent-based)
  // Removed: safetyFunctions (agent-based)
];
