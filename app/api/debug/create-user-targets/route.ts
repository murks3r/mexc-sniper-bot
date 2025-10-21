import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/db";
import { snipeTargets } from "@/src/db/schemas/trading";
import { requireAuthFromRequest } from "@/src/lib/supabase-auth-server";

export async function POST(request: NextRequest) {
  try {
    // Get the currently authenticated user
    const user = await requireAuthFromRequest(request);
    console.log(`[Create User Targets] Creating targets for user: ${user.email} (${user.id})`);

    // Create some example snipe targets for the authenticated user
    const exampleTargets = [
      {
        userId: user.id,
        vcoinId: "9cce3b0fa9764bc1b2b9d4d80ff913fc",
        symbolName: "GXAI",
        entryStrategy: "market",
        positionSizeUsdt: 100.0,
        takeProfitLevel: 2,
        stopLossPercent: 5.0,
        status: "ready",
        priority: 1,
        targetExecutionTime: new Date("2025-07-27T10:00:38.328Z"),
        confidenceScore: 97.0,
        riskLevel: "low",
      },
      {
        userId: user.id,
        vcoinId: "830962d322be407f8024b34e555cc490", 
        symbolName: "SPON",
        entryStrategy: "market",
        positionSizeUsdt: 100.0,
        takeProfitLevel: 2,
        stopLossPercent: 5.0,
        status: "pending",
        priority: 2,
        targetExecutionTime: new Date("2025-07-29T09:00:38.328Z"),
        confidenceScore: 93.0,
        riskLevel: "medium",
      },
      {
        userId: user.id,
        vcoinId: "6eaaadc5b7b34416810eefc0fa6cbbf3",
        symbolName: "DREYAI", 
        entryStrategy: "market",
        positionSizeUsdt: 100.0,
        takeProfitLevel: 2,
        stopLossPercent: 5.0,
        status: "ready",
        priority: 1,
        targetExecutionTime: new Date("2025-07-27T08:00:38.328Z"),
        confidenceScore: 92.0,
        riskLevel: "low",
      },
      {
        userId: user.id,
        vcoinId: "f202be49743a4b10afd3b58452608d7d",
        symbolName: "CKY",
        entryStrategy: "market",
        positionSizeUsdt: 100.0,
        takeProfitLevel: 2,
        stopLossPercent: 5.0,
        status: "pending",
        priority: 3,
        targetExecutionTime: new Date("2025-07-27T07:00:38.328Z"),
        confidenceScore: 78.0,
        riskLevel: "low",
      }
    ];

    // Insert all targets for the user
    const results = await db
      .insert(snipeTargets)
      .values(exampleTargets)
      .returning();

    console.log(`✅ Created ${results.length} snipe targets for user ${user.email}`);

    return NextResponse.json({
      success: true,
      data: {
        targetsCreated: results.length,
        targets: results,
        user: {
          id: user.id,
          email: user.email
        },
        message: `Successfully created ${results.length} snipe targets for user ${user.email}`
      }
    });

  } catch (error) {
    console.error("Error creating user targets:", error);
    
    // Check for authentication errors
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json({
        success: false,
        error: "Authentication required",
        message: "Please sign in to create snipe targets",
        code: "AUTHENTICATION_REQUIRED",
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: "Failed to create snipe targets",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 