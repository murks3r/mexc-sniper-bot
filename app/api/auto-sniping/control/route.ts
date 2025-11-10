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
import { handleApiRouteError } from "@/src/lib/api-error-handler";
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
    // User authenticated via requireApiAuth

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
          // CRITICAL: Explicitly enable auto-sniping and set credentials
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

          // Ensure auto-sniping is explicitly enabled in core trading service
          const coreTrading = getCoreTrading();
          await coreTrading.updateConfig({
            autoSnipingEnabled: true,
            apiKey: userCreds.apiKey,
            secretKey: userCreds.secretKey,
            paperTradingMode: false,
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
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic method call on orchestrator
          (orchestrator as any).setCurrentUser?.(user.id);
          // Session user applied to orchestrator
        } catch {}

        // Ensure orchestrator is initialized before starting
        // CRITICAL: Disable auto-start during initialization to prevent starting without user ID
        const orchestratorStatus = await orchestrator.getStatus();
        if (!orchestratorStatus.isInitialized) {
          // Temporarily disable auto-start to prevent premature execution
          const originalConfig = orchestrator.getConfig();
          await orchestrator.updateConfig({ enabled: false });

          await orchestrator.initialize();

          // Restore original enabled setting (we'll manually start below with user ID set)
          await orchestrator.updateConfig({ enabled: originalConfig.enabled });
        }

        // CRITICAL: Set the current session user ID on the auto-sniping module AFTER initialization
        // but BEFORE starting. This ensures the preference lookup has the correct userId from the session.
        try {
          const coreTrading = getCoreTrading();
          const autoSnipingModule = (
            coreTrading as unknown as {
              autoSniping?: {
                setCurrentUser?: (userId: string) => void;
                getStatus?: () => { currentUserId?: string | null };
              };
            }
          ).autoSniping;
          if (autoSnipingModule && typeof autoSnipingModule.setCurrentUser === "function") {
            autoSnipingModule.setCurrentUser(user.id);
            // Verify user ID was set correctly
            const moduleStatus = autoSnipingModule.getStatus?.();
            if (moduleStatus?.currentUserId !== user.id) {
              throw new Error("Failed to verify user ID was set on auto-sniping module");
            }
            // Current user ID set and verified successfully
          } else {
            throw new Error("Auto-sniping module does not support setCurrentUser");
          }
        } catch (setUserErr) {
          // Failed to set current user ID
          throw new Error(
            `Failed to set session user ID: ${setUserErr instanceof Error ? setUserErr.message : String(setUserErr)}`,
          );
        }

        // Start orchestrator (now with user ID properly set)
        try {
          await orchestrator.start();
        } catch (startErr) {
          const msg = startErr instanceof Error ? startErr.message : String(startErr);
          // Orchestrator start failed
          return Response.json(
            createErrorResponse(`Failed to start auto-sniping: ${msg}`, {
              action: "start",
              timestamp: new Date().toISOString(),
            }),
            { status: 500 },
          );
        }

        // CRITICAL: Verify orchestrator state after start
        const status = await orchestrator.getStatus();

        // Validation: Ensure autoSnipingEnabled is true
        if (!status.autoSnipingEnabled) {
          return Response.json(
            createErrorResponse("Auto-sniping failed to enable - status check failed", {
              action: "start",
              status: {
                autoSnipingEnabled: status.autoSnipingEnabled,
                isActive: status.isActive,
                isHealthy: status.isHealthy,
              },
              timestamp: new Date().toISOString(),
            }),
            { status: 500 },
          );
        }

        // Validation: Verify user ID is set on auto-sniping module
        const coreTradingAfterStart = getCoreTrading();
        const autoSnipingModuleAfterStart = (
          coreTradingAfterStart as unknown as {
            autoSniping?: {
              getStatus?: () => { currentUserId?: string | null; isActive?: boolean };
            };
          }
        ).autoSniping;
        const moduleStatusAfterStart = autoSnipingModuleAfterStart?.getStatus?.();

        if (moduleStatusAfterStart?.currentUserId !== user.id) {
          return Response.json(
            createErrorResponse("User ID verification failed after start", {
              action: "start",
              expectedUserId: user.id,
              actualUserId: moduleStatusAfterStart?.currentUserId || null,
              timestamp: new Date().toISOString(),
            }),
            { status: 500 },
          );
        }

        // Best-effort: sync upcoming calendar listings into snipe targets for the system user only
        let syncSummary: { created?: number; updated?: number } | undefined;
        try {
          const syncResult = await calendarSyncService.syncCalendarToDatabase("system", {
            timeWindowHours: 72,
            forceSync: false,
            dryRun: false,
          });
          syncSummary = { created: syncResult.created, updated: syncResult.updated };
        } catch (_syncError) {
          // Calendar sync failed, continue without it
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

      case "status": {
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

      case "emergency_stop": {
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

      case "update_config": {
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
    const _user = await SupabaseAuthServer.requireAuthFromRequest(request);

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
    const _user = await SupabaseAuthServer.requireAuthFromRequest(request);

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
