import { type NextRequest, NextResponse } from "next/server";
import { requireAuthFromRequest } from "@/src/lib/supabase-auth-server";

// Create snipe targets from pattern detection results
export async function POST(request: NextRequest) {
  try {
    // Disallow manual target creation via this debug endpoint
    await requireAuthFromRequest(request);
    return NextResponse.json(
      {
        success: false,
        error: "Manual snipe target creation is disabled",
        message: "Targets are created automatically by the system",
        code: "SNIPE_TARGET_CREATION_DISABLED",
      },
      { status: 403 },
    );

    // Pattern detection results we found earlier
    const _patternResults = [
      {
        vcoinId: "9cce3b0fa9764bc1b2b9d4d80ff913fc",
        symbolName: "GXAI",
        confidenceScore: 97.0,
        riskLevel: "low",
        targetExecutionTime: "2025-07-27T10:00:38.328Z",
        priority: 1,
        status: "ready", // High confidence, ready for execution
      },
      {
        vcoinId: "830962d322be407f8024b34e555cc490",
        symbolName: "SPON",
        confidenceScore: 93.0,
        riskLevel: "medium",
        targetExecutionTime: "2025-07-29T09:00:38.328Z",
        priority: 2,
        status: "pending", // Longer lead time
      },
      {
        vcoinId: "6eaaadc5b7b34416810eefc0fa6cbbf3",
        symbolName: "DREYAI",
        confidenceScore: 92.0,
        riskLevel: "low",
        targetExecutionTime: "2025-07-27T08:00:38.328Z",
        priority: 1,
        status: "ready", // Short lead time, high confidence
      },
      {
        vcoinId: "f202be49743a4b10afd3b58452608d7d",
        symbolName: "CKY",
        confidenceScore: 78.0,
        riskLevel: "low",
        targetExecutionTime: "2025-07-27T07:00:38.328Z",
        priority: 3,
        status: "pending", // Lower confidence
      },
    ];

    // Legacy implementation removed
  } catch (error) {
    console.error("Error creating snipe targets from patterns:", error);

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

    // Check if it's a foreign key constraint error
    if (error instanceof Error && error.message.includes("foreign key constraint")) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found in database",
          details: error.message,
          suggestion: "User needs to be properly registered in the system",
        },
        { status: 400 },
      );
    }

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
