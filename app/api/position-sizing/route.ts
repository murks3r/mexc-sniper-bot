/**
 * Dynamic Position Sizing API
 *
 * Provides endpoints for calculating and managing dynamic position sizes
 * based on user balance and risk management.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { handleApiRouteError } from "@/src/lib/api-error-handler";
import { createErrorResponse, createSuccessResponse } from "@/src/lib/api-response";
import { dynamicPositionSizingService } from "@/src/services/trading/dynamic-position-sizing";

/**
 * GET /api/position-sizing/calculate
 * Calculate dynamic position size based on current balance
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiAuth(request);
    const { searchParams } = new URL(request.url);

    // Parse optional configuration from query params
    const customConfig: any = {};

    if (searchParams.get("maxRiskPerTrade")) {
      customConfig.maxRiskPerTrade = parseFloat(searchParams.get("maxRiskPerTrade")!);
    }
    if (searchParams.get("minPositionSize")) {
      customConfig.minPositionSize = parseFloat(searchParams.get("minPositionSize")!);
    }
    if (searchParams.get("maxPositionSize")) {
      customConfig.maxPositionSize = parseFloat(searchParams.get("maxPositionSize")!);
    }
    if (searchParams.get("reserveRatio")) {
      customConfig.reserveRatio = parseFloat(searchParams.get("reserveRatio")!);
    }

    const result = await dynamicPositionSizingService.calculatePositionSize(user.id, customConfig);

    return NextResponse.json(
      createSuccessResponse({
        message: "Position size calculated successfully",
        data: {
          userId: user.id,
          calculation: result,
          timestamp: new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    return handleApiRouteError(error, "Failed to calculate position size");
  }
}

/**
 * POST /api/position-sizing/update
 * Update user's default position size preference
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireApiAuth(request);
    const body = await request.json();
    const { positionSize } = body;

    if (typeof positionSize !== "number" || positionSize <= 0) {
      return NextResponse.json(createErrorResponse("Position size must be a positive number"), {
        status: 400,
      });
    }

    if (positionSize < 10) {
      return NextResponse.json(createErrorResponse("Position size must be at least $10 USDT"), {
        status: 400,
      });
    }

    if (positionSize > 10000) {
      return NextResponse.json(createErrorResponse("Position size cannot exceed $10,000 USDT"), {
        status: 400,
      });
    }

    const success = await dynamicPositionSizingService.updateUserPositionSize(
      user.id,
      positionSize,
    );

    if (!success) {
      return NextResponse.json(createErrorResponse("Failed to update position size preference"), {
        status: 500,
      });
    }

    return NextResponse.json(
      createSuccessResponse({
        message: "Position size updated successfully",
        data: {
          userId: user.id,
          newPositionSize: positionSize,
          timestamp: new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    return handleApiRouteError(error, "Failed to update position size");
  }
}
