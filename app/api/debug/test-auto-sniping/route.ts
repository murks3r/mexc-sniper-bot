import { NextRequest, NextResponse } from "next/server";
import { requireAuthFromRequest } from "@/src/lib/supabase-auth-server";
import { getCoreTrading } from "@/src/services/trading/consolidated/core-trading/base-service";

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await requireAuthFromRequest(request);
    console.log(`[Test Auto-Sniping] Testing for user: ${user.email} (${user.id})`);

    // Get the core trading service
    const coreTrading = getCoreTrading();
    
    // Initialize if needed
    if (!coreTrading.isInitialized) {
      console.log("[Test Auto-Sniping] Initializing core trading service...");
      await coreTrading.initialize();
    }

    // Test the auto-sniping process directly
    console.log(`[Test Auto-Sniping] Processing targets for user ${user.id}...`);
    
    // Get the auto-sniping module and test it
    const autoSnipingModule = (coreTrading as any).autoSniping;
    
    if (!autoSnipingModule) {
      throw new Error("Auto-sniping module not found");
    }

    // Call processSnipeTargets with the user ID
    const result = await autoSnipingModule.processSnipeTargets(user.id);
    
    console.log("[Test Auto-Sniping] Process result:", result);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email
        },
        processResult: result,
        message: `Auto-sniping test completed for ${user.email}`
      }
    });

  } catch (error) {
    console.error("Test auto-sniping error:", error);
    
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json({
        success: false,
        error: "Authentication required",
        message: "Please sign in to test auto-sniping",
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: "Test auto-sniping failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 