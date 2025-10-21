import { NextResponse } from "next/server";
import { db } from "@/src/db";
import { snipeTargets } from "@/src/db/schemas/trading";
import { user } from "@/src/db/schemas/auth";

export async function GET() {
  try {
    console.log("🔍 [Database Check] Starting database debug...");
    
    // Check if we can connect to database
    const targetCount = await db.$count(snipeTargets);
    console.log(`📊 [Database Check] Found ${targetCount} snipe targets in database`);
    
    // Get all snipe targets
    const targets = await db
      .select()
      .from(snipeTargets)
      .limit(10);
    
    console.log("🎯 [Database Check] Latest snipe targets:", targets);
    
    // Check users table
    const userCount = await db.$count(user);
    console.log(`👥 [Database Check] Found ${userCount} users in database`);
    
    // Get sample users
    const users = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      })
      .from(user)
      .limit(5);
    
    console.log("👤 [Database Check] Sample users:", users);
    
    return NextResponse.json({
      success: true,
      data: {
        snipeTargets: {
          count: targetCount,
          targets: targets
        },
        users: {
          count: userCount,
          sampleUsers: users
        },
        timestamp: new Date().toISOString()
      },
      message: "Database check completed successfully"
    });
    
  } catch (error) {
    console.error("❌ [Database Check] Error:", error);
    return NextResponse.json({
      success: false,
      error: "Database check failed",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 