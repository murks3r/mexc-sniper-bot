/**
 * Scheduled Inngest Functions - Hybrid Queue Architecture
 *
 * Feature Flag Behavior:
 * - PRIMARY_EXECUTOR="supabase": Enqueues to DB queue, optionally triggers Inngest for fallback
 * - PRIMARY_EXECUTOR="inngest": Only triggers Inngest events (no DB queue)
 * - INNGEST_FALLBACK="true": Triggers Inngest in addition to primary
 * - DUAL_RUN_MODE="true": Runs both systems simultaneously for testing
 *
 * Primary execution: Bun-based job queue + Supabase Cron (see scripts/process-jobs.ts)
 * Fallback: Inngest handlers (this file)
 */

import { EXECUTION_MODE } from "../config/execution-mode";
import { getLogger } from "../lib/unified-logger";
import { enqueueJob } from "../services/jobs/enqueue";
import { inngest } from "./client";

const logger = getLogger("scheduled-functions");

/**
 * Scheduled Calendar Monitoring (every 30 minutes)
 *
 * Syncs MEXC calendar listings to database as snipe targets.
 * This is essential for auto-sniping functionality.
 */
export const scheduledCalendarMonitoring = inngest.createFunction(
  { id: "scheduled-calendar-monitoring" },
  { cron: "*/30 * * * *" }, // Every 30 minutes
  async ({ step }) => {
    logger.info("Starting calendar monitoring cycle", {
      mode: EXECUTION_MODE.primary,
      fallback: EXECUTION_MODE.inngestFallback,
      dualRun: EXECUTION_MODE.dualRun,
    });

    // Step 1: Enqueue to DB queue if Supabase is primary or dual-run
    if (EXECUTION_MODE.primary === "supabase" || EXECUTION_MODE.dualRun) {
      await step.run("enqueue-calendar-sync-job", async () => {
        const job = await enqueueJob({
          type: "calendar_sync",
          payload: { userId: "system", timeWindowHours: 72, forceSync: false },
          runAt: new Date(),
        });
        logger.info("Calendar sync job enqueued to DB queue", { jobId: job.id });
        return { jobId: job.id, queuedAt: job.createdAt };
      });
    }

    // Step 2: Trigger Inngest event if:
    // - Inngest is primary, OR
    // - Inngest fallback is enabled, OR
    // - Dual-run mode is enabled
    if (
      EXECUTION_MODE.primary === "inngest" ||
      EXECUTION_MODE.inngestFallback ||
      EXECUTION_MODE.dualRun
    ) {
      await step.run("trigger-calendar-poll", async () => {
        await inngest.send({
          name: "mexc/calendar.poll",
          data: {
            trigger: "scheduled",
            force: false,
            timestamp: new Date().toISOString(),
          },
        });
        logger.info("Calendar sync event sent to Inngest");
        return { triggered: true };
      });
    }

    return {
      status: "completed",
      executionMode: EXECUTION_MODE.primary,
      fallbackEnabled: EXECUTION_MODE.inngestFallback,
      dualRunEnabled: EXECUTION_MODE.dualRun,
      trigger: "scheduled_30min",
      timestamp: new Date().toISOString(),
      nextRun: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  },
);

// Export all scheduled functions
export const scheduledFunctions = [
  scheduledCalendarMonitoring,
  // Removed: scheduledHealthCheck, scheduledDailyReport, emergencyResponseHandler
  // These were removed per minimization plan to focus on core auto-sniping
];
