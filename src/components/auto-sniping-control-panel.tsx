"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pause, Play, RefreshCw, Settings, Shield, Target } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useStatusRefresh } from "../hooks/use-status-refresh";
import { queryKeys } from "../lib/query-client";
import { createSimpleLogger } from "../lib/unified-logger";
import { StreamlinedCredentialStatus } from "./streamlined-credential-status";
// Removed: StreamlinedWorkflowStatus - component doesn't exist, using status display instead
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { useToast } from "./ui/use-toast";

// Zod schema for auto-sniping configuration
const AutoSnipingConfigSchema = z.object({
  enabled: z.boolean(),
  maxPositionSize: z.number().positive(),
  takeProfitPercentage: z.number().min(0.1).max(100),
  stopLossPercentage: z.number().min(0.1).max(100),
  patternConfidenceThreshold: z.number().min(50).max(100),
  maxConcurrentTrades: z.number().min(1).max(10),
  enableSafetyChecks: z.boolean(),
  enablePatternDetection: z.boolean(),
});

export type AutoSnipingConfig = z.infer<typeof AutoSnipingConfigSchema>;

// Zod schema for sniping status
const SnipingStatusSchema = z.object({
  isActive: z.boolean(),
  activeTargets: z.number(),
  readyTargets: z.number(),
  executedToday: z.number(),
  successRate: z.number(),
  totalProfit: z.number(),
  lastExecution: z.string().optional(),
  safetyStatus: z.enum(["safe", "warning", "critical", "emergency"]),
  patternDetectionActive: z.boolean(),
});

type SnipingStatus = z.infer<typeof SnipingStatusSchema>;

interface AutoSnipingControlPanelProps {
  className?: string;
}

export function AutoSnipingControlPanel({ className = "" }: AutoSnipingControlPanelProps) {
  const queryClient = useQueryClient();
  const { refreshAllStatus } = useStatusRefresh();
  const { toast } = useToast();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [intendedEnabled, setIntendedEnabled] = useState<boolean | null>(null);
  const logger = createSimpleLogger("AutoSnipingControlPanel");

  // Fetch sniping status with responsive updates
  const {
    data: status,
    isLoading: statusLoading,
    error: statusError,
  } = useQuery({
    queryKey: queryKeys.autoSniping.status(),
    queryFn: async (): Promise<SnipingStatus> => {
      logger.debug("Fetching auto-sniping status...");
      const response = await fetch("/api/auto-sniping/status", {
        credentials: "include", // Include authentication cookies
        cache: "no-store", // Disable browser cache
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch sniping status");
      }

      const parsedStatus = SnipingStatusSchema.parse(result.data);
      logger.debug("Status fetched", { isActive: parsedStatus.isActive });
      return parsedStatus;
    },
    staleTime: 0, // Always consider data stale to ensure fresh fetch on mount
    gcTime: 0, // Don't keep data in cache after component unmounts (formerly cacheTime)
    refetchInterval: 10000, // Auto-refresh every 10 seconds for real-time status
    refetchOnMount: "always", // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnReconnect: true, // Refetch on network reconnection
    retry: 2,
  });

  // Fetch configuration
  const { data: config } = useQuery({
    queryKey: queryKeys.autoSniping.config(),
    queryFn: async (): Promise<AutoSnipingConfig> => {
      const response = await fetch("/api/auto-sniping/config", {
        credentials: "include", // Include authentication cookies
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch configuration");
      }

      return AutoSnipingConfigSchema.parse(result.data);
    },
    retry: 2,
  });

  // Control mutations
  const toggleSnipingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await fetch("/api/auto-sniping/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for authentication
        body: JSON.stringify({ action: enabled ? "start" : "stop" }),
      });

      // Handle authentication errors specifically
      if (response.status === 401) {
        throw new Error(
          "Please sign in to use auto-sniping functionality. Redirecting to login...",
        );
      }

      const result = await response.json();

      if (!result.success) {
        // Provide specific error messages for common issues
        if (result.error?.includes("Authentication required")) {
          throw new Error("Authentication required. Please refresh the page and sign in again.");
        } else if (result.error?.includes("initialization")) {
          throw new Error(
            "Service initialization failed. Check your MEXC API credentials in environment settings.",
          );
        }

        throw new Error(result.error || `Failed to ${enabled ? "start" : "stop"} auto-sniping`);
      }

      // Return both the data and the enabled state for immediate UI update
      return { ...result.data, enabled };
    },
    onMutate: async (enabled: boolean) => {
      // Cancel any outgoing refetches to avoid race conditions
      await queryClient.cancelQueries({ queryKey: queryKeys.autoSniping.status() });
      const prev = queryClient.getQueryData<SnipingStatus>(queryKeys.autoSniping.status());
      // Optimistically update status
      queryClient.setQueryData(
        queryKeys.autoSniping.status(),
        (old: SnipingStatus | undefined) => ({
          ...(old || {}),
          isActive: enabled,
        }),
      );
      return { previousStatus: prev } as { previousStatus?: SnipingStatus };
    },
    onSuccess: async (data, enabled) => {
      logger.info(`Auto-sniping ${enabled ? "started" : "stopped"} successfully`, {
        enabled,
        data,
      });

      // Immediately update the status query with the returned status from the control endpoint
      const serverIsActive = data?.status?.isActive;
      queryClient.setQueryData(
        queryKeys.autoSniping.status(),
        (old: SnipingStatus | undefined) => ({
          ...(old || {}),
          isActive: typeof serverIsActive === "boolean" ? serverIsActive : enabled,
          ...(data.status
            ? {
                activeTargets: data.status.activeTargets || old?.activeTargets || 0,
                readyTargets: data.status.readyTargets || old?.readyTargets || 0,
              }
            : {}),
        }),
      );

      // Invalidate to fetch fresh data in the background
      await queryClient.invalidateQueries({ queryKey: queryKeys.autoSniping.status() });
    },
    onError: (error, _vars, context) => {
      console.error("Auto-sniping control error:", error);
      // Rollback optimistic update
      if (context?.previousStatus) {
        queryClient.setQueryData(queryKeys.autoSniping.status(), context.previousStatus);
      }
      toast({
        title: "Auto-sniping action failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });

      // Handle authentication errors by redirecting to login
      if (error.message.includes("sign in") || error.message.includes("Authentication required")) {
        // Redirect to sign-in page after a brief delay
        setTimeout(() => {
          window.location.href = `/sign-in?redirect_to=${encodeURIComponent(window.location.pathname)}`;
        }, 2000);
      }
    },
    onSettled: async () => {
      setIntendedEnabled(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.autoSniping.status() });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Partial<AutoSnipingConfig>) => {
      const response = await fetch("/api/auto-sniping/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to update configuration");
      }

      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.autoSniping.config(),
      });
    },
  });

  const createTargetsFromPatternsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/snipe-targets?fromPatterns=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for authentication
      });

      // Handle authentication errors specifically
      if (response.status === 401) {
        throw new Error("Please sign in to create snipe targets. Redirecting to login...");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to create snipe targets from pattern detection");
      }

      return result.data;
    },
    onSuccess: async (data) => {
      logger.info("Created snipe targets from pattern detection", {
        targetsCreated: data.targetsCreated,
        data,
      });

      // Refresh all status and invalidate snipe targets queries
      await refreshAllStatus();
      queryClient.invalidateQueries({ queryKey: ["snipe-targets"] });
    },
    onError: (error) => {
      console.error("Create targets from patterns error:", error);

      // Handle authentication errors by redirecting to login
      if (error.message.includes("sign in") || error.message.includes("Authentication required")) {
        setTimeout(() => {
          window.location.href = `/sign-in?redirect_to=${encodeURIComponent(window.location.pathname)}`;
        }, 2000);
      }
    },
  });

  const handleToggleSniping = () => {
    const next = !status?.isActive;
    setIntendedEnabled(next);
    toggleSnipingMutation.mutate(next);
  };

  const _handleCreateTargetsFromPatterns = () => {
    createTargetsFromPatternsMutation.mutate();
  };

  const handleConfigUpdate = (
    key: keyof AutoSnipingConfig,
    value: AutoSnipingConfig[keyof AutoSnipingConfig],
  ) => {
    updateConfigMutation.mutate({ [key]: value });
  };

  const getSafetyStatusConfig = () => {
    switch (status?.safetyStatus) {
      case "safe":
        return { color: "green", icon: Shield, text: "Safe" };
      case "warning":
        return { color: "yellow", icon: AlertTriangle, text: "Warning" };
      case "critical":
        return { color: "red", icon: AlertTriangle, text: "Critical" };
      case "emergency":
        return { color: "red", icon: AlertTriangle, text: "Emergency" };
      default:
        return { color: "gray", icon: Shield, text: "Unknown" };
    }
  };

  const safetyConfig = getSafetyStatusConfig();
  const SafetyIcon = safetyConfig.icon;

  if (statusError) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Auto-Sniping Control</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load auto-sniping status: {statusError.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* MEXC API Status */}
      <StreamlinedCredentialStatus variant="card" autoRefresh={true} />

      {/* Auto-Sniping Control */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5" />
              <CardTitle>Auto-Sniping Control</CardTitle>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant={status?.isActive ? "default" : "secondary"}>
                {status?.isActive ? "Active" : "Stopped"}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.autoSniping.status(),
                  })
                }
                disabled={statusLoading}
              >
                <RefreshCw className={`h-4 w-4 ${statusLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          <CardDescription>
            {status
              ? `${status.activeTargets} active • ${status.readyTargets} ready • ${status.executedToday} trades today`
              : "Loading auto-sniping status..."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Main Control */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="font-medium">Auto-Sniping System</div>
              <div className="text-sm text-muted-foreground">
                {status?.isActive
                  ? "Actively monitoring for sniping opportunities"
                  : "Ready to start monitoring patterns and executing trades"}
              </div>
            </div>
            <Button
              size="lg"
              onClick={handleToggleSniping}
              disabled={toggleSnipingMutation.isPending || statusLoading}
              className={
                status?.isActive ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
              }
            >
              {toggleSnipingMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {intendedEnabled ? "Starting..." : "Stopping..."}
                </>
              ) : status?.isActive ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Stop Sniping
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Sniping
                </>
              )}
            </Button>
            {/* Errors are now surfaced via toast; no inline error block to avoid layout shift */}
          </div>

          {/* Status Metrics */}
          {status && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center p-3 border rounded">
                <div className="font-bold text-lg text-blue-600">{status.activeTargets}</div>
                <div className="text-muted-foreground">Active Targets</div>
              </div>
              <div className="text-center p-3 border rounded">
                <div className="font-bold text-lg text-green-600">{status.readyTargets}</div>
                <div className="text-muted-foreground">Ready Targets</div>
              </div>
              <div className="text-center p-3 border rounded">
                <div className="font-bold text-lg text-purple-600">{status.executedToday}</div>
                <div className="text-muted-foreground">Trades Today</div>
              </div>
              <div className="text-center p-3 border rounded">
                <div className="font-bold text-lg text-orange-600">
                  {status.successRate.toFixed(1)}%
                </div>
                <div className="text-muted-foreground">Success Rate</div>
              </div>
            </div>
          )}

          {/* Safety Status */}
          <div
            className={`p-3 border rounded-lg bg-${safetyConfig.color}-50 dark:bg-${safetyConfig.color}-950/20 border-${safetyConfig.color}-200 dark:border-${safetyConfig.color}-800`}
          >
            <div className="flex items-center space-x-2">
              <SafetyIcon className={`h-4 w-4 text-${safetyConfig.color}-600`} />
              <span
                className={`font-medium text-${safetyConfig.color}-700 dark:text-${safetyConfig.color}-300`}
              >
                Safety Status: {safetyConfig.text}
              </span>
            </div>
          </div>

          {/* Quick Configuration */}
          {config && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Quick Configuration</span>
                <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
                  <Settings className="h-4 w-4 mr-1" />
                  {showAdvanced ? "Hide" : "Show"} Advanced
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="safety-checks" className="text-sm">
                    Safety Checks
                  </Label>
                  <Switch
                    id="safety-checks"
                    checked={config.enableSafetyChecks}
                    onCheckedChange={(checked) => handleConfigUpdate("enableSafetyChecks", checked)}
                    disabled={updateConfigMutation.isPending}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="pattern-detection" className="text-sm">
                    Pattern Detection
                  </Label>
                  <Switch
                    id="pattern-detection"
                    checked={config.enablePatternDetection}
                    onCheckedChange={(checked) =>
                      handleConfigUpdate("enablePatternDetection", checked)
                    }
                    disabled={updateConfigMutation.isPending}
                  />
                </div>
              </div>

              {showAdvanced && (
                <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                  <div className="space-y-2">
                    <Label className="text-sm">Take Profit %</Label>
                    <div className="text-lg font-medium">{config.takeProfitPercentage}%</div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Stop Loss %</Label>
                    <div className="text-lg font-medium">{config.stopLossPercentage}%</div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Confidence Threshold</Label>
                    <div className="text-lg font-medium">{config.patternConfidenceThreshold}%</div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Max Concurrent</Label>
                    <div className="text-lg font-medium">{config.maxConcurrentTrades}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workflow Status - removed component, status shown in credential status above */}
    </div>
  );
}

export default AutoSnipingControlPanel;
