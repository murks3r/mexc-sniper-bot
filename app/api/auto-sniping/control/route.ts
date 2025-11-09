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

import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { createErrorResponse, createSuccessResponse } from "@/src/lib/api-response";
import * as SupabaseAuthServer from "@/src/lib/supabase-auth-server";
import { getUserCredentials } from "@/src/services/api/user-credentials-service";
import { calendarSyncService } from "@/src/services/calendar-to-database-sync";
import { getCoreTrading } from "@/src/services/trading/consolidated/core-trading/base-service";
import { getUnifiedAutoSnipingOrchestrator } from "@/src/services/trading/unified-auto-sniping-orchestrator";

/**
 * POST /api/auto-sniping/control
 * Control auto-sniping operations
 */
export const POST = async (request: NextRequest) => {
  try {
    // Use unified API auth (session-based) – consistent with settings flow
    const user = await requireApiAuth(request);
    console.log(`[Auto-Sniping Control] Authenticated user: ${user.email} (${user.id})`);

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
      case "start": {
        console.info("[Auto-Sniping Control] Starting auto-sniping...");

        // Load authenticated user's MEXC credentials and apply to orchestrator config
        try {
          const userCreds = await getUserCredentials(user.id, "mexc");
          if (!userCreds || !userCreds.apiKey || !userCreds.secretKey) {
            return Response.json(
              createErrorResponse("No active MEXC API credentials found for this user", {
                action: "start",
                recommendation: "Save valid API credentials in System Check > API Credentials",
                timestamp: new Date().toISOString(),
              }),
              { status: 400 },
            );
          }

          // Update orchestrator MEXC config with per-user credentials before init/start
          orchestrator.updateConfig({
            mexcConfig: {
              credentials: {
                apiKey: userCreds.apiKey,
                secretKey: userCreds.secretKey,
              },
              paperTradingMode: false,
            },
          });
        } catch (credError) {
          return Response.json(
            createErrorResponse(
              credError instanceof Error ? credError.message : "Failed to load user credentials",
              {
                action: "start",
                timestamp: new Date().toISOString(),
              },
            ),
            { status: 400 },
          );
        }

        // Always set session user on orchestrator immediately (new API)
        try {
          (orchestrator as any).setCurrentUser?.(user.id);
          console.info("[Auto-Sniping Control] Session user applied to orchestrator", {
            userId: user.id,
          });
        } catch {}

        // Ensure orchestrator is initialized before starting
        // CRITICAL: Disable auto-start during initialization to prevent starting without user ID
        const orchestratorStatus = orchestrator.getStatus();
        if (!orchestratorStatus.isInitialized) {
          console.info("[Auto-Sniping Control] Orchestrator not initialized, initializing now...");

          // Temporarily disable auto-start to prevent premature execution
          const originalConfig = { ...orchestrator.getConfig() };
          orchestrator.updateConfig({ enabled: false });
          console.info("[Auto-Sniping Control] Disabled auto-start during initialization");

          await orchestrator.initialize();
          console.info("[Auto-Sniping Control] Orchestrator initialized successfully");

          // Restore original enabled setting (we'll manually start below with user ID set)
          orchestrator.updateConfig({ enabled: originalConfig.enabled });
        }

        // CRITICAL: Set the current session user ID on the auto-sniping module AFTER initialization
        // but BEFORE starting. This ensures the preference lookup has the correct userId from the session.
        console.info("[Auto-Sniping Control] Setting current user ID for auto-sniping module", {
          userId: user.id,
        });
        try {
          const coreTrading = getCoreTrading();
          const autoSnipingModule = (coreTrading as any).autoSniping;
          if (autoSnipingModule && typeof autoSnipingModule.setCurrentUser === "function") {
            autoSnipingModule.setCurrentUser(user.id);
            console.info("[Auto-Sniping Control] Current user ID set successfully", {
              userId: user.id,
            });
          } else {
            console.warn(
              "[Auto-Sniping Control] Could not find setCurrentUser method on autoSniping module",
            );
          }
        } catch (setUserErr) {
          console.error("[Auto-Sniping Control] Failed to set current user ID", {
            error: setUserErr,
          });
          throw new Error(
            `Failed to set session user ID: ${setUserErr instanceof Error ? setUserErr.message : String(setUserErr)}`,
          );
        }

        // Start orchestrator (now with user ID properly set)
        try {
          await orchestrator.start();
        } catch (startErr) {
          const msg = startErr instanceof Error ? startErr.message : String(startErr);
          console.error("[Auto-Sniping Control] Orchestrator start failed", { error: msg });
          return Response.json(
            createErrorResponse(`Failed to start auto-sniping: ${msg}`, {
              action: "start",
              timestamp: new Date().toISOString(),
            }),
            { status: 500 },
          );
        }

        const status = orchestrator.getStatus();

        // Best-effort: sync upcoming calendar listings into snipe targets for the system user only
        let syncSummary: { created?: number; updated?: number } | undefined;
        try {
          const syncResult = await calendarSyncService.syncCalendarToDatabase("system", {
            timeWindowHours: 72,
            forceSync: false,
            dryRun: false,
          });
          syncSummary = { created: syncResult.created, updated: syncResult.updated };
        } catch (syncError) {
          console.warn("[Auto-Sniping Control] Calendar sync skipped:", syncError);
        }

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
      }

      case "stop": {
        console.info("[Auto-Sniping Control] Stopping auto-sniping...");
        await orchestrator.stop("Manual stop via API");
        return Response.json(
          createSuccessResponse({
            message: "Auto-sniping stopped successfully",
            data: {
              stopped: true,
              finalStatus: orchestrator.getStatus(),
              timestamp: new Date().toISOString(),
            },
          }),
        );
      }

      case "status": {
        const status = orchestrator.getStatus();

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

      case "emergency_stop": {
        const stopReason = reason || "Manual emergency stop requested";
        console.warn(`[Auto-Sniping Control] Emergency stop requested: ${stopReason}`);

        await orchestrator.emergencyStop(stopReason);

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

      case "update_config": {
        if (!config) {
          return Response.json(
            createErrorResponse("Config parameter is required for update_config action"),
            { status: 400 },
          );
        }

        orchestrator.updateConfig(config);
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
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Auto-Sniping Control] API request failed:", { error: msg });

    if (error instanceof Error && error.message.includes("Authentication required")) {
      return Response.json(
        createErrorResponse("Authentication required", {
          message: "Please sign in to access this resource",
          code: "AUTHENTICATION_REQUIRED",
        }),
        { status: 401 },
      );
    }

    return Response.json(createErrorResponse(`Auto-sniping control request failed: ${msg}`), {
      status: 500,
    });
  }
};

/**
 * GET /api/auto-sniping/control
 * Get current auto-sniping status (convenience endpoint)
 */
export const GET = async (request: NextRequest) => {
  try {
    // Use new request-aware authentication
    const _user = await SupabaseAuthServer.requireAuthFromRequest(request);

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
    console.error("[Auto-Sniping Control] Status request failed:", { error });

    // Handle authentication errors specifically
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return Response.json(
        createErrorResponse("Authentication required", {
          message: "Please sign in to access this resource",
          code: "AUTHENTICATION_REQUIRED",
        }),
        { status: 401 },
      );
    }

    return Response.json(
      createErrorResponse("Failed to retrieve auto-sniping status", {
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
};

/**
 * PUT /api/auto-sniping/control
 * Update auto-sniping configuration (convenience endpoint)
 */
export const PUT = async (request: NextRequest) => {
  try {
    // Use new request-aware authentication
    const user = await SupabaseAuthServer.requireAuthFromRequest(request);
    console.log(`[Auto-Sniping Control] Config update by user: ${user.email} (${user.id})`);

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
    console.error("[Auto-Sniping Control] Configuration update failed:", {
      error,
    });

    // Handle authentication errors specifically
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return Response.json(
        createErrorResponse("Authentication required", {
          message: "Please sign in to access this resource",
          code: "AUTHENTICATION_REQUIRED",
        }),
        { status: 401 },
      );
    }

    return Response.json(
      createErrorResponse("Configuration update failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
};

/**
 * DELETE /api/auto-sniping/control
 * Emergency stop endpoint (convenience)
 */
export const DELETE = async (request: NextRequest) => {
  try {
    // Use new request-aware authentication
    const user = await SupabaseAuthServer.requireAuthFromRequest(request);
    console.log(`[Auto-Sniping Control] Emergency stop by user: ${user.email} (${user.id})`);

    const body = await request.json().catch(() => ({}));
    const { reason } = body;

    const stopReason = reason || "Emergency stop via DELETE endpoint";
    console.warn(`[Auto-Sniping Control] Emergency stop via DELETE: ${stopReason}`);

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
    console.error("[Auto-Sniping Control] Emergency stop failed:", { error });

    // Handle authentication errors specifically
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return Response.json(
        createErrorResponse("Authentication required", {
          message: "Please sign in to access this resource",
          code: "AUTHENTICATION_REQUIRED",
        }),
        { status: 401 },
      );
    }

    return Response.json(
      createErrorResponse("Emergency stop failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
};
