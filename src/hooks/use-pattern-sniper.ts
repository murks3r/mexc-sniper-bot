import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { createSimpleLogger } from "@/src/lib/unified-logger";
import type { SniperStats } from "@/src/schemas/mexc-schemas";
import {
  type CalendarEntry,
  isValidForSnipe,
  type SymbolV2Entry,
} from "@/src/schemas/unified/mexc-api-schemas";
import type { OrderParameters, TradingTargetDisplay } from "@/src/types/trading-display-types";
import {
  normalizeVcoinId,
  safeGetProperty,
  validateTradingTarget,
} from "@/src/utils/trading-data-transformers";
import type { UserTradingPreferences } from "./use-user-preferences";

const logger = createSimpleLogger("use-pattern-sniper");

// API client functions that use backend routes
const apiClient = {
  async getCalendar() {
    const response = await fetch("/api/mexc/calendar");
    if (!response.ok) {
      throw new Error(`Calendar API failed: ${response.status}`);
    }
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Calendar API failed");
    }
    return { data: result.data };
  },

  async getSymbolsForVcoins(vcoinIds: string[]) {
    const params = new URLSearchParams();
    if (vcoinIds.length > 0) {
      params.append("vcoinId", vcoinIds.join(","));
    }

    const response = await fetch(`/api/mexc/symbols?${params}`);
    if (!response.ok) {
      throw new Error(`Symbols API failed: ${response.status}`);
    }
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Symbols API failed");
    }
    return { data: { symbols: result.data } };
  },

  async checkConnectivity() {
    const response = await fetch("/api/mexc/connectivity");
    if (!response.ok) {
      throw new Error(`Connectivity API failed: ${response.status}`);
    }
    const result = await response.json();
    const connected =
      typeof result.connected === "boolean"
        ? result.connected
        : typeof result.connectivity === "boolean"
          ? result.connectivity
          : false;
    return connected;
  },
};

async function fetchUserPreferences(userId: string): Promise<UserTradingPreferences | null> {
  try {
    const response = await fetch(`/api/user-preferences?userId=${encodeURIComponent(userId)}`);
    if (!response.ok) return null;
    return (await response.json()) as UserTradingPreferences;
  } catch {
    return null;
  }
}

// Query keys
export const queryKeys = {
  calendar: ["mexc", "calendar"] as const,
  symbolsV2: ["mexc", "symbolsV2"] as const,
  connectivity: ["mexc", "connectivity"] as const,
};

// Pattern Sniper Hook
export const usePatternSniper = () => {
  const queryClient = useQueryClient();

  // State management
  const [calendarTargets, setCalendarTargets] = useState<Map<string, CalendarEntry>>(new Map());
  const [pendingDetection, setPendingDetection] = useState<Set<string>>(new Set());
  const [readyTargets, setReadyTargets] = useState<Map<string, TradingTargetDisplay>>(new Map());
  const [executedTargets, setExecutedTargets] = useState<Set<string>>(new Set());
  const [isMonitoring, setIsMonitoring] = useState(() => {
    // Auto-snipe enabled by default - restore from localStorage if available
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("pattern-sniper-monitoring");
      return saved ? JSON.parse(saved) : true; // Default to true for auto-snipe
    }
    return true;
  });
  const [startTime, setStartTime] = useState<Date | null>(null);

  // Calendar monitoring query
  const {
    data: calendarData,
    error: calendarError,
    isLoading: calendarLoading,
    refetch: refetchCalendar,
  } = useQuery({
    queryKey: queryKeys.calendar,
    queryFn: apiClient.getCalendar,
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    staleTime: 4 * 60 * 1000, // 4 minutes
    retry: 3,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Symbols monitoring query (only when we have pending detections)
  const {
    data: symbolsData,
    error: symbolsError,
    isLoading: symbolsLoading,
    refetch: _refetchSymbols,
  } = useQuery({
    queryKey: [...queryKeys.symbolsV2, Array.from(pendingDetection)],
    queryFn: () => apiClient.getSymbolsForVcoins(Array.from(pendingDetection)),
    refetchInterval: pendingDetection.size > 0 ? 30 * 1000 : false, // 30 seconds when active
    staleTime: 25 * 1000, // 25 seconds
    enabled: pendingDetection.size > 0,
    retry: 3,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  // Connectivity monitoring
  const { data: isConnected } = useQuery({
    queryKey: queryKeys.connectivity,
    queryFn: apiClient.checkConnectivity,
    refetchInterval: 60 * 1000, // 1 minute
    staleTime: 50 * 1000, // 50 seconds
    retry: 1,
  });

  // Process calendar data to find new targets
  useEffect(() => {
    if (!calendarData?.data || !isMonitoring) return;

    const now = new Date();
    const newTargets = new Map(calendarTargets);
    const newPending = new Set(pendingDetection);

    let newListingsCount = 0;

    for (const entry of calendarData.data) {
      const launchTime = new Date(entry.firstOpenTime);

      // Only track future launches that we haven't seen before
      if (launchTime > now && !newTargets.has(entry.vcoinId)) {
        logger.info("New listing detected", {
          symbol: entry.symbol,
          projectName: entry.projectName,
          vcoinId: entry.vcoinId,
          launchTime: launchTime.toISOString(),
        });
        newTargets.set(entry.vcoinId, entry);
        newPending.add(entry.vcoinId);
        newListingsCount++;
      }
    }

    if (newListingsCount > 0) {
      logger.info("Added new targets for monitoring", { count: newListingsCount });
    }

    setCalendarTargets(newTargets);
    setPendingDetection(newPending);
  }, [calendarData, isMonitoring, calendarTargets, pendingDetection]);

  // Convert ready token to unified trading target
  const processReadyToken = useCallback(
    (vcoinId: string, symbol: SymbolV2Entry, calendar: CalendarEntry): TradingTargetDisplay => {
      if (!symbol.ca) {
        throw new Error(`Missing required symbol data for ${vcoinId}`);
      }

      // Derive a robust launch time:
      // 1) Prefer symbol.ot (number or numeric string). If seconds, convert to ms.
      // 2) Fallback to calendar.firstOpenTime.
      // 3) Fallback to now.
      let launchMs: number | null = null;
      if (typeof symbol.ot === "number") {
        launchMs = symbol.ot < 1e12 ? symbol.ot * 1000 : symbol.ot;
      } else if (typeof symbol.ot === "string") {
        const n = Number(symbol.ot);
        if (Number.isFinite(n)) {
          launchMs = n < 1e12 ? n * 1000 : n;
        }
      }
      if (!Number.isFinite(launchMs)) {
        if (typeof calendar.firstOpenTime === "number") {
          launchMs =
            calendar.firstOpenTime < 1e12 ? calendar.firstOpenTime * 1000 : calendar.firstOpenTime;
        } else {
          launchMs = Date.now();
        }
      }

      const launchTime = new Date(launchMs!);
      const hoursAdvanceRaw = (launchTime.getTime() - Date.now()) / (1000 * 60 * 60);
      const hoursAdvance = Number.isFinite(hoursAdvanceRaw) ? hoursAdvanceRaw : 0;

      const orderParams: OrderParameters = {
        orderType: "market",
        timeInForce: "IOC",
        reduceOnly: false,
      };

      return {
        vcoinId,
        symbol: String(symbol.ca),
        projectName: calendar.projectName || "Unknown Project",
        priceDecimalPlaces: Number.isFinite(Number(symbol.ps)) ? Number(symbol.ps) : 8,
        quantityDecimalPlaces: Number.isFinite(Number(symbol.qs)) ? Number(symbol.qs) : 6,
        launchTime,
        discoveredAt: new Date(),
        hoursAdvanceNotice: Number.isFinite(hoursAdvance) ? hoursAdvance : 0,
        confidence: 0,
        orderParameters: orderParams,
      };
    },
    [],
  );

  // Process symbols data to detect ready states
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex state processing logic with multiple conditions
  useEffect(() => {
    if (!symbolsData?.data?.symbols || pendingDetection.size === 0 || !isMonitoring) return;

    const symbols = symbolsData.data.symbols;
    const newPending = new Set(pendingDetection);
    const newReady = new Map(readyTargets);

    let newReadyCount = 0;

    for (const vcoinId of Array.from(pendingDetection)) {
      const symbol = symbols.find((s: SymbolV2Entry) => s.cd === vcoinId);

      if (symbol && isValidForSnipe(symbol)) {
        const calendar = calendarTargets.get(vcoinId);
        if (calendar && symbol.ca) {
          const target = processReadyToken(vcoinId, symbol, calendar);
          newReady.set(normalizeVcoinId(target.vcoinId), target);
          newPending.delete(vcoinId);
          newReadyCount++;

          logger.info("Ready state detected", {
            symbol: symbol.ca,
            projectName: calendar.projectName,
            vcoinId,
            pattern: `sts:${symbol.sts}, st:${symbol.st}, tt:${symbol.tt}`,
            hoursAdvanceNotice: target.hoursAdvanceNotice,
            priceDecimalPlaces: target.priceDecimalPlaces,
            quantityDecimalPlaces: target.quantityDecimalPlaces,
          });
        }
      }
    }

    if (newReadyCount > 0) {
      logger.info("New targets ready for sniping", { count: newReadyCount });
    }

    setPendingDetection(newPending);
    setReadyTargets(newReady);
  }, [
    symbolsData,
    pendingDetection,
    calendarTargets,
    readyTargets,
    isMonitoring,
    processReadyToken,
  ]);

  // Execute snipe order with auto exit manager integration
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex snipe execution logic with multiple error handling and state management
  const executeSnipe = useCallback(async (target: TradingTargetDisplay, userId?: string) => {
    // Validate target before execution
    if (!validateTradingTarget(target)) {
      logger.error("Invalid trading target provided to executeSnipe", { target });
      return;
    }

    const symbol = safeGetProperty(target, "symbol", "UNKNOWN");
    const projectName = safeGetProperty(target, "projectName", "Unknown Project");
    const launchTime = safeGetProperty(target, "launchTime", new Date());
    const orderParameters = safeGetProperty(target, "orderParameters", {});

    logger.info("Executing snipe", {
      symbol,
      projectName,
      launchTime: launchTime instanceof Date ? launchTime.toISOString() : String(launchTime),
      orderParameters,
      vcoinId: target.vcoinId,
    });

    const actualUserId = userId || "anonymous";

    try {
      // 1. Create snipe target entry in database for tracking
      const prefs = await fetchUserPreferences(actualUserId);
      const snipeTargetResponse = await fetch("/api/snipe-targets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: actualUserId,
          vcoinId: target.vcoinId,
          symbolName: target.symbol,
          entryStrategy: "market",
          positionSizeUsdt: prefs?.defaultBuyAmountUsdt ?? 100,
          takeProfitLevel: prefs?.defaultTakeProfitLevel ?? 2,
          stopLossPercent: prefs?.stopLossPercent ?? 5.0,
          status: "executing",
          priority: 1,
          targetExecutionTime: Math.floor(Date.now() / 1000),
          confidenceScore: target.confidence || 0.8,
          riskLevel: "medium",
        }),
      });

      const snipeTargetData = snipeTargetResponse.ok ? await snipeTargetResponse.json() : null;
      const snipeTargetId = snipeTargetData?.data?.id;

      // 2. Prepare trading parameters
      const tradingParams = {
        symbol: `${target.symbol}USDT`, // Assuming USDT trading pair
        side: "BUY",
        type: "MARKET", // Use market order for immediate execution
        quantity: target.orderParameters?.quantity || "10", // Default quantity
        userId: actualUserId,
        snipeTargetId, // Link to snipe target for tracking
      };

      logger.info("Executing real trading order via API", { tradingParams });

      // 3. Execute trading via server-side API
      const response = await fetch("/api/mexc/trade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tradingParams),
      });

      const result = await response.json();

      if (result.success && result.order) {
        logger.info("Snipe executed successfully", {
          symbol: target.symbol,
          orderId: result.order.orderId,
          status: result.order.status,
        });

        // 4. Update snipe target status to ready for exit monitoring
        if (snipeTargetId) {
          await fetch(`/api/snipe-targets/${snipeTargetId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: "ready", // Ready for exit monitoring
              actualExecutionTime: Math.floor(Date.now() / 1000),
              executionPrice: result.order.price || result.order.avgPrice,
              actualPositionSize: result.order.executedQty || result.order.quantity,
              executionStatus: "success",
            }),
          });
        }

        // 5. Start auto exit manager to monitor this position
        try {
          await fetch("/api/auto-exit-manager", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "start" }),
          });
          logger.info("Auto exit manager started for position monitoring");
        } catch (autoExitError) {
          logger.warn("Could not start auto exit manager", {
            error: autoExitError instanceof Error ? autoExitError.message : String(autoExitError),
          });
        }

        // Log execution details
        logger.info("Execution summary", {
          symbol: result.order.symbol,
          side: result.order.side,
          quantity: result.order.quantity,
          price: result.order.price || "MARKET",
          advanceNotice: target.hoursAdvanceNotice,
          discoveryTime:
            target.discoveredAt instanceof Date
              ? target.discoveredAt.toISOString()
              : String(target.discoveredAt),
          executionTime: new Date().toISOString(),
          snipeTargetId,
        });

        // Mark target as executed in local state
        setExecutedTargets((prev) => new Set([...prev, normalizeVcoinId(target.vcoinId)]));
        setReadyTargets((prev) => {
          const updated = new Map(prev);
          updated.delete(normalizeVcoinId(target.vcoinId));
          return updated;
        });

        // Show success notification
        alert(
          `🎉 Real trading order placed successfully!\nOrder ID: ${result.order.orderId}\nSymbol: ${result.order.symbol}\nQuantity: ${result.order.quantity}\n🎯 Auto exit monitoring started!`,
        );
      } else {
        // Update snipe target status to failed
        if (snipeTargetId) {
          await fetch(`/api/snipe-targets/${snipeTargetId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: "failed",
              executionStatus: "failed",
              errorMessage: result.error || result.message,
            }),
          });
        }

        logger.error("Snipe failed", {
          symbol: target.symbol,
          error: result.error || result.message,
        });
        alert(`Trading failed: ${result.error || result.message}`);
      }
    } catch (error) {
      logger.error("Snipe execution error", {
        symbol: target.symbol,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      alert(`Trading execution error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, []);

  // Auto-execution monitoring
  useEffect(() => {
    if (!isMonitoring || readyTargets.size === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      const newExecuted = new Set(executedTargets);

      for (const [_vcoinId, target] of Array.from(readyTargets)) {
        const normalizedVcoinId = normalizeVcoinId(target.vcoinId);
        if (executedTargets.has(normalizedVcoinId)) continue;

        const timeUntil = target.launchTime.getTime() - now.getTime();

        // Execute within 5 seconds of launch time
        if (timeUntil <= 0 && timeUntil > -5000) {
          executeSnipe(target);
          newExecuted.add(normalizedVcoinId);
        }
      }

      setExecutedTargets(newExecuted);
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [isMonitoring, readyTargets, executedTargets, executeSnipe]);

  // Control functions
  const startMonitoring = useCallback(() => {
    setIsMonitoring(true);
    setStartTime(new Date());

    // Save monitoring state to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("pattern-sniper-monitoring", "true");
    }

    logger.info("Pattern Sniper started (Auto-Snipe Active)");

    // Force refresh data when starting
    refetchCalendar();
  }, [refetchCalendar]);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);

    // Save monitoring state to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("pattern-sniper-monitoring", "false");
    }

    logger.info("Pattern Sniper stopped (Auto-Snipe Disabled)");
  }, []);

  const clearAllTargets = useCallback(() => {
    setCalendarTargets(new Map());
    setPendingDetection(new Set());
    setReadyTargets(new Map());
    setExecutedTargets(new Set());
    setStartTime(null);
    logger.info("All targets cleared");
  }, []);

  const forceRefresh = useCallback(() => {
    logger.info("Force refreshing all data");
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar });
    queryClient.invalidateQueries({ queryKey: queryKeys.symbolsV2 });
    queryClient.invalidateQueries({ queryKey: queryKeys.connectivity });
  }, [queryClient]);

  // Statistics calculation
  const stats: SniperStats = {
    totalListings: calendarTargets.size,
    pendingDetection: pendingDetection.size,
    readyToSnipe: readyTargets.size,
    executed: executedTargets.size,
    uptime: startTime ? (Date.now() - startTime.getTime()) / 1000 : 0,
    successRate:
      executedTargets.size > 0
        ? (executedTargets.size / (executedTargets.size + readyTargets.size)) * 100
        : 0,
  };

  return {
    // State
    isMonitoring,
    isConnected: isConnected ?? false,
    calendarTargets: Array.from(calendarTargets.values()),
    pendingDetection: Array.from(pendingDetection),
    readyTargets: Array.from(readyTargets.values()),
    executedTargets: Array.from(executedTargets),

    // Loading states
    isLoading: calendarLoading || symbolsLoading,
    errors: {
      calendar: calendarError,
      symbols: symbolsError,
    },

    // Statistics
    stats,

    // Actions
    startMonitoring,
    stopMonitoring,
    clearAllTargets,
    forceRefresh,

    // Advanced actions
    executeSnipe: (target: TradingTargetDisplay, userId?: string) => executeSnipe(target, userId),
    removeTarget: (vcoinId: string) => {
      const newTargets = new Map(calendarTargets);
      const newPending = new Set(pendingDetection);
      newTargets.delete(vcoinId);
      newPending.delete(vcoinId);
      setCalendarTargets(newTargets);
      setPendingDetection(newPending);
    },
  };
};
