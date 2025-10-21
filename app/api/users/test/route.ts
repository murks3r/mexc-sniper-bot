import { NextResponse } from "next/server";
import { db } from "@/src/db";
import { user } from "@/src/db/schemas/auth";

// Create a test user for snipe targets
export async function POST() {
  try {
    const testUser = {
      id: "test-user-demo-1", 
      email: "demo@mexc-sniper.com",
      name: "Demo User",
      username: "demo_trader",
      emailVerified: true,
    };

    // Insert test user (ignore if already exists)
    const result = await db
      .insert(user)
      .values(testUser)
      .onConflictDoNothing()
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        user: result.length > 0 ? result[0] : testUser,
        message: result.length > 0 ? "Test user created" : "Test user already exists"
      }
    });

  } catch (error) {
    console.error("Error creating test user:", error);
    return NextResponse.json({
      success: false,
      error: "Failed to create test user",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 