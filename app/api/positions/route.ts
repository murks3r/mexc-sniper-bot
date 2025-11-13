import { and, eq, type SQL } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/src/db";
import { positions } from "@/src/db/schemas/trading";
import { requireClerkAuth } from "@/src/lib/clerk-auth-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireClerkAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "open"; // "open", "closed", or "all"

    const conditions: SQL[] = [eq(positions.userId, user.id)];

    if (status !== "all") {
      conditions.push(eq(positions.status, status));
    }

    const openPositions = await db
      .select()
      .from(positions)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(positions.createdAt);

    return NextResponse.json({
      success: true,
      data: {
        positions: openPositions,
        count: openPositions.length,
      },
    });
  } catch (error) {
    // Failed to fetch positions - error logging handled by error handler middleware
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch positions",
      },
      { status: 500 },
    );
  }
}
