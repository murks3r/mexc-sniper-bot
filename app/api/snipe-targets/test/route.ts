import { NextResponse } from "next/server";

// Mock snipe targets for testing - bypasses user foreign key constraint
export async function POST() {
  try {
    // Create mock targets that will show up in the auto-sniping status
    const mockTargets = [
      {
        id: 1,
        userId: "demo-user",
        vcoinId: "9cce3b0fa9764bc1b2b9d4d80ff913fc", 
        symbolName: "GXAI",
        entryStrategy: "market",
        positionSizeUsdt: 100.0,
        takeProfitLevel: 2,
        stopLossPercent: 5.0,
        status: "ready", // This will show as an active target
        priority: 1,
        confidenceScore: 97.0,
        riskLevel: "low",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        userId: "demo-user",
        vcoinId: "6eaaadc5b7b34416810eefc0fa6cbbf3",
        symbolName: "DREYAI",
        entryStrategy: "market", 
        positionSizeUsdt: 100.0,
        takeProfitLevel: 2,
        stopLossPercent: 5.0,
        status: "pending", // This will show as a ready target
        priority: 1,
        confidenceScore: 92.0,
        riskLevel: "low",
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    ];

    // For demonstration, we'll just simulate that targets were created
    // In a real system, these would be in the database
    
    return NextResponse.json({
      success: true,
      message: "Mock snipe targets created for demonstration",
      data: {
        targetsCreated: mockTargets.length,
        targets: mockTargets,
        note: "These are simulated targets for demo purposes. In production, they would be stored in database."
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "Failed to create test targets",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
