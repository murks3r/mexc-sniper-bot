import { and, desc, eq, or, type SQL } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/src/db";
import { snipeTargets } from "@/src/db/schemas/trading";
import { requireClerkAuth } from "@/src/lib/clerk-auth-server";
import { calendarSyncService } from "@/src/services/calendar-to-database-sync";

export const dynamic = "force-dynamic";

// Create snipe target endpoint
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const _user = await requireClerkAuth();
    // Request from user

    // Manual creation is disabled: only system background processes create targets
    return NextResponse.json(
      {
        success: false,
        error: "Manual snipe target creation is disabled",
        message: "Targets are created automatically by the system",
        code: "SNIPE_TARGET_CREATION_DISABLED",
      },
      { status: 403 },
    );

    // Note: legacy manual creation code removed intentionally
  } catch (error) {
    // Error creating snipe target - error logging handled by error handler middleware

    // Check for authentication errors
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
          message: "Please sign in to create snipe targets",
          code: "AUTHENTICATION_REQUIRED",
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create snipe target",
        details: error instanceof Error ? error.message : "Unknown error",
        debug: process.env.NODE_ENV === "development" ? error : undefined,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await requireClerkAuth();
    // Fetching targets for user

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const includeAll = searchParams.get("includeAll") === "true";
    // Default includeSystem=true to show system-owned items alongside user items
    const includeSystem = searchParams.get("includeSystem") !== "false";

    // Build where clause
    let whereCond: SQL | undefined;
    if (includeAll) {
      // When includeAll=true, filter by status if provided, otherwise get all
      whereCond = status ? eq(snipeTargets.status, status) : undefined;
    } else {
      // When includeAll=false, filter by user ownership and optionally by status
      const ownerCond = includeSystem
        ? or(eq(snipeTargets.userId, user.id), eq(snipeTargets.userId, "system"))
        : eq(snipeTargets.userId, user.id);
      // Support "active" status which includes both "active" and "executing"
      if (status === "active") {
        whereCond = and(
          ownerCond,
          or(eq(snipeTargets.status, "active"), eq(snipeTargets.status, "executing")),
        );
      } else {
        whereCond = status ? and(ownerCond, eq(snipeTargets.status, status)) : ownerCond;
      }
    }

    // Fetch targets from database
    const baseQuery = db.select().from(snipeTargets);
    const targets = whereCond
      ? await baseQuery.where(whereCond).orderBy(desc(snipeTargets.createdAt)).limit(100)
      : await baseQuery.orderBy(desc(snipeTargets.createdAt)).limit(100);

    return NextResponse.json({
      success: true,
      data: targets,
      count: targets.length,
    });
  } catch (error) {
    // Error fetching snipe targets - error logging handled by error handler middleware

    // Check for authentication errors
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
          message: "Please sign in to view snipe targets",
          code: "AUTHENTICATION_REQUIRED",
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch snipe targets",
      },
      { status: 500 },
    );
  }
}

// Helper function to create snipe targets using real data (calendar sync/patterns)
async function _createFromPatternDetection(userId: string) {
  try {
    // Creating targets for user using real data

    // Use calendar-to-database sync to create real targets from upcoming launches
    const syncResult = await calendarSyncService.syncCalendarToDatabase(userId, {
      timeWindowHours: 72,
      forceSync: true,
      dryRun: false,
    });

    return NextResponse.json({
      success: true,
      data: {
        message: "Calendar sync completed",
        processed: syncResult.processed,
        created: syncResult.created,
        updated: syncResult.updated,
        skipped: syncResult.skipped,
        errors: syncResult.errors,
      },
    });
  } catch (error) {
    // Error creating snipe targets from patterns - error logging handled by error handler middleware

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create snipe targets from patterns",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
