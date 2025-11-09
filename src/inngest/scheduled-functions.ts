/**
 * Scheduled Inngest Functions - Minimized
 *
 * Simplified to only include calendar sync functionality for auto-sniping.
 * Health checks, daily reports, and emergency handlers removed per minimization plan.
 */

import { getLogger } from "../lib/unified-logger";
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
    logger.info("Starting calendar monitoring cycle");

    // Step 1: Trigger calendar polling
    await step.run("trigger-calendar-poll", async () => {
      await inngest.send({
        name: "mexc/calendar.poll",
        data: {
          trigger: "scheduled",
          force: false,
          timestamp: new Date().toISOString(),
        },
      });
      return { triggered: true };
    });

    return {
      status: "completed",
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
