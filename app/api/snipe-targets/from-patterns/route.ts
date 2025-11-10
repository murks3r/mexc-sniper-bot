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
  } catch (error) {
    // Error creating snipe targets from patterns - error logging handled by error handler middleware

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
