/**
 * Queue Health Check API
 *
 * Monitors the hybrid queue system:
 * - DB Queue (jobs table) status and metrics
 * - Supabase pgmq status and metrics
 * - Execution mode configuration
 * - Processing performance
 */

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { EXECUTION_MODE } from "@/src/config/execution-mode";
import { db } from "@/src/db";

interface QueueHealthData {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  executionMode: {
    primary: string;
    inngestFallback: boolean;
    dualRun: boolean;
  };
  dbQueue: {
    status: string;
    pending: number;
    running: number;
    completed: number;
    dead: number;
    oldestPending: string | null;
    processingRate: number;
  };
  pgmqQueues: {
    status: string;
    autosniping: number;
    alerts: number;
    metrics: number;
    total: number;
  };
  recommendations: string[];
}

/**
 * Check DB queue health and metrics
 */
async function checkDbQueueHealth() {
  try {
    // Get job counts by status
    const [statusCounts] = await db.execute(sql`
      SELECT
        status,
        COUNT(*) as count,
        MIN(created_at) as oldest
      FROM jobs
      WHERE status IN ('pending', 'running', 'completed', 'dead')
      GROUP BY status
    `);

    interface StatusRow {
      status: string;
      count: number | string;
      oldest?: string;
    }

    const statusRows = statusCounts as unknown as StatusRow[];
    const counts = statusRows.reduce(
      (acc, row) => {
        const statusKey = row.status as keyof typeof acc;
        if (
          statusKey === "pending" ||
          statusKey === "running" ||
          statusKey === "completed" ||
          statusKey === "dead"
        ) {
          acc[statusKey] = Number(row.count);
        }
        if (row.status === "pending" && row.oldest) {
          acc.oldestPending = row.oldest;
        }
        return acc;
      },
      { pending: 0, running: 0, completed: 0, dead: 0, oldestPending: null as string | null },
    );

    // Calculate processing rate (completed jobs in last hour)
    const rateResult = await db.execute(sql`
      SELECT COUNT(*) as recent_completed
      FROM jobs
      WHERE status = 'completed'
        AND updated_at > datetime('now', '-1 hour')
    `);

    interface RateResult {
      recent_completed: number | string;
    }

    const rateRow = (rateResult as unknown as RateResult[])[0];
    const processingRate = Number(rateRow?.recent_completed || 0);

    // Determine status
    let status = "healthy";
    if (counts.dead > 10) status = "degraded";
    if (counts.pending > 50) status = "degraded";
    if (counts.running > 25) status = "degraded";

    return {
      status,
      ...counts,
      processingRate,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      pending: 0,
      running: 0,
      completed: 0,
      dead: 0,
      oldestPending: null,
      processingRate: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check pgmq queue health and metrics
 */
async function checkPgmqHealth() {
  try {
    // Try to get queue lengths using pgmq.metrics
    const [autosniping] = await db.execute(
      sql`SELECT queue_length FROM pgmq.metrics('autosniping_jobs')`,
    );
    const [alerts] = await db.execute(sql`SELECT queue_length FROM pgmq.metrics('alert_jobs')`);
    const [metrics] = await db.execute(sql`SELECT queue_length FROM pgmq.metrics('metrics_jobs')`);

    interface QueueMetric {
      queue_length: number | string;
    }

    const autosnipingMetric = (autosniping as unknown as QueueMetric[])[0];
    const alertsMetric = (alerts as unknown as QueueMetric[])[0];
    const metricsMetric = (metrics as unknown as QueueMetric[])[0];

    const queueLengths = {
      autosniping: Number(autosnipingMetric?.queue_length || 0),
      alerts: Number(alertsMetric?.queue_length || 0),
      metrics: Number(metricsMetric?.queue_length || 0),
    };

    const total = queueLengths.autosniping + queueLengths.alerts + queueLengths.metrics;

    // Determine status
    let status = "healthy";
    if (total > 100) status = "degraded";
    if (total > 500) status = "unhealthy";

    return {
      status,
      ...queueLengths,
      total,
    };
  } catch (error) {
    // pgmq might not be enabled or tables might not exist
    return {
      status: "unavailable",
      autosniping: 0,
      alerts: 0,
      metrics: 0,
      total: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generate health recommendations based on metrics
 */
function generateRecommendations(
  dbQueue: { pending: number; dead: number; oldestPending: string | null; processingRate: number },
  pgmqQueues: { total: number; status: string },
): string[] {
  const recommendations: string[] = [];

  if (dbQueue.pending > 50) {
    recommendations.push("High pending job count - consider increasing worker frequency");
  }

  if (dbQueue.dead > 10) {
    recommendations.push("High dead job count - investigate job failures");
  }

  if (dbQueue.oldestPending) {
    const age = Date.now() - new Date(dbQueue.oldestPending).getTime();
    if (age > 60 * 60 * 1000) {
      // 1 hour
      recommendations.push("Oldest pending job is over 1 hour old - check worker status");
    }
  }

  if (pgmqQueues.total > 100) {
    recommendations.push("High pgmq queue depth - consider scaling workers");
  }

  if (dbQueue.processingRate === 0) {
    recommendations.push("No jobs processed in last hour - verify workers are running");
  }

  if (EXECUTION_MODE.primary === "supabase" && pgmqQueues.status === "unavailable") {
    recommendations.push("pgmq unavailable but Supabase is primary - check pgmq extension");
  }

  return recommendations;
}

/**
 * GET /api/health/queues
 * Comprehensive queue health check
 */
export async function GET() {
  try {
    const dbQueue = await checkDbQueueHealth();
    const pgmqQueues = await checkPgmqHealth();
    const recommendations = generateRecommendations(dbQueue, pgmqQueues);

    // Determine overall status
    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (dbQueue.status === "degraded" || pgmqQueues.status === "degraded") {
      overallStatus = "degraded";
    }
    if (dbQueue.status === "unhealthy" || pgmqQueues.status === "unhealthy") {
      overallStatus = "unhealthy";
    }

    const healthData: QueueHealthData = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      executionMode: {
        primary: EXECUTION_MODE.primary,
        inngestFallback: EXECUTION_MODE.inngestFallback,
        dualRun: EXECUTION_MODE.dualRun,
      },
      dbQueue,
      pgmqQueues,
      recommendations,
    };

    // Determine HTTP status code based on queue health
    let httpStatus = 200;
    if (overallStatus === "degraded") {
      httpStatus = 207;
    } else if (overallStatus === "unhealthy") {
      httpStatus = 503;
    }

    return NextResponse.json(healthData, {
      status: httpStatus,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Queue health check failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
