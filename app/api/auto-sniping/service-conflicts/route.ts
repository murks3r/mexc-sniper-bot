/**
 * Auto-Sniping Service Conflicts API
 *
 * Provides endpoint to check for service conflicts and get recommendations
 * for resolving duplicate auto-sniping services.
 */

import { type NextRequest, NextResponse } from "next/server";
import { createErrorResponse, createSuccessResponse } from "@/src/lib/api-response";
import { requireAuthFromRequest } from "@/src/lib/supabase-auth-server";
import { serviceConflictDetector } from "@/src/services/trading/service-conflict-detector";

/**
 * GET /api/auto-sniping/service-conflicts
 * Get current service conflict status
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuthFromRequest(request);
    console.info(`[Service Conflicts] Status request from user: ${user.email} (${user.id})`);

    // Get service conflict status
    const status = serviceConflictDetector.getStatus();

    return NextResponse.json(
      createSuccessResponse({
        serviceConflicts: status,
        recommendations: status.recommendations,
        isHealthy: !status.hasConflicts,
        timestamp: new Date().toISOString(),
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("[Service Conflicts] Error:", { error });

    // Handle authentication errors
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json(
        createErrorResponse("Authentication required", {
          message: "Please sign in to view service conflict status",
          code: "AUTHENTICATION_REQUIRED",
        }),
        { status: 401 },
      );
    }

    return NextResponse.json(
      createErrorResponse("Failed to get service conflict status", {
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
}

/**
 * POST /api/auto-sniping/service-conflicts
 * Force reset all services (emergency use)
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuthFromRequest(request);
    console.warn(`[Service Conflicts] Force reset requested by user: ${user.email} (${user.id})`);

    const body = await request.json().catch(() => ({}));
    const { action, reason } = body;

    if (action === "reset") {
      // Force reset all services
      serviceConflictDetector.reset();

      return NextResponse.json(
        createSuccessResponse({
          message: "Service conflicts reset successfully",
          action: "reset",
          reason: reason || "Manual reset requested",
          timestamp: new Date().toISOString(),
        }),
        { status: 200 },
      );
    }

    return NextResponse.json(
      createErrorResponse("Invalid action", {
        action,
        validActions: ["reset"],
      }),
      { status: 400 },
    );
  } catch (error) {
    console.error("[Service Conflicts] Reset error:", { error });

    // Handle authentication errors
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json(
        createErrorResponse("Authentication required", {
          message: "Please sign in to reset service conflicts",
          code: "AUTHENTICATION_REQUIRED",
        }),
        { status: 401 },
      );
    }

    return NextResponse.json(
      createErrorResponse("Failed to reset service conflicts", {
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
}
