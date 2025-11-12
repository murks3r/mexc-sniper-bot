import { exec } from "node:child_process";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  apiResponse,
  createErrorResponse,
  createSuccessResponse,
  HTTP_STATUS,
} from "@/src/lib/api-response";
import { createSimpleLogger } from "@/src/lib/unified-logger";

const execAsync = promisify(exec);
const logger = createSimpleLogger("jobs-process-api");

/**
 * Check for pending work in both queue systems
 */
async function checkPendingWork(): Promise<{
  dbQueue: number;
  pgmqQueues: { autosniping: number; alerts: number; metrics: number };
}> {
  try {
    // Check DB queue
    const [dbResult] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM jobs
      WHERE status = 'pending'
        AND run_at <= now()
        AND attempts < max_attempts
    `);
    const dbQueue = Number(dbResult?.count || 0);

    // Check pgmq queues (using queue metrics)
    let pgmqQueues = { autosniping: 0, alerts: 0, metrics: 0 };

    try {
      const [autosniping] = await db.execute(
        sql`SELECT queue_length FROM pgmq.metrics('autosniping_jobs')`,
      );
      const [alerts] = await db.execute(sql`SELECT queue_length FROM pgmq.metrics('alert_jobs')`);
      const [metrics] = await db.execute(
        sql`SELECT queue_length FROM pgmq.metrics('metrics_jobs')`,
      );

      pgmqQueues = {
        autosniping: Number(autosniping?.queue_length || 0),
        alerts: Number(alerts?.queue_length || 0),
        metrics: Number(metrics?.queue_length || 0),
      };
    } catch (pgmqError) {
      // pgmq might not be set up yet, continue with zeros
      logger.debug("pgmq metrics not available (extension may not be enabled)", {
        error: pgmqError instanceof Error ? pgmqError.message : String(pgmqError),
      });
    }

    return { dbQueue, pgmqQueues };
  } catch (error) {
    logger.error("Failed to check pending work", {}, error as Error);
    throw error;
  }
}

/**
 * API endpoint to trigger hybrid job processing
 * Processes both DB queue and pgmq queues
 */
export async function POST() {
  try {
    logger.info("Hybrid job processing triggered via API");

    // Check for pending work across both queue systems
    const pendingWork = await checkPendingWork();
    const totalPending =
      pendingWork.dbQueue +
      pendingWork.pgmqQueues.autosniping +
      pendingWork.pgmqQueues.alerts +
      pendingWork.pgmqQueues.metrics;

    logger.info("Pending work detected", {
      dbQueue: pendingWork.dbQueue,
      pgmqQueues: pendingWork.pgmqQueues,
      total: totalPending,
    });

    if (totalPending === 0) {
      return apiResponse(
        createSuccessResponse(
          { pendingWork, processed: 0 },
          {
            message: "No pending jobs to process",
          },
        ),
        HTTP_STATUS.OK,
      );
    }

    // Execute the hybrid Bun job processor script
    const { stdout, stderr } = await execAsync("bun run scripts/process-jobs.ts", {
      cwd: process.cwd(),
      timeout: 120000, // 2 minute timeout
      env: {
        ...process.env,
        PROCESS_PGMQ: "true", // Signal to process pgmq queues too
      },
    });

    if (stderr && !stderr.includes("[INFO]") && !stderr.includes("[WARN]")) {
      logger.warn("Job processor stderr", { stderr: stderr.substring(0, 500) });
    }

    logger.info("Hybrid job processing completed", {
      output: stdout.substring(0, 500),
      pendingBefore: totalPending,
    });

    return apiResponse(
      createSuccessResponse(
        {
          pendingBefore: pendingWork,
          output: stdout,
        },
        {
          message: "Job processing completed successfully",
        },
      ),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    logger.error(
      "Job processing failed",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );

    return apiResponse(
      createErrorResponse(error instanceof Error ? error.message : "Unknown processing error"),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

/**
 * GET endpoint to check hybrid queue status
 */
export async function GET() {
  try {
    const pendingWork = await checkPendingWork();
    const totalPending =
      pendingWork.dbQueue +
      pendingWork.pgmqQueues.autosniping +
      pendingWork.pgmqQueues.alerts +
      pendingWork.pgmqQueues.metrics;

    return apiResponse(
      createSuccessResponse(
        {
          available: true,
          queues: pendingWork,
          totalPending,
        },
        {
          message: "Hybrid job processor API available",
          usage: "POST to this endpoint to trigger job processing",
        },
      ),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return apiResponse(
      createErrorResponse(error instanceof Error ? error.message : "Unknown error"),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
