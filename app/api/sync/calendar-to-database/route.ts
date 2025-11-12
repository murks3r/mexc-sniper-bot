import type { NextRequest } from "next/server";
import {
  apiResponse,
  createErrorResponse,
  createSuccessResponse,
  HTTP_STATUS,
} from "@/src/lib/api-response";
import { calendarSyncService } from "@/src/services/calendar-to-database-sync";
import { enqueueJob } from "@/src/services/jobs/enqueue";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      userId = "system",
      timeWindowHours = 24,
      forceSync = false,
      dryRun = false,
      useQueue = true,
    } = body;

    // Enqueue job for Bun-based processing (primary method)
    if (useQueue && !dryRun) {
      const job = await enqueueJob({
        type: "calendar_sync",
        payload: { userId, timeWindowHours, forceSync },
        runAt: new Date(),
      });

      return apiResponse(
        createSuccessResponse(
          { jobId: job.id, queuedAt: job.createdAt },
          {
            message: "Calendar sync job enqueued successfully",
            jobDetails: {
              id: job.id,
              type: job.type,
              runAt: job.runAt,
              status: job.status,
            },
          },
        ),
        HTTP_STATUS.CREATED,
      );
    }

    // Direct execution (for dryRun or when useQueue=false)
    const result = await calendarSyncService.syncCalendarToDatabase(userId, {
      timeWindowHours,
      forceSync,
      dryRun,
    });

    if (result.success) {
      return apiResponse(
        createSuccessResponse(result, {
          message: `Sync completed: ${result.created} created, ${result.updated} updated`,
          syncStatus: calendarSyncService.getSyncStatus(),
          targetsSummary: {
            created: result.created,
            updated: result.updated,
            processed: result.processed,
            errors: result.errors,
          },
        }),
        HTTP_STATUS.OK,
      );
    } else {
      return apiResponse(
        createErrorResponse(`Sync failed: ${result.errors.join(", ")}`, {
          ...result,
        }),
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }
  } catch (error) {
    // Calendar sync API error - error logging handled by error handler middleware
    return apiResponse(
      createErrorResponse(error instanceof Error ? error.message : "Unknown sync error"),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function GET() {
  try {
    const status = calendarSyncService.getSyncStatus();

    return apiResponse(
      createSuccessResponse(status, {
        message: "Calendar sync status retrieved successfully",
      }),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    // Calendar sync status error - error logging handled by error handler middleware
    return apiResponse(
      createErrorResponse(error instanceof Error ? error.message : "Unknown status error"),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
