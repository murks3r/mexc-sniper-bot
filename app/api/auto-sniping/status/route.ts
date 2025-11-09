import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/src/db";
import { positions, snipeTargets } from "@/src/db/schemas/trading";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiResponse, createSuccessResponse, HTTP_STATUS } from "@/src/lib/api-response";
import { UnifiedMexcValidationService } from "@/src/lib/unified-mexc-validation";
import { getUserCredentials } from "@/src/services/api/user-credentials-service";
import { getUnifiedAutoSnipingOrchestrator } from "@/src/services/trading/unified-auto-sniping-orchestrator";

// Do not auto-initialize/start orchestrator from status endpoint to avoid side-effects
// Module-level promise to prevent duplicate initialization
let orchestratorInitPromise: Promise<void> | null = null;

export async function GET(request: NextRequest) {
  try {
    // Initialize unified orchestrator once
    const orchestrator = getUnifiedAutoSnipingOrchestrator();
    if (!orchestrator.getStatus().isInitialized) {
      if (!orchestratorInitPromise) {
        orchestratorInitPromise = orchestrator.initialize();
      }
      await orchestratorInitPromise;
    }

    // Get authenticated user for user-specific status (session-based)
    const user = await requireApiAuth(request);
    console.info(`[API] Auto-sniping status request from user: ${user.email} (${user.id})`);

    // Get current orchestrator status
    const status = orchestrator.getStatus();

    // Get user-specific target counts from database
    const userTargetCounts = await getUserTargetCounts(user.id);
    console.info(`[API] User target counts for ${user.email}:`, userTargetCounts);

    // Validate MEXC credentials
    let credentialValidation: {
      isValid: boolean;
      error?: string;
      canTrade?: boolean;
      balanceUSDT?: number;
    } = { isValid: false };
    try {
      const userCreds = await getUserCredentials(user.id, "mexc");
      if (userCreds?.apiKey && userCreds?.secretKey) {
        const validation = await UnifiedMexcValidationService.validateCredentials(
          user.id,
          {
            apiKey: userCreds.apiKey,
            secretKey: userCreds.secretKey,
          },
          { timeoutMs: 5000, includeAccountInfo: true },
        );
        credentialValidation = {
          isValid: validation.credentialsValid,
          error: validation.error,
          canTrade: validation.credentialsValid && validation.connected === true,
          balanceUSDT: validation.accountInfo?.totalValue || 0,
        };
      } else {
        credentialValidation = {
          isValid: false,
          error: "No MEXC credentials configured",
        };
      }
    } catch (credError) {
      credentialValidation = {
        isValid: false,
        error: credError instanceof Error ? credError.message : "Credential validation failed",
      };
    }

    // Get open positions count
    const openPositionsCount = await db
      .select()
      .from(positions)
      .where(eq(positions.userId, user.id))
      .then((rows) => rows.filter((p) => p.status === "open").length)
      .catch(() => 0);

    // Structure the status response to match frontend expectations
    // Use the same status data structure as the control endpoint
    const statusData = {
      enabled: true,
      status: status.isActive ? "active" : "idle",
      isActive: status.isActive,
      isIdle: !status.isActive,

      // Enhanced target count information - use user-specific counts
      activeTargets: userTargetCounts.activeTargets,
      readyTargets: userTargetCounts.readyTargets,
      targetCounts: {
        memory: userTargetCounts.totalTargets, // Total in memory (if service was tracking)
        database: userTargetCounts.totalTargets, // Total in database
        unified: userTargetCounts.totalTargets, // Unified count
        isConsistent: true,
        source: "database",
      },

      // State consistency information - use status from control endpoint
      stateConsistency: {
        isConsistent: status.isHealthy,
        inconsistencies: status.isHealthy ? [] : ["Service health check failed"],
        recommendedActions: status.isHealthy ? [] : ["Check service configuration"],
        lastSyncTime: new Date().toISOString(),
      },

      // Frontend-expected fields - use status from control endpoint
      executedToday: 0, // Will be populated by actual execution tracking
      successRate: 0, // Will be populated by actual execution tracking
      totalProfit: 0, // Will be populated by actual execution tracking
      lastExecution: new Date().toISOString(),
      safetyStatus: status.isHealthy ? "safe" : "warning",
      patternDetectionActive: true,

      // Legacy fields for backward compatibility
      executionCount: 0,
      successCount: 0,
      errorCount: 0,
      uptime: status.metrics?.uptime || 0,
      config: {
        maxConcurrentTargets: 5,
        retryAttempts: 3,
        executionDelay: 1000,
      },
      health: {
        isHealthy: status.isHealthy,
        lastHealthCheck: new Date().toISOString(),
        memoryUsage: process.memoryUsage().heapUsed,
        stateConsistency: status.isHealthy,
        targetCountWarning: status.isHealthy ? null : "Service health check failed",
      },
      // Diagnostics
      diagnostics: {
        lastSnipeCheck: (status as any).lastSnipeCheck
          ? new Date((status as any).lastSnipeCheck).toISOString()
          : undefined,
        processedTargets: (status as any).processedTargets ?? undefined,
        successfulSnipes: (status as any).successfulSnipes ?? undefined,
        failedSnipes: (status as any).failedSnipes ?? undefined,
      },
      // Credential validation
      credentials: {
        isValid: credentialValidation.isValid,
        error: credentialValidation.error,
        canTrade: credentialValidation.canTrade,
        balanceUSDT: credentialValidation.balanceUSDT,
      },
      // Position tracking
      openPositions: openPositionsCount,
    };

    console.info("[API] Auto-sniping status retrieved successfully:", {
      status: statusData.status,
      isActive: statusData.isActive,
      autoSnipingActive: status.isActive,
      activeTargets: statusData.activeTargets,
      targetConsistency: statusData.stateConsistency.isConsistent,
      executionCount: statusData.executionCount,
    });

    return apiResponse(
      createSuccessResponse(statusData, {
        message: "Auto-sniping status retrieved successfully",
        timestamp: new Date().toISOString(),
      }),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    console.error("[API] Auto-sniping status error:", { error });

    // Check for authentication errors
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
          message: "Please sign in to view auto-sniping status",
          code: "AUTHENTICATION_REQUIRED",
        },
        { status: 401 },
      );
    }

    // Return fallback status data on error
    return apiResponse(
      createSuccessResponse(
        {
          enabled: true,
          status: "idle",
          isActive: false,
          isIdle: true,

          // Frontend-expected fields with fallback values
          activeTargets: 0,
          readyTargets: 0,
          targetCounts: {
            memory: 0,
            database: 0,
            unified: 0,
            isConsistent: false,
            source: "memory",
            warning: "Service unavailable - using fallback values",
          },
          stateConsistency: {
            isConsistent: false,
            inconsistencies: ["Service error - cannot verify state consistency"],
            recommendedActions: ["Check service health and restart if necessary"],
            lastSyncTime: "Never",
          },
          executedToday: 0,
          successRate: 0,
          totalProfit: 0,
          lastExecution: new Date().toISOString(),
          safetyStatus: "safe",
          patternDetectionActive: true,

          // Legacy fields for backward compatibility
          executionCount: 0,
          successCount: 0,
          errorCount: 0,
          uptime: 0,
          config: {
            maxConcurrentTargets: 5,
            retryAttempts: 3,
            executionDelay: 1000,
          },
          health: {
            isHealthy: false,
            lastHealthCheck: new Date().toISOString(),
            stateConsistency: false,
            targetCountWarning: "Service error",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        },
        {
          message: "Auto-sniping status retrieved with fallback data",
          warning: "Service health check failed - using default values",
          timestamp: new Date().toISOString(),
        },
      ),
      HTTP_STATUS.OK,
    );
  }
}

// Helper function to get user-specific target counts
async function getUserTargetCounts(userId: string) {
  try {
    // Query for all targets for this user
    const allTargets = await db
      .select({
        status: snipeTargets.status,
      })
      .from(snipeTargets)
      .where(eq(snipeTargets.userId, userId));

    // Count targets by status
    const readyTargets = allTargets.filter((t) => t.status === "ready").length;
    const activeTargets = allTargets.filter(
      (t) => t.status === "executing" || t.status === "active",
    ).length;
    const pendingTargets = allTargets.filter((t) => t.status === "pending").length;
    const totalTargets = allTargets.length;

    console.info(
      `[getUserTargetCounts] User ${userId}: total=${totalTargets}, ready=${readyTargets}, active=${activeTargets}, pending=${pendingTargets}`,
    );

    return {
      totalTargets,
      readyTargets,
      activeTargets,
      pendingTargets,
    };
  } catch (error) {
    console.error("[getUserTargetCounts] Failed to get user target counts:", error);
    return {
      totalTargets: 0,
      readyTargets: 0,
      activeTargets: 0,
      pendingTargets: 0,
    };
  }
}

// For testing purposes, allow OPTIONS
export async function OPTIONS() {
  return NextResponse.json(createSuccessResponse(null, { message: "CORS preflight request" }), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
