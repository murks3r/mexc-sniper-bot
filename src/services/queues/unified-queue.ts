/**
 * Unified Queue - Hybrid Architecture
 *
 * Routes jobs to appropriate backend based on job type and execution mode:
 * - Scheduled tasks (calendar_sync, risk_check, housekeeping) → DB queue
 * - High-throughput tasks (execution, alert, metric) → Supabase pgmq
 *
 * Feature flags (EXECUTION_MODE) control which systems are active.
 */

import { EXECUTION_MODE } from "../../config/execution-mode";
import { enqueueJob } from "../jobs/enqueue";
import { enqueueQueueJob, type QueueJob } from "./supabase-queues";

export type JobKind =
  | "calendar_sync"
  | "risk_check"
  | "housekeeping"
  | "execution"
  | "alert"
  | "metric";

/**
 * Enqueue a job using the unified queue abstraction.
 * Automatically routes to DB queue or pgmq based on job type.
 */
export async function enqueueJobUnified(type: JobKind, payload?: unknown) {
  // Scheduled tasks go to DB queue (when Supabase is primary or dual-run)
  if (type === "calendar_sync" || type === "risk_check" || type === "housekeeping") {
    if (EXECUTION_MODE.primary === "supabase" || EXECUTION_MODE.dualRun) {
      return enqueueJob({ type, payload });
    }
    // If Inngest is primary and not dual-run, skip DB queue
    // (Inngest handlers will process directly)
    return null;
  }

  // High-throughput tasks go to pgmq (execution, alert, metric)
  const message: QueueJob = { type, payload } as QueueJob;
  return enqueueQueueJob(message);
}
