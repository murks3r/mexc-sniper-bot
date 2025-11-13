import { type NextRequest, NextResponse } from "next/server";
import { apiAuthWrapper } from "@/src/lib/api-auth";
import { createErrorResponse, createSuccessResponse } from "@/src/lib/api-response";
import { getUnifiedMexcServiceV2 } from "@/src/services/api/unified-mexc-service-v2";

export const dynamic = "force-dynamic";

export const GET = apiAuthWrapper(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || undefined;
    const limit = Number(searchParams.get("limit") || 50);
    const startTime = searchParams.get("startTime")
      ? Number(searchParams.get("startTime"))
      : undefined;
    const endTime = searchParams.get("endTime") ? Number(searchParams.get("endTime")) : undefined;

    const mexc = getUnifiedMexcServiceV2();

    // If no symbol provided, try to get all trades by calling without symbol
    // The underlying MEXC API should return all trades when no symbol is specified
    const result = await mexc.getTradeHistory(symbol, limit);

    if (!result.success) {
      return NextResponse.json(
        createErrorResponse(result.error || "Failed to fetch trade history", {
          symbol: symbol || "all",
          limit,
          startTime,
          endTime,
        }),
        { status: 500 },
      );
    }

    return NextResponse.json(
      createSuccessResponse(
        { trades: result.data || [] },
        {
          message: symbol ? `Trade history for ${symbol} fetched` : "All trade history fetched",
          count: (result.data || []).length,
          symbol: symbol || "all",
        },
      ),
    );
  } catch (error) {
    return NextResponse.json(
      createErrorResponse("Unexpected error fetching trade history", {
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
});
