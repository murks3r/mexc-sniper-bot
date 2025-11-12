#!/usr/bin/env bun

import { calendarSyncService } from "../src/services/calendar-to-database-sync";
import { popQueueJob } from "../src/services/queues/supabase-queues";

async function handleOnce() {
  const job = await popQueueJob();
  if (!job) return;

  const { message } = job;

  if (message.type === "calendar_sync") {
    const payload = (message.payload ?? {}) as {
      userId?: string;
      timeWindowHours?: number;
      forceSync?: boolean;
    };

    await calendarSyncService.syncCalendarToDatabase(
      payload.userId ?? "system",
      {
        timeWindowHours: payload.timeWindowHours ?? 72,
        forceSync: payload.forceSync ?? false,
        dryRun: false,
      },
    );
  }

  if (message.type === "risk_check") {
    // TODO: call risk check services
  }

  if (message.type === "housekeeping") {
    // TODO: housekeeping
  }
}

async function main() {
  // Intended to be called on a schedule (e.g., via external cron/PM2) for now.
  await handleOnce();
}

main().catch((error) => {
  console.error("Queue worker failed", error);
  process.exit(1);
});
