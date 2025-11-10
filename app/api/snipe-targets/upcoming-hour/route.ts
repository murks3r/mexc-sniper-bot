/**
 * Upcoming Hour Targets API Endpoint
 *
 * Returns snipe targets scheduled to execute within the next 60 minutes.
 * Used for production readiness verification.
 */

import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/src/db";
import { snipeTargets } from "@/src/db/schemas/trading";
import { requireAuthFromRequest } from "@/src/lib/supabase-auth-server";

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await requireAuthFromRequest(request);

    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Query targets that are:
    // 1. Status is "ready" or "active" (active targets whose execution time has passed)
    // 2. targetExecutionTime is within the next hour (or null, which means execute immediately)
    // 3. Not exceeded max retries
    // 4. Belong to user or system
    const queryResult = db
      .select({
        id: snipeTargets.id,
        userId: snipeTargets.userId,
        vcoinId: snipeTargets.vcoinId,
        symbolName: snipeTargets.symbolName,
        positionSizeUsdt: snipeTargets.positionSizeUsdt,
        status: snipeTargets.status,
        priority: snipeTargets.priority,
        confidenceScore: snipeTargets.confidenceScore,
        targetExecutionTime: snipeTargets.targetExecutionTime,
        currentRetries: snipeTargets.currentRetries,
        maxRetries: snipeTargets.maxRetries,
        riskLevel: snipeTargets.riskLevel,
        createdAt: snipeTargets.createdAt,
      })
      .from(snipeTargets)
      .where(
        and(
          // Status filter: ready or active (active targets whose execution time has passed)
          or(
            eq(snipeTargets.status, "ready"),
            and(
              eq(snipeTargets.status, "active"),
              or(
                isNull(snipeTargets.targetExecutionTime),
                lt(snipeTargets.targetExecutionTime, now),
              ),
            ),
          ),
          // Execution time filter: within next hour or null (execute immediately)
          or(
            isNull(snipeTargets.targetExecutionTime),
            and(
              gt(snipeTargets.targetExecutionTime, now),
              lt(snipeTargets.targetExecutionTime, oneHourFromNow),
            ),
          ),
          // Retry limit
          or(isNull(snipeTargets.currentRetries), lt(snipeTargets.currentRetries, 10)),
          // User filter
          or(eq(snipeTargets.userId, user.id), eq(snipeTargets.userId, "system")),
        ),
      )
      .orderBy(snipeTargets.priority)
      .orderBy(snipeTargets.targetExecutionTime)
      .limit(50);

    const upcomingTargets = await queryResult;

    // Ensure upcomingTargets is an array
    if (!Array.isArray(upcomingTargets)) {
      throw new Error(
        `Expected array but got ${typeof upcomingTargets}: ${JSON.stringify(upcomingTargets)}`,
      );
    }

    // Calculate time until execution for each target
    // Filter out any undefined/null targets and handle Date conversion
    const targetsWithTiming = upcomingTargets
      .filter((target): target is NonNullable<typeof target> => target != null)
      .map((target) => {
        const execTime = target.targetExecutionTime
          ? target.targetExecutionTime instanceof Date
            ? target.targetExecutionTime
            : new Date(target.targetExecutionTime)
          : null;
        const timeUntilExecution = execTime ? Math.max(0, execTime.getTime() - now.getTime()) : 0;
        const minutesUntilExecution = Math.floor(timeUntilExecution / (60 * 1000));

        return {
          ...target,
          targetExecutionTime: execTime?.toISOString() || null,
          timeUntilExecutionMs: timeUntilExecution,
          minutesUntilExecution,
          isReadyNow: timeUntilExecution === 0,
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        targets: targetsWithTiming,
        count: targetsWithTiming.length,
        summary: {
          readyNow: targetsWithTiming.filter((t) => t.isReadyNow).length,
          scheduledWithinHour: targetsWithTiming.filter((t) => !t.isReadyNow).length,
          earliestExecution:
            targetsWithTiming.length > 0 ? targetsWithTiming[0].targetExecutionTime : null,
          latestExecution:
            targetsWithTiming.length > 0
              ? targetsWithTiming[targetsWithTiming.length - 1].targetExecutionTime
              : null,
        },
        timestamp: now.toISOString(),
        window: {
          start: now.toISOString(),
          end: oneHourFromNow.toISOString(),
        },
      },
    });
  } catch (error) {
    // Check for authentication errors
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
          message: "Please sign in to view upcoming targets",
          code: "AUTHENTICATION_REQUIRED",
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch upcoming targets",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
