import { type NextRequest, NextResponse } from "next/server";
import { apiAuthWrapper } from "@/src/lib/api-auth";
import { createErrorResponse, createSuccessResponse } from "@/src/lib/api-response";
import { getUnifiedMexcServiceV2 } from "@/src/services/api/unified-mexc-service-v2";

export const runtime = "nodejs";

export const POST = apiAuthWrapper(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { symbol, quantity, type = "MARKET" } = body;

    if (!symbol || !quantity) {
      return NextResponse.json(
        createErrorResponse("Symbol and quantity are required", {
          received: { symbol, quantity, type },
        }),
        { status: 400 },
      );
    }

    const mexc = getUnifiedMexcServiceV2();

    // Place a market sell order
    const result = await mexc.placeOrder({
      symbol: symbol.toUpperCase(),
      side: "SELL",
      type: type.toUpperCase(),
      quantity: quantity.toString(),
      timeInForce: "IOC", // Immediate or Cancel for safety
    });

    if (!result.success) {
      return NextResponse.json(
        createErrorResponse(result.error || "Failed to place sell order", {
          symbol,
          quantity,
          type,
        }),
        { status: 500 },
      );
    }

    return NextResponse.json(
      createSuccessResponse(result.data, {
        message: `Successfully placed ${type} sell order for ${quantity} ${symbol}`,
        orderId: result.data?.orderId,
        symbol,
        quantity,
        type,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      createErrorResponse("Unexpected error placing sell order", {
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
});
