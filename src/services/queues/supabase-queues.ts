/**
 * Supabase Queues (pgmq) - High-throughput job processing
 *
 * Used for:
 * - execution jobs (autosniping, order placement)
 * - alert jobs (safety notifications, trading alerts)
 * - metrics jobs (performance tracking, analytics)
 *
 * For scheduled tasks, use the DB queue (jobs table) instead.
 */

import { createClient } from "@supabase/supabase-js";
import { createSimpleLogger } from "@/src/lib/unified-logger";

const logger = createSimpleLogger("supabase-queues");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase URL and service role key must be configured for queue worker.");
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "pgmq_public" },
});

// Queue names for different job categories
export const QUEUE_NAMES = {
  AUTOSNIPING: "autosniping_jobs",
  ALERTS: "alert_jobs",
  METRICS: "metrics_jobs",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Job types routed to pgmq (high-throughput)
export type PgmqJobType = "execution" | "alert" | "metric" | "order_close";

export type PgmqJob<T = unknown> = {
  type: PgmqJobType;
  payload: T;
  priority?: number;
  idempotencyKey?: string;
};

export type PgmqMessage<T = unknown> = {
  msg_id: string;
  vt: string;
  read_ct: number;
  enqueued_at: string;
  message: PgmqJob<T>;
};

/**
 * Enqueue a job to Supabase pgmq
 */
export async function enqueueToSupabaseQueue<T = unknown>(
  queueName: QueueName,
  job: PgmqJob<T>,
): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.rpc("send", {
      queue_name: queueName,
      message: job,
    });

    if (error) {
      logger.error(`Failed to enqueue job to ${queueName}`, { job, error: error.message });
      throw error;
    }

    const msgId = data as string;
    logger.debug(`Job enqueued to ${queueName}`, { msgId, type: job.type });
    return msgId;
  } catch (error) {
    logger.error(`Error enqueueing to ${queueName}`, {}, error as Error);
    throw error;
  }
}

/**
 * Pop a job from Supabase pgmq (read and mark as invisible)
 */
export async function popFromSupabaseQueue<T = unknown>(
  queueName: QueueName,
  visibilityTimeoutSeconds = 30,
): Promise<PgmqMessage<T> | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc("read", {
      queue_name: queueName,
      vt: visibilityTimeoutSeconds,
      qty: 1,
    });

    if (error) {
      logger.error(`Failed to pop job from ${queueName}`, { error: error.message });
      throw error;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    const message = (Array.isArray(data) ? data[0] : data) as PgmqMessage<T>;
    logger.debug(`Job popped from ${queueName}`, {
      msgId: message.msg_id,
      type: message.message.type,
    });
    return message;
  } catch (error) {
    logger.error(`Error popping from ${queueName}`, {}, error as Error);
    throw error;
  }
}

/**
 * Mark a job as completed and remove from queue
 */
export async function deleteFromSupabaseQueue(queueName: QueueName, msgId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc("delete", {
      queue_name: queueName,
      msg_id: msgId,
    });

    if (error) {
      logger.error(`Failed to delete job from ${queueName}`, { msgId, error: error.message });
      throw error;
    }

    logger.debug(`Job deleted from ${queueName}`, { msgId });
  } catch (error) {
    logger.error(`Error deleting from ${queueName}`, { msgId }, error as Error);
    throw error;
  }
}

/**
 * Archive a failed job (move to dead letter queue)
 */
export async function archiveSupabaseQueueJob(queueName: QueueName, msgId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc("archive", {
      queue_name: queueName,
      msg_id: msgId,
    });

    if (error) {
      logger.error(`Failed to archive job from ${queueName}`, { msgId, error: error.message });
      throw error;
    }

    logger.info(`Job archived from ${queueName}`, { msgId });
  } catch (error) {
    logger.error(`Error archiving from ${queueName}`, { msgId }, error as Error);
    throw error;
  }
}

/**
 * Get queue metrics
 */
export async function getSupabaseQueueMetrics(queueName: QueueName): Promise<{
  queueLength: number;
  oldestMessageAge: number | null;
}> {
  try {
    const { data, error } = await supabaseAdmin.rpc("metrics", {
      queue_name: queueName,
    });

    if (error) {
      logger.error(`Failed to get metrics for ${queueName}`, { error: error.message });
      throw error;
    }

    return {
      queueLength: data?.queue_length ?? 0,
      oldestMessageAge: data?.oldest_msg_age_sec ?? null,
    };
  } catch (error) {
    logger.error(`Error getting metrics for ${queueName}`, {}, error as Error);
    throw error;
  }
}

// Legacy exports for backward compatibility
export type QueueJob = PgmqJob;
export const enqueueQueueJob = (job: QueueJob) =>
  enqueueToSupabaseQueue(QUEUE_NAMES.AUTOSNIPING, job);
export const popQueueJob = () => popFromSupabaseQueue(QUEUE_NAMES.AUTOSNIPING);
