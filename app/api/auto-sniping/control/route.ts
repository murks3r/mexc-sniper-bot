import type { NextRequest } from "next/server";
import { getUserCredentials } from "@/src/services/api/user-credentials-service";
import { getUnifiedAutoSnipingOrchestrator } from "@/src/services/trading/unified-auto-sniping-orchestrator";

type UnifiedAutoSnipingOrchestrator = ReturnType<typeof getUnifiedAutoSnipingOrchestrator>;

import { requireApiAuth } from "@/src/lib/api-auth";
import { handleApiRouteError } from "@/src/lib/api-error-handler";
import { createErrorResponse, createSuccessResponse } from "@/src/lib/api-response";
import { requireClerkAuth } from "@/src/lib/clerk-auth-server";
import { calendarSyncService } from "@/src/services/calendar-to-database-sync";
import { getCoreTrading } from "@/src/services/trading/consolidated/core-trading/base-service";

export const dynamic = "force-dynamic";

/**
 * Auto-Sniping Control API Route
 *
 * Provides RESTful endpoints for external control of auto-sniping operations.
 * This fulfills the requirements from Vertical Slice 5 in the integration testing mission.
 *
 * Endpoints:
 * - POST /control with action=start: Start auto-sniping
 * - POST /control with action=stop: Stop auto-sniping
 * - POST /control with action=status: Get current status
 * - POST /control with action=emergency_stop: Emergency halt
 */

// Helper function to load and validate user credentials
async function loadUserCredentials(userId: string) {
  const userCreds = await getUserCredentials(userId, "mexc");
  if (!userCreds || !userCreds.apiKey || !userCreds.secretKey) {
    throw new Error("No active MEXC API credentials found for this user");
  }
  return userCreds;
}

// Helper function to update orchestrator and core trading configs
async function updateConfigs(
  orchestrator: UnifiedAutoSnipingOrchestrator,
  userCreds: { apiKey: string; secretKey: string },
) {
  await orchestrator.updateConfig({
    enabled: true,
    mexcConfig: {
      credentials: {
        apiKey: userCreds.apiKey,
        secretKey: userCreds.secretKey,
      },
      paperTradingMode: false,
    },
  });

  const coreTrading = getCoreTrading();
  await coreTrading.updateConfig({
    autoSnipingEnabled: true,
    apiKey: userCreds.apiKey,
    secretKey: userCreds.secretKey,
    paperTradingMode: false,
  });
}

// Helper function to set current user on orchestrator
function setCurrentUserOnOrchestrator(
  orchestrator: UnifiedAutoSnipingOrchestrator,
  userId: string,
) {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic method call on orchestrator
    (orchestrator as any).setCurrentUser?.(userId);
  } catch {
    // Ignore errors setting user on orchestrator
  }
}

// Helper function to initialize orchestrator if needed
async function ensureOrchestratorInitialized(orchestrator: UnifiedAutoSnipingOrchestrator) {
  const orchestratorStatus = await orchestrator.getStatus();
  if (!orchestratorStatus.isInitialized) {
    const originalConfig = orchestrator.getConfig();
    await orchestrator.updateConfig({ enabled: false });
    await orchestrator.initialize();
    await orchestrator.updateConfig({ enabled: originalConfig.enabled });
  }
}

// Helper function to set and verify user on auto-sniping module
async function setAndVerifyUserOnAutoSniping(userId: string) {
  const coreTrading = getCoreTrading();
  const autoSnipingModule = (
    coreTrading as unknown as {
      autoSniping?: {
        setCurrentUser?: (userId: string) => void;
        getStatus?: () => { currentUserId?: string | null };
      };
    }
  ).autoSniping;

  if (!autoSnipingModule || typeof autoSnipingModule.setCurrentUser !== "function") {
    throw new Error("Auto-sniping module does not support setCurrentUser");
  }

  autoSnipingModule.setCurrentUser(userId);
  const moduleStatus = autoSnipingModule.getStatus?.();

  if (moduleStatus?.currentUserId !== userId) {
    throw new Error("Failed to verify user ID was set on auto-sniping module");
  }
}

// Helper function to verify orchestrator state after start
async function verifyOrchestratorState(
  orchestrator: UnifiedAutoSnipingOrchestrator,
  userId: string,
) {
  const status = await orchestrator.getStatus();

  if (!status.autoSnipingEnabled) {
    throw new Error("Auto-sniping failed to enable - status check failed");
  }

  const coreTradingAfterStart = getCoreTrading();
  const autoSnipingModuleAfterStart = (
    coreTradingAfterStart as unknown as {
      autoSniping?: {
        getStatus?: () => { currentUserId?: string | null; isActive?: boolean };
      };
    }
  ).autoSniping;
  const moduleStatusAfterStart = autoSnipingModuleAfterStart?.getStatus?.();

  if (moduleStatusAfterStart?.currentUserId !== userId) {
    throw new Error("User ID verification failed after start");
  }

  return status;
}

// Helper function to sync calendar (best effort)
async function syncCalendarBestEffort() {
  try {
    const syncResult = await calendarSyncService.syncCalendarToDatabase("system", {
      timeWindowHours: 72,
      forceSync: false,
      dryRun: false,
    });
    return { created: syncResult.created, updated: syncResult.updated };
  } catch {
    return undefined;
  }
}

// Action handler for starting auto-sniping
async function handleStart(orchestrator: UnifiedAutoSnipingOrchestrator, user: { id: string }) {
  try {
    const userCreds = await loadUserCredentials(user.id);
    await updateConfigs(orchestrator, userCreds);
  } catch (credError) {
    return Response.json(
      createErrorResponse(
        credError instanceof Error ? credError.message : "Failed to load user credentials",
        {
          action: "start",
          recommendation: "Save valid API credentials in System Check > API Credentials",
          timestamp: new Date().toISOString(),
        },
      ),
      { status: 400 },
    );
  }

  setCurrentUserOnOrchestrator(orchestrator, user.id);
  await ensureOrchestratorInitialized(orchestrator);

  try {
    await setAndVerifyUserOnAutoSniping(user.id);
  } catch (setUserErr) {
    return Response.json(
      createErrorResponse(
        `Failed to set session user ID: ${setUserErr instanceof Error ? setUserErr.message : String(setUserErr)}`,
        {
          action: "start",
          timestamp: new Date().toISOString(),
        },
      ),
      { status: 500 },
    );
  }

  try {
    await orchestrator.start();
  } catch (startErr) {
    const msg = startErr instanceof Error ? startErr.message : String(startErr);
    return Response.json(
      createErrorResponse(`Failed to start auto-sniping: ${msg}`, {
        action: "start",
        timestamp: new Date().toISOString(),
      }),
      { status: 500 },
    );
  }

  try {
    const status = await verifyOrchestratorState(orchestrator, user.id);
    const syncSummary = await syncCalendarBestEffort();

    return Response.json(
      createSuccessResponse({
        message: "Auto-sniping started successfully",
        data: {
          started: true,
          autoSnipingActive: status.isActive,
          isHealthy: status.isHealthy,
          status: status,
          calendarSync: syncSummary,
          timestamp: new Date().toISOString(),
        },
      }),
    );
  } catch (verifyErr) {
    return Response.json(
      createErrorResponse(verifyErr instanceof Error ? verifyErr.message : "Verification failed", {
        action: "start",
        timestamp: new Date().toISOString(),
      }),
      { status: 500 },
    );
  }
}

// Action handler for stopping auto-sniping
async function handleStop(orchestrator: UnifiedAutoSnipingOrchestrator) {
  await orchestrator.stop();
  const finalStatus = await orchestrator.getStatus();
  return Response.json(
    createSuccessResponse({
      message: "Auto-sniping stopped successfully",
      data: {
        stopped: true,
        finalStatus,
        timestamp: new Date().toISOString(),
      },
    }),
  );
}

// Action handler for getting status
async function handleStatus(orchestrator: UnifiedAutoSnipingOrchestrator) {
  const status = await orchestrator.getStatus();
  return Response.json(
    createSuccessResponse({
      message: "Status retrieved successfully",
      data: {
        status,
        timestamp: new Date().toISOString(),
      },
    }),
  );
}

// Action handler for emergency stop
async function handleEmergencyStop(orchestrator: UnifiedAutoSnipingOrchestrator, reason?: string) {
  const stopReason = reason || "Manual emergency stop requested";
  await orchestrator.emergencyStop();
  return Response.json(
    createSuccessResponse({
      message: "Emergency stop executed successfully",
      data: {
        emergencyStopped: true,
        reason: stopReason,
        timestamp: new Date().toISOString(),
      },
    }),
  );
}

// Action handler for updating config
async function handleUpdateConfig(
  orchestrator: UnifiedAutoSnipingOrchestrator,
  config: Record<string, unknown>,
) {
  if (!config) {
    return Response.json(
      createErrorResponse("Config parameter is required for update_config action"),
      { status: 400 },
    );
  }

  await orchestrator.updateConfig(config);
  return Response.json(
    createSuccessResponse({
      message: "Configuration updated successfully",
      data: {
        configUpdated: true,
        newConfig: config,
        timestamp: new Date().toISOString(),
      },
    }),
  );
}

/**
 * POST /api/auto-sniping/control
 * Control auto-sniping operations
 */
export const POST = async (request: NextRequest) => {
  try {
    const user = await requireApiAuth(request);
    const body = await request.json();
    const { action, config, reason } = body;

    if (!action) {
      return Response.json(
        createErrorResponse("Action parameter is required", {
          validActions: ["start", "stop", "status", "emergency_stop", "update_config"],
        }),
        { status: 400 },
      );
    }

    const orchestrator = getUnifiedAutoSnipingOrchestrator();

    switch (action) {
      case "start":
        return await handleStart(orchestrator, user);
      case "stop":
        return await handleStop(orchestrator);
      case "status":
        return await handleStatus(orchestrator);
      case "emergency_stop":
        return await handleEmergencyStop(orchestrator, reason);
      case "update_config":
        return await handleUpdateConfig(orchestrator, config);
      default:
        return Response.json(
          createErrorResponse("Invalid action specified", {
            action,
            validActions: ["start", "stop", "status", "emergency_stop", "update_config"],
          }),
          { status: 400 },
        );
    }
  } catch (error) {
    return handleApiRouteError(error, "Auto-sniping control request failed");
  }
};

/**
 * GET /api/auto-sniping/control
 * Get current auto-sniping status (convenience endpoint)
 */
export const GET = async (_request: NextRequest) => {
  try {
    // Use new request-aware authentication
    const _user = await requireClerkAuth();

    const coreTrading = getCoreTrading();
    const status = await coreTrading.getServiceStatus();

    return Response.json(
      createSuccessResponse({
        message: "Auto-sniping status retrieved successfully",
        data: {
          status,
          timestamp: new Date().toISOString(),
          endpoints: {
            start: "POST /api/auto-sniping/control with action=start",
            stop: "POST /api/auto-sniping/control with action=stop",
            status: "GET /api/auto-sniping/control or POST with action=status",
            emergency_stop: "POST /api/auto-sniping/control with action=emergency_stop",
            update_config: "POST /api/auto-sniping/control with action=update_config",
          },
        },
      }),
    );
  } catch (error) {
    return handleApiRouteError(error, "Failed to retrieve auto-sniping status");
  }
};

/**
 * PUT /api/auto-sniping/control
 * Update auto-sniping configuration (convenience endpoint)
 */
export const PUT = async (request: NextRequest) => {
  try {
    // Use new request-aware authentication
    const _user = await requireClerkAuth();

    const config = await request.json();

    const coreTrading = getCoreTrading();
    const result = await coreTrading.updateConfig(config);

    if (result.success) {
      return Response.json(
        createSuccessResponse({
          message: "Configuration updated successfully",
          data: {
            configUpdated: true,
            newConfig: config,
            timestamp: new Date().toISOString(),
          },
        }),
      );
    } else {
      return Response.json(
        createErrorResponse(result.error || "Configuration update failed", {
          config,
        }),
        { status: 400 },
      );
    }
  } catch (error) {
    return handleApiRouteError(error, "Configuration update failed");
  }
};

/**
 * DELETE /api/auto-sniping/control
 * Emergency stop endpoint (convenience)
 */
export const DELETE = async (request: NextRequest) => {
  try {
    // Use new request-aware authentication
    const _user = await requireClerkAuth();

    const body = await request.json().catch(() => ({}));
    const { reason } = body;

    const stopReason = reason || "Emergency stop via DELETE endpoint";

    const coreTrading = getCoreTrading();
    await coreTrading.stopAutoSniping();
    await coreTrading.closeAllPositions(stopReason);

    return Response.json(
      createSuccessResponse({
        message: "Emergency stop executed successfully",
        data: {
          emergencyStopped: true,
          reason: stopReason,
          timestamp: new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    return handleApiRouteError(error, "Emergency stop failed");
  }
};
