import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/src/db";
import { apiCredentials } from "@/src/db/schema";
import { createUnifiedMexcServiceV2 } from "@/src/services/api/unified-mexc-service-v2";
import { getUserCredentials } from "@/src/services/api/user-credentials-service";

// API credentials test endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, provider = "mexc" } = body;

    console.info("[API-Credentials-Test] POST request", {
      userId: userId || "anonymous",
      provider,
      timestamp: new Date().toISOString(),
    });

    // Validation
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "User ID is required",
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    // Get user credentials from database
    let userCredentials;
    try {
      userCredentials = await getUserCredentials(userId, provider);
    } catch (error) {
      console.error("[API-Credentials-Test] Failed to get credentials:", error);

      if (error instanceof Error && error.message.includes("Encryption service unavailable")) {
        return NextResponse.json(
          {
            success: false,
            error: "Encryption service unavailable - please contact support",
            timestamp: new Date().toISOString(),
          },
          { status: 500 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to retrieve stored credentials",
          timestamp: new Date().toISOString(),
        },
        { status: 500 },
      );
    }

    if (!userCredentials) {
      return NextResponse.json(
        {
          success: false,
          error: "No credentials found for this user",
          timestamp: new Date().toISOString(),
        },
        { status: 404 },
      );
    }

    // Test credentials against MEXC API using a simpler endpoint
    try {
      // IMPORTANT: use a fresh instance with explicit credentials (no singleton)
      const mexcService = createUnifiedMexcServiceV2({
        apiKey: userCredentials.apiKey,
        secretKey: userCredentials.secretKey,
      });

      console.info("[API-Credentials-Test] Testing with basic ping endpoint");

      // Test basic API connectivity (ping endpoint - no auth required)
      const startTime = Date.now();
      let connectivityTest;

      try {
        // Try basic ping first
        const pingResponse = await fetch("https://api.mexc.com/api/v3/ping", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "MEXC-Sniper-Bot/1.0",
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        const responseTime = Date.now() - startTime;

        if (pingResponse.ok) {
          connectivityTest = {
            success: true,
            responseTime,
            connected: true,
          };
        } else {
          connectivityTest = {
            success: false,
            error: `HTTP ${pingResponse.status}: ${pingResponse.statusText}`,
            responseTime,
          };
        }
      } catch (pingError) {
        const responseTime = Date.now() - startTime;
        connectivityTest = {
          success: false,
          error: pingError instanceof Error ? pingError.message : "Network error",
          responseTime,
        };
      }

      if (!connectivityTest.success) {
        return NextResponse.json(
          {
            success: false,
            error: `MEXC API connectivity failed: ${connectivityTest.error}`,
            details: {
              connectivity: false,
              authentication: false,
              responseTime: connectivityTest.responseTime || 0,
            },
            timestamp: new Date().toISOString(),
          },
          { status: 400 },
        );
      }

      // Test authenticated endpoint (ACCOUNT INFO) - STRICT, no fallback
      let accountTest = null;
      try {
        console.info("[API-Credentials-Test] Testing account info access");
        accountTest = await mexcService.getAccountInfo();
        console.info("[API-Credentials-Test] Account info test result:", {
          success: accountTest?.success,
          hasData: !!accountTest?.data,
        });
      } catch (accountError) {
        console.warn("[API-Credentials-Test] Account info test failed:", accountError);
        accountTest = {
          success: false,
          error:
            accountError instanceof Error ? accountError.message : "Account info access failed",
        };
      }

      const validated = !!accountTest?.success;
      try {
        await db
          .update(apiCredentials)
          .set({ credentialsValid: validated, lastValidated: new Date() })
          .where(and(eq(apiCredentials.userId, userId), eq(apiCredentials.provider, provider)));
      } catch (e) {
        console.warn("[API-Credentials-Test] Failed to persist validation flag:", e);
      }

      if (!validated) {
        return NextResponse.json(
          {
            success: false,
            error:
              accountTest?.error || "Authenticated account check failed with provided credentials",
            details: {
              connectivity: true,
              authentication: false,
              responseTime: connectivityTest.responseTime || 0,
            },
            timestamp: new Date().toISOString(),
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          connectivity: true,
          authentication: true,
          accountAccess: true,
          responseTime: connectivityTest.responseTime || 0,
          status: "connected",
          provider,
          message: "Credentials verified with authenticated account access",
          timestamp: new Date().toISOString(),
        },
        message: "Credentials tested successfully",
      });
    } catch (mexcError) {
      console.error("[API-Credentials-Test] MEXC API error:", mexcError);

      const errorMessage =
        mexcError instanceof Error ? mexcError.message : "Unknown MEXC API error";

      return NextResponse.json(
        {
          success: false,
          error: `MEXC API test failed: ${errorMessage}`,
          details: {
            connectivity: false,
            authentication: false,
            errorType: mexcError instanceof Error ? mexcError.constructor.name : "Unknown",
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("[API-Credentials-Test] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error during credential test",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
