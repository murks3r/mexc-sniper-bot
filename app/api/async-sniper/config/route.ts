/**
 * Async Sniper Config API
 *
 * Get and update async sniper configuration
 */

import { type NextRequest, NextResponse } from "next/server";
import { loadSniperConfig } from "@/src/config/sniper-config-loader";
import { apiAuthWrapper } from "@/src/lib/api-auth";

export const GET = apiAuthWrapper(async () => {
  try {
    const config = await loadSniperConfig();

    return NextResponse.json({
      success: true,
      data: {
        async: config.async,
        execution: config.execution,
        takeProfit: config.takeProfit,
        balanceGuard: config.balanceGuard,
      },
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

export const POST = apiAuthWrapper(async (request: NextRequest) => {
  try {
    const body = await request.json();

    // Validate config structure
    if (body.async && typeof body.async.enabled !== "undefined") {
      // Update config (in a real implementation, this would write to config file)
      // For now, we'll return the updated config structure
      const config = await loadSniperConfig();

      return NextResponse.json({
        success: true,
        message: "Config updated (read-only in current implementation)",
        data: {
          ...config,
          ...body,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Invalid config structure",
      },
      { status: 400 },
    );
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
