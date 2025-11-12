import { and, eq, lt, or } from "drizzle-orm";
import { db } from "@/src/db";
import { jobs } from "@/src/db/migrations/schema";
import { DatabaseOperations } from "@/src/services/trading/consolidated/core-trading/utils/database-operations";
import { createSimpleLogger } from "@/src/lib/unified-logger";

const logger = createSimpleLogger("housekeeping-handler");

/**
 * Handle housekeeping job
 * Cleans up old jobs, snipe targets, and other stale data
 */
export async function handleHousekeepingJob() {
  const results = {
    jobsDeleted: 0,
    snipeTargetsDeleted: 0,
    errors: [] as string[],
  };

  try {
    logger.info("Starting housekeeping job");

    // Cleanup old completed/failed jobs (older than 7 days)
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      const deletedJobs = await db
        .delete(jobs)
        .where(
          and(
            or(eq(jobs.status, "completed"), eq(jobs.status, "failed")),
            lt(jobs.createdAt, cutoffDate.toISOString()),
          ),
        )
        .execute();

      results.jobsDeleted =
        typeof deletedJobs === "object" && deletedJobs && "rowCount" in deletedJobs
          ? (deletedJobs as any).rowCount ?? 0
          : 0;

      logger.info("Cleaned up old jobs", { count: results.jobsDeleted });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      results.errors.push(`Failed to cleanup jobs: ${errorMsg}`);
      logger.error("Failed to cleanup jobs", {}, error as Error);
    }

    // Cleanup old snipe targets (older than 30 days)
    try {
      const deletedTargets = await DatabaseOperations.cleanupOldSnipeTargets(30);
      results.snipeTargetsDeleted = deletedTargets;
      logger.info("Cleaned up old snipe targets", { count: deletedTargets });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      results.errors.push(`Failed to cleanup snipe targets: ${errorMsg}`);
      logger.error("Failed to cleanup snipe targets", {}, error as Error);
    }

    logger.info("Housekeeping job completed", results);

    return {
      success: results.errors.length === 0,
      ...results,
    };
  } catch (error) {
    logger.error("Housekeeping job failed", {}, error as Error);
    throw error;
  }
}
