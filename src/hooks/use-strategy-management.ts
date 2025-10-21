"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useStatusRefresh } from "@/src/hooks/use-status-refresh";

/**
 * Strategy Management Hook
 *
 * Manages strategy selection, performance tracking, and real-time updates
 * Connects UI to Core Trading Service via the /api/strategies endpoint
 */

export interface StrategyPerformance {
  strategyId: string;
  successRate: number;
  averageProfit: number;
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export interface ActivePosition {
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  currentPnL: number;
  currentPnLPercentage: number;
  triggeredLevels: number;
  nextTarget: number;
}

export interface TradingStatus {
  isActive: boolean;
  tradingEnabled: boolean;
  paperTradingMode: boolean;
  healthStatus: boolean;
}

export interface StrategyMetrics {
  totalPnL: number;
  totalTrades: number;
  successRate: number;
  activePositionCount: number;
  maxPositions: number;
  uptime: number;
}

export interface StrategyData {
  activeStrategy: {
    id: string;
    name: string;
    description?: string;
    levels: Array<{
      percentage: number;
      multiplier: number;
      sellPercentage: number;
    }>;
  };
  availableStrategies: any[];
  strategyPerformance: Record<string, StrategyPerformance>;
  activePositions: ActivePosition[];
  tradingStatus: TradingStatus;
  metrics: StrategyMetrics;
}

export interface StrategyUpdateRequest {
  action: "switch" | "update" | "configure";
  strategyId?: string;
  config?: Record<string, unknown>;
}

/**
 * Main strategy management hook
 */
export function useStrategyManagement() {
  const queryClient = useQueryClient();
  const { refreshAllStatus } = useStatusRefresh();
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(true);
  const [optimisticIsActive, setOptimisticIsActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = window.sessionStorage.getItem("autosnipe-active");
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  // Query for strategy data
  const {
    data: strategyData,
    isLoading,
    error,
    refetch,
  } = useQuery<StrategyData>({
    queryKey: ["strategies"],
    queryFn: async () => {
      const response = await fetch("/api/strategies", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Failed to fetch strategies: ${response.statusText}`
        );
      }

      const result = await response.json();
      return result.data;
    },
    placeholderData: (prev) => prev,
    refetchInterval: isRealTimeEnabled ? 5000 : false, // Refetch every 5 seconds for real-time updates
    staleTime: 2000, // Consider data stale after 2 seconds
    gcTime: 10000, // Keep in cache for 10 seconds
  });

  // Also poll authoritative auto-sniping status to keep button state consistent across pages
  const { data: controlStatus } = useQuery<{
    isActive?: boolean;
    autoSnipingEnabled?: boolean;
    tradingEnabled?: boolean;
  }>({
    queryKey: ["auto-sniping-control-status"],
    queryFn: async () => {
      const res = await fetch("/api/auto-sniping/control", {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return {} as any;
      const json = await res.json();
      // The route returns { success, data: { status, ... } }
      // status is ServiceStatus; we care about autoSnipingEnabled/tradingEnabled
      const status = json?.data?.status ?? json?.data;
      // Persist to session storage to survive navigation
      try {
        if (typeof window !== "undefined" && status) {
          const activeVal =
            typeof (status as any)?.autoSnipingEnabled === "boolean"
              ? (status as any).autoSnipingEnabled
              : typeof status?.isActive === "boolean"
                ? status.isActive
                : undefined;
          if (typeof activeVal === "boolean") {
            window.sessionStorage.setItem(
              "autosnipe-active",
              JSON.stringify(activeVal)
            );
          }
        }
      } catch {}
      return status || {};
    },
    refetchInterval: isRealTimeEnabled ? 5000 : false,
    staleTime: 2000,
    placeholderData: (prev) => prev,
  });

  // Poll the same status endpoint the dashboard uses to avoid cross-page drift
  const { data: dashboardStatus } = useQuery<{ isActive?: boolean } | undefined>({
    queryKey: ["auto-sniping-status"],
    queryFn: async () => {
      const res = await fetch("/api/auto-sniping/status", {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return undefined;
      const json = await res.json();
      // endpoint returns { success, data }
      return json?.data as any;
    },
    refetchInterval: isRealTimeEnabled ? 5000 : false,
    staleTime: 2000,
    placeholderData: (prev) => prev,
  });

  // Mutation for strategy updates
  const strategyUpdateMutation = useMutation({
    mutationFn: async (request: StrategyUpdateRequest) => {
      const response = await fetch("/api/strategies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Failed to update strategy: ${response.statusText}`
        );
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch strategies data
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
    },
  });

  // Switch strategy function
  const switchStrategy = useCallback(
    async (strategyId: string) => {
      return strategyUpdateMutation.mutateAsync({
        action: "switch",
        strategyId,
      });
    },
    [strategyUpdateMutation]
  );

  // Update configuration function
  const updateConfiguration = useCallback(
    async (config: Record<string, unknown>) => {
      return strategyUpdateMutation.mutateAsync({
        action: "update",
        config,
      });
    },
    [strategyUpdateMutation]
  );

  // Toggle trading function
  const toggleTrading = useCallback(
    async (enabled: boolean) => {
      // Use the correct auto-sniping control endpoint
      const response = await fetch("/api/auto-sniping/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include authentication cookies
        body: JSON.stringify({
          action: enabled ? "start" : "stop",
          reason: `Trading ${enabled ? "started" : "stopped"} via dashboard`,
        }),
      });

      if (!response.ok) {
        // Extract error body if available
        let serverMessage = `Failed to ${enabled ? "start" : "stop"} trading`;
        let serverDetails: any = undefined;
        try {
          const errorData = await response.json();
          serverMessage = errorData?.error || errorData?.message || serverMessage;
          serverDetails = errorData?.details || errorData?.meta;
        } catch {
          // ignore json parse errors
        }
        // Special-case unauthorized to guide user
        if (response.status === 401) {
          throw new Error(
            serverMessage ||
              "Authentication required. Please sign in again and retry."
          );
        }
        throw new Error(serverMessage);
      }

      // Persist optimistic state immediately so UI survives navigation
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            "autosnipe-active",
            JSON.stringify(!!enabled)
          );
          setOptimisticIsActive(!!enabled);
        }
      } catch {}

      // Invalidate related queries for immediate UI updates
      refetch();
      queryClient.invalidateQueries({ queryKey: ["auto-sniping-control-status"] });
      queryClient.invalidateQueries({ queryKey: ["auto-sniping-status"] });
      queryClient.invalidateQueries({ queryKey: ["autoSniping", "status"] });
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
      queryClient.invalidateQueries({ queryKey: ["mexc", "unified-status"] });
      
      // Force a cross-page status refresh so the Dashboard tab reflects changes immediately
      try {
        await refreshAllStatus();
      } catch {}
      
      return response.json();
    },
    [refetch, refreshAllStatus, queryClient]
  );

  // Real-time control
  const enableRealTime = useCallback(() => {
    setIsRealTimeEnabled(true);
  }, []);

  const disableRealTime = useCallback(() => {
    setIsRealTimeEnabled(false);
  }, []);

  // Force refresh
  const forceRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["strategies"] });
  }, [queryClient]);

  return {
    // Data
    strategyData,
    isLoading,
    error,

    // Strategy operations
    switchStrategy,
    updateConfiguration,
    toggleTrading,

    // Real-time control
    isRealTimeEnabled,
    enableRealTime,
    disableRealTime,
    forceRefresh,

    // Status
    isUpdating: strategyUpdateMutation.isPending,
    updateError: strategyUpdateMutation.error,

    // Computed values
    activeStrategy: strategyData?.activeStrategy,
    availableStrategies: strategyData?.availableStrategies || [],
    strategyPerformance: strategyData?.strategyPerformance || {},
    activePositions: strategyData?.activePositions || [],
    tradingStatus: (() => {
      const base = strategyData?.tradingStatus || {
        isActive: false,
        tradingEnabled: false,
        paperTradingMode: true,
        healthStatus: false,
      };
      const mergedIsActive =
        typeof (controlStatus as any)?.autoSnipingEnabled === "boolean"
          ? (controlStatus as any).autoSnipingEnabled
          : typeof controlStatus?.isActive === "boolean"
            ? controlStatus.isActive
            : typeof base.isActive === "boolean"
              ? base.isActive
              : typeof dashboardStatus?.isActive === "boolean"
                ? dashboardStatus.isActive
                : base.isActive;
      const mergedTradingEnabled =
        typeof controlStatus?.tradingEnabled === "boolean"
          ? controlStatus.tradingEnabled
          : base.tradingEnabled;
      return { ...base, isActive: mergedIsActive, tradingEnabled: mergedTradingEnabled };
    })(),
    metrics: strategyData?.metrics || {
      totalPnL: 0,
      totalTrades: 0,
      successRate: 0,
      activePositionCount: 0,
      maxPositions: 0,
      uptime: 0,
    },
  };
}

/**
 * Hook for real-time strategy performance monitoring
 */
export function useStrategyPerformanceMonitor(strategyId?: string) {
  const { strategyData, isRealTimeEnabled } = useStrategyManagement();

  const specificPerformance = strategyId
    ? strategyData?.strategyPerformance[strategyId]
    : null;

  return {
    performance: specificPerformance,
    allPerformance: strategyData?.strategyPerformance,
    isRealTime: isRealTimeEnabled,
    lastUpdate: strategyData ? new Date() : null,
  };
}

/**
 * Hook for active positions monitoring
 */
export function useActivePositionsMonitor() {
  const { strategyData, isRealTimeEnabled } = useStrategyManagement();

  const totalPnL =
    strategyData?.activePositions.reduce(
      (sum, pos) => sum + pos.currentPnL,
      0
    ) || 0;

  const totalPnLPercentage = strategyData?.activePositions.length
    ? strategyData.activePositions.reduce(
        (sum, pos) => sum + pos.currentPnLPercentage,
        0
      ) / strategyData.activePositions.length
    : 0;

  return {
    positions: strategyData?.activePositions || [],
    totalPnL,
    totalPnLPercentage,
    positionCount: strategyData?.activePositions.length || 0,
    isRealTime: isRealTimeEnabled,
    lastUpdate: strategyData ? new Date() : null,
  };
}

/**
 * Hook for strategy comparison
 */
export function useStrategyComparison() {
  const { strategyPerformance, availableStrategies } = useStrategyManagement();

  const comparison = availableStrategies.map((strategy) => {
    const performance = strategyPerformance[strategy.id] || {
      strategyId: strategy.id,
      successRate: 0,
      averageProfit: 0,
      totalTrades: 0,
      winRate: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
    };

    return {
      strategy,
      performance,
      // Risk score (lower is better)
      riskScore: calculateRiskScore(performance),
      // Reward score (higher is better)
      rewardScore: calculateRewardScore(performance),
    };
  });

  // Sort by overall score (reward/risk ratio)
  const sortedComparison = comparison.sort((a, b) => {
    const scoreA = a.rewardScore / Math.max(a.riskScore, 0.1);
    const scoreB = b.rewardScore / Math.max(b.riskScore, 0.1);
    return scoreB - scoreA;
  });

  return {
    comparison: sortedComparison,
    bestStrategy: sortedComparison[0],
    worstStrategy: sortedComparison[sortedComparison.length - 1],
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateRiskScore(performance: StrategyPerformance): number {
  // Higher drawdown and lower success rate = higher risk
  const drawdownFactor = performance.maxDrawdown / 100;
  const successFactor = (100 - performance.successRate) / 100;
  return (drawdownFactor + successFactor) / 2;
}

function calculateRewardScore(performance: StrategyPerformance): number {
  // Higher profit and success rate = higher reward
  const profitFactor = Math.min(performance.averageProfit / 100, 1);
  const successFactor = performance.successRate / 100;
  const tradeFactor = Math.min(performance.totalTrades / 100, 1);
  return (profitFactor + successFactor + tradeFactor) / 3;
}
