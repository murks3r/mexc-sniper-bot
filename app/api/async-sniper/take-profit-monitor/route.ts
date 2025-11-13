/**
 * Take-Profit Monitor API
 *
 * Provides real-time position monitoring data from the database
 */

import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/src/db";
import { positions } from "@/src/db/schemas/trading";
import { apiAuthWrapper } from "@/src/lib/api-auth";
import { requireClerkAuth } from "@/src/lib/clerk-auth-server";

export const GET = apiAuthWrapper(async (request: NextRequest) => {
  try {
    const user = await requireClerkAuth();
    const userId = user.id;

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
        },
        { status: 401 },
      );
    }

    // Fetch open positions from database
    const openPositions = await db
      .select()
      .from(positions)
      .where(and(eq(positions.userId, userId), eq(positions.status, "open")))
      .orderBy(positions.entryTime);

    // Transform positions to match UI format
    const monitoredPositions = openPositions.map((pos) => ({
      positionId: pos.id,
      symbol: pos.symbolName,
      entryPrice: pos.entryPrice,
      quantity: pos.quantity.toString(),
      status: "monitoring" as const,
      takeProfitPrice: pos.takeProfitPrice,
      stopLossPrice: pos.stopLossPrice,
      entryTime: pos.entryTime.toISOString(),
      vcoinId: pos.vcoinId,
    }));

    return NextResponse.json({
      success: true,
      data: monitoredPositions,
      count: monitoredPositions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});
