import { NextRequest, NextResponse } from "next/server";
import { requireAuthFromRequest } from "@/src/lib/supabase-auth-server";
import { patternTargetIntegrationService } from "@/src/services/data/pattern-detection/pattern-target-integration-service";

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await requireAuthFromRequest(request);
    console.log(`[Test Auth Pattern] User: ${user.email} (${user.id})`);

    // Create mock pattern matches for testing
    const mockPatterns = [
      {
        symbol: "TEST1",
        vcoinId: "test-vcoin-1",
        patternType: "ready_state",
        confidence: 85,
        riskLevel: "low",
        activityInfo: { activityTypes: ["test"] }
      },
      {
        symbol: "TEST2", 
        vcoinId: "test-vcoin-2",
        patternType: "pre_ready",
        confidence: 90,
        riskLevel: "medium",
        activityInfo: { activityTypes: ["test"] }
      }
    ];

    console.log(`[Test Auth Pattern] Creating targets for user ${user.id}...`);

    // Create targets using the authenticated user ID
    const results = await patternTargetIntegrationService.createTargetsFromPatterns(
      mockPatterns,
      user.id, // This should be your user ID, not "system"
      {
        minConfidenceForTarget: 75,
        enabledPatternTypes: ["ready_state", "pre_ready"],
        defaultPositionSizeUsdt: 50, // Smaller amount for testing
        maxConcurrentTargets: 10,
      }
    );

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`[Test Auth Pattern] Created ${successful.length} targets, ${failed.length} failed`);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email
        },
        targetsCreated: successful.length,
        targetsFailed: failed.length,
        results: results,
        message: `Test completed: ${successful.length} targets created for user ${user.email}`
      }
    });

  } catch (error) {
    console.error("Test auth pattern error:", error);
    
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json({
        success: false,
        error: "Authentication required",
        message: "Please sign in to test pattern creation",
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: "Test failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 