#!/usr/bin/env bun

/**
 * Hybrid Job Processor
 *
 * Processes jobs from both queue systems:
 * - DB Queue (jobs table): Scheduled tasks
 * - Supabase pgmq: High-throughput execution tasks
 *
 * Can be run manually, via HTTP API, or triggered by pg_cron.
 */

import { and, eq, gt, lte, sql } from "drizzle-orm";
import { db, jobs } from "../src/db";
import { handleCalendarSyncJob } from "../src/services/jobs/handlers/calendar-sync.handler";
import { handleRiskCheckJob } from "../src/services/jobs/handlers/risk-check.handler";
import { handleHousekeepingJob } from "../src/services/jobs/handlers/housekeeping.handler";
import {
  popFromSupabaseQueue,
  deleteFromSupabaseQueue,
  archiveSupabaseQueueJob,
  QUEUE_NAMES,
  type PgmqMessage,
} from "../src/services/queues/supabase-queues";
import { handleExecutionJob } from "../src/services/jobs/handlers/execution.handler";
import { handleAlertJob } from "../src/services/jobs/handlers/alert.handler";

const BATCH_SIZE = 25;
const PROCESS_PGMQ = process.env.PROCESS_PGMQ === "true";

console.log("[INFO] Starting hybrid job processor", {
  processPgmq: PROCESS_PGMQ,
  batchSize: BATCH_SIZE,
});

// ========================================
// DB Queue Processing
// ========================================

async function fetchPendingDbJobs() {
  // First, select the jobs we want to process
  const pendingJobs = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "pending"),
        lte(jobs.runAt, sql`now()`),
        gt(jobs.maxAttempts, jobs.attempts),
      ),
    )
    .limit(BATCH_SIZE);

  // Then update them to running status
  if (pendingJobs.length > 0) {
    const jobIds = pendingJobs.map((j) => j.id);
    await db
      .update(jobs)
      .set({ status: "running", updatedAt: sql`now()` })
      .where(sql`${jobs.id} = ANY(${jobIds})`);
  }

  return pendingJobs;
}

async function handleDbJob(job: typeof jobs.$inferSelect) {
  console.log(`[INFO] Processing DB job: ${job.type} (ID: ${job.id})`);

  try {
    if (job.type === "calendar_sync") {
      const payload = job.payload as
        | { userId?: string; timeWindowHours?: number; forceSync?: boolean }
        | null;
      await handleCalendarSyncJob(payload);
    } else if (job.type === "risk_check") {
      await handleRiskCheckJob();
    } else if (job.type === "housekeeping") {
      await handleHousekeepingJob();
    } else {
      throw new Error(`Unknown DB job type: ${job.type}`);
    }

    await db
      .update(jobs)
      .set({
        status: "completed",
        updatedAt: sql`now()`,
      })
      .where(eq(jobs.id, job.id));

    console.log(`[INFO] DB job completed: ${job.type} (ID: ${job.id})`);
  } catch (error) {
    const attempts = job.attempts + 1;
    const failed = attempts >= job.maxAttempts;

    await db
      .update(jobs)
      .set({
        attempts,
        status: failed ? "dead" : "pending",
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: sql`now()`,
      })
      .where(eq(jobs.id, job.id));

    console.error(`[ERROR] DB job failed: ${job.type} (ID: ${job.id})`, {
      error: error instanceof Error ? error.message : String(error),
      attempts,
      maxAttempts: job.maxAttempts,
      status: failed ? "dead" : "pending",
    });
  }
}

// ========================================
// pgmq Processing
// ========================================

async function handlePgmqJob(message: PgmqMessage, queueName: string) {
  console.log(`[INFO] Processing pgmq job: ${message.message.type} (Queue: ${queueName})`);

  try {
    const job = message.message;

    if (job.type === "execution") {
      await handleExecutionJob(job);
    } else if (job.type === "alert") {
      await handleAlertJob(job);
    } else if (job.type === "metric") {
      console.log("[INFO] Metric job handler not yet implemented. Skipping.", { payload: job.payload });
      // Metric handler not yet implemented
    } else if (job.type === "order_close") {
      console.log("[INFO] Order close job handler not yet implemented. Skipping.", { payload: job.payload });
      // Order close handler not yet implemented
    } else {
      throw new Error(`Unknown pgmq job type: ${job.type}`);
    }

    // Delete message from queue (successful or skipped)
    await deleteFromSupabaseQueue(queueName as any, message.msg_id);
    console.log(`[INFO] pgmq job processed: ${job.type} (Queue: ${queueName})`);
  } catch (error) {
    console.error(`[ERROR] pgmq job failed: ${message.message.type} (Queue: ${queueName})`, {
      error: error instanceof Error ? error.message : String(error),
      msgId: message.msg_id,
      readCount: message.read_ct,
    });

    // Archive message after too many failures
    if (message.read_ct >= 3) {
      await archiveSupabaseQueueJob(queueName as any, message.msg_id);
      console.log(`[WARN] pgmq job archived after ${message.read_ct} attempts`, {
        msgId: message.msg_id,
        type: message.message.type,
      });
    }
    // Otherwise, message will become visible again after visibility timeout
  }
}

async function processPgmqQueues() {
  console.log("[INFO] Processing pgmq queues...");

  const queues = [QUEUE_NAMES.AUTOSNIPING, QUEUE_NAMES.ALERTS, QUEUE_NAMES.METRICS];
  let totalProcessed = 0;

  for (const queueName of queues) {
    try {
      // Process up to BATCH_SIZE messages per queue
      for (let i = 0; i < BATCH_SIZE; i++) {
        const message = await popFromSupabaseQueue(queueName, 30); // 30 second visibility timeout

        if (!message) {
          break; // No more messages in this queue
        }

        await handlePgmqJob(message, queueName);
        totalProcessed++;
      }
    } catch (error) {
      console.error(`[ERROR] Failed to process queue: ${queueName}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`[INFO] pgmq processing complete. Processed ${totalProcessed} message(s)`);
  return totalProcessed;
}

// ========================================
// Main Execution
// ========================================

async function main() {
  let dbJobsProcessed = 0;
  let pgmqJobsProcessed = 0;

  // Process DB queue jobs
  console.log("[INFO] Processing DB queue...");
  const dbJobs = await fetchPendingDbJobs();
  console.log(`[INFO] Found ${dbJobs.length} pending DB job(s)`);

  for (const job of dbJobs) {
    await handleDbJob(job);
    dbJobsProcessed++;
  }

  console.log(`[INFO] DB queue processing complete. Processed ${dbJobsProcessed} job(s)`);

  // Process pgmq queues if enabled
  if (PROCESS_PGMQ) {
    try {
      pgmqJobsProcessed = await processPgmqQueues();
    } catch (error) {
      console.error("[ERROR] pgmq processing failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue anyway - DB jobs were processed
    }
  } else {
    console.log("[INFO] pgmq processing skipped (PROCESS_PGMQ not enabled)");
  }

  // Summary
  console.log("[INFO] Hybrid job processing complete", {
    dbJobs: dbJobsProcessed,
    pgmqJobs: pgmqJobsProcessed,
    total: dbJobsProcessed + pgmqJobsProcessed,
  });

  process.exit(0);
}

main().catch((error) => {
  console.error("[FATAL] Job processor crashed", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
