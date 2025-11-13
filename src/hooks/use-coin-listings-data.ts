/**
 * Hook for processing coin listings data
 * Extracted from coin-listings-board.tsx for better separation of concerns
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useMexcCalendar } from "./use-mexc-data";
import { usePatternSniper } from "./use-pattern-sniper";
import type { TradingTargetDisplay } from "../types/trading-display-types";

// Import types from the component to match signatures
interface CalendarEntry {
  vcoinId?: string;
  symbol?: string;
  firstOpenTime?: string | number;
  projectName?: string;
}

interface EnrichedCoin {
  id: string;
  vcoinId: string;
  symbol: string;
  firstOpenTime: string | number;
  projectName?: string;
  status: "calendar" | "monitoring" | "ready" | "executed";
  launchTime: Date;
  confidence?: number;
}

/**
 * Filter upcoming coins from calendar data - matches component implementation
 */
function filterUpcomingCoins(calendarData: CalendarEntry[]): CalendarEntry[] {
  return calendarData.filter((item) => {
    try {
      if (!item.firstOpenTime || !item.vcoinId) return false;
      const launchTime = new Date(item.firstOpenTime);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of today (00:00:00)

      // Only show listings within next 30 days to keep it manageable
      const maxFutureDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      return (
        launchTime.getTime() >= today.getTime() && launchTime.getTime() <= maxFutureDate.getTime()
      );
    } catch {
      return false;
    }
  });
}

/**
 * Limit displayed listings to prevent UI overload - matches component implementation
 */
function limitDisplayedListings(listings: CalendarEntry[], maxCount = 50): CalendarEntry[] {
  return listings
    .sort((a, b) => {
      const timeA = a.firstOpenTime ? new Date(a.firstOpenTime).getTime() : 0;
      const timeB = b.firstOpenTime ? new Date(b.firstOpenTime).getTime() : 0;
      return timeA - timeB;
    })
    .slice(0, maxCount);
}

/**
 * Enrich calendar data with pattern sniper state - matches component implementation
 */
function enrichCalendarData(
  calendarData: CalendarEntry[],
  pendingDetection: string[],
  readyTargets: Array<{ vcoinId?: string }>,
  executedTargets: string[],
): EnrichedCoin[] {
  return calendarData
    .filter((item) => item.vcoinId && item.symbol && item.firstOpenTime)
    .map((item) => {
      const vcoinId = item.vcoinId as string; // Safe due to filter above
      const symbol = item.symbol as string; // Safe due to filter above
      const firstOpenTime = item.firstOpenTime as number; // Safe due to filter above

      const isPending = pendingDetection.includes(vcoinId);
      const isReady = readyTargets.some((target) => target.vcoinId && target.vcoinId === vcoinId);
      const isExecuted = executedTargets.includes(vcoinId);

      let status: "calendar" | "monitoring" | "ready" | "executed" = "calendar";
      if (isExecuted) status = "executed";
      else if (isReady) status = "ready";
      else if (isPending) status = "monitoring";

      return {
        id: vcoinId,
        vcoinId,
        symbol,
        firstOpenTime,
        projectName: item.projectName,
        status,
        launchTime: new Date(firstOpenTime),
      };
    })
    .sort((a, b) => a.launchTime.getTime() - b.launchTime.getTime());
}

/**
 * Process executed targets for display - matches component implementation
 */
function processExecutedTargets(
  executedTargets: string[],
  enrichedCalendarData: EnrichedCoin[],
): EnrichedCoin[] {
  return executedTargets
    .map((vcoinId) => {
      const calendarEntry = enrichedCalendarData.find((coin) => coin.vcoinId === vcoinId);
      if (!calendarEntry) return null;
      return {
        ...calendarEntry,
        status: "executed" as const,
        launchTime: calendarEntry.launchTime || new Date(calendarEntry.firstOpenTime),
      };
    })
    .filter((coin): coin is EnrichedCoin => coin !== null);
}

/**
 * Hook for processing coin listings data
 * Extracted from coin-listings-board.tsx for better separation of concerns
 */
export function useCoinListingsData() {
  const {
    isMonitoring,
    isLoading,
    readyTargets,
    pendingDetection,
    executedTargets,
    stats,
    errors,
    startMonitoring,
    stopMonitoring,
    removeTarget,
    executeSnipe,
    forceRefresh,
  } = usePatternSniper();

  // Convert Sets to arrays for compatibility with component functions
  const pendingDetectionArray = Array.from(pendingDetection);
  const executedTargetsArray = Array.from(executedTargets);

  const { data: calendarData } = useMexcCalendar();

  // Fetch active targets count from database
  const { data: activeTargetsData } = useQuery({
    queryKey: ["snipe-targets", "active-count"],
    queryFn: async () => {
      const response = await fetch("/api/snipe-targets?status=active&includeSystem=true");
      if (!response.ok) throw new Error("Failed to fetch active targets");
      return response.json() as Promise<{ success: boolean; data: unknown[]; count: number }>;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 25000,
  });

  // Memoize expensive computations to prevent unnecessary re-renders
  const upcomingCoins = useMemo(() => {
    if (!Array.isArray(calendarData)) return [];
    return limitDisplayedListings(filterUpcomingCoins(calendarData), 50);
  }, [calendarData]);

  const readyTargetsMapped = useMemo(
    () =>
      readyTargets.map((target) => ({
        ...target,
        vcoinId: target.vcoinId?.toString(),
      })),
    [readyTargets],
  );

  const enrichedCalendarData = useMemo(
    () =>
      enrichCalendarData(upcomingCoins, pendingDetectionArray, readyTargetsMapped, executedTargetsArray),
    [upcomingCoins, pendingDetectionArray, readyTargetsMapped, executedTargetsArray],
  );

  const calendarTargets = useMemo(
    () => enrichedCalendarData.filter((c) => c.status === "calendar"),
    [enrichedCalendarData],
  );

  const monitoringTargets = useMemo(
    () => enrichedCalendarData.filter((c) => c.status === "monitoring"),
    [enrichedCalendarData],
  );

  const readyTargetsEnriched = useMemo(
    () =>
      readyTargets.map((target) => {
        const enriched: TradingTargetDisplay = {
          id: (target as { id?: number }).id,
          vcoinId: target.vcoinId?.toString() || "",
          symbol: (target as { symbol?: string }).symbol || "",
          projectName: (target as { projectName?: string }).projectName || "",
          launchTime: (target as { launchTime?: Date }).launchTime || new Date(),
          discoveredAt: (target as { discoveredAt?: Date }).discoveredAt || new Date(),
          confidence: (target as { confidence?: number }).confidence || 0,
          hoursAdvanceNotice:
            (target as { hoursAdvanceNotice?: number }).hoursAdvanceNotice || 0,
          priceDecimalPlaces: (target as { priceDecimalPlaces?: number }).priceDecimalPlaces || 8,
          quantityDecimalPlaces:
            (target as { quantityDecimalPlaces?: number }).quantityDecimalPlaces || 8,
          status: "ready" as const,
          targetTime: (target as { targetTime?: string }).targetTime,
        };
        return enriched;
      }),
    [readyTargets],
  );

  const executedTargetsEnriched = useMemo(
    () => processExecutedTargets(executedTargetsArray, enrichedCalendarData),
    [executedTargetsArray, enrichedCalendarData],
  );

  // Transform stats to match expected interface
  const transformedStats = useMemo(
    () => ({
      totalListings: stats?.totalListings || enrichedCalendarData.length,
      pendingDetection: stats?.pendingDetection || monitoringTargets.length,
      readyToSnipe: activeTargetsData?.count || 0, // Use database active targets count
      successRate: stats?.successRate,
    }),
    [stats, enrichedCalendarData.length, monitoringTargets.length, activeTargetsData?.count],
  );

  return {
    isMonitoring,
    isLoading,
    stats: transformedStats,
    errors,
    startMonitoring,
    stopMonitoring,
    removeTarget,
    executeSnipe,
    forceRefresh,
    enrichedCalendarData,
    calendarTargets,
    monitoringTargets,
    readyTargetsEnriched,
    executedTargetsEnriched,
    readyTargets,
  };
}

