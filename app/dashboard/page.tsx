"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AsyncSniperStatusPanel } from "@/src/components/async-sniper/async-sniper-status-panel";
import { BalanceGuardPanel } from "@/src/components/async-sniper/balance-guard-panel";
import { EventAuditLogPanel } from "@/src/components/async-sniper/event-audit-log-panel";
import { TakeProfitMonitorPanel } from "@/src/components/async-sniper/take-profit-monitor-panel";
import { useAuth } from "@/src/components/auth/supabase-auth-provider";
import { AutoSnipingControlPanel } from "@/src/components/auto-sniping-control-panel";
// Removed: AIEnhancedPatternDisplay - pattern detection simplified
import { DashboardLayout } from "@/src/components/dashboard-layout";
import {
  CoinListingsBoard,
  MetricCard,
  OptimizedAccountBalance,
  OptimizedActivityFeed,
  OptimizedTradingTargets,
  RecentTradesTable,
  TradingChart,
  UpcomingCoinsSection,
} from "@/src/components/dynamic-component-loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { useToast } from "@/src/components/ui/use-toast";
import { useAccountBalance } from "@/src/hooks/use-account-balance";
// Removed: useEnhancedPatterns - pattern detection simplified
import { useMexcCalendar } from "@/src/hooks/use-mexc-data";
import { useDeleteSnipeTarget } from "@/src/hooks/use-portfolio";
import { queryKeys } from "@/src/lib/query-client";
import { createSimpleLogger } from "@/src/lib/unified-logger";

export default function DashboardPage() {
  const logger = createSimpleLogger("DashboardPage");
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use authenticated user ID
  const userId = user?.id;

  // Hooks for trading operations
  const deleteSnipeTarget = useDeleteSnipeTarget();

  const { data: accountBalance, isLoading: balanceLoading } = useAccountBalance({
    userId: userId || "system",
    enabled: activeTab === "overview",
  });
  // Only fetch data when on overview tab to improve performance
  const { data: calendarData } = useMexcCalendar({ enabled: activeTab === "overview" });

  // Fetch active snipe targets specifically (include system targets)
  const { data: activeSnipeTargets, isLoading: activeSnipeLoading } = useQuery({
    queryKey: ["snipeTargets", userId || "system", "active"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("status", "active");
      params.set("includeSystem", "true"); // Include system targets
      const res = await fetch(`/api/snipe-targets?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) return [];
      return json.data || [];
    },
    enabled: activeTab === "overview",
    staleTime: 10_000,
  });

  // Fetch all snipe targets (for display, includes ready/pending/active)
  const { data: allSnipeTargets, isLoading: allSnipeLoading } = useQuery({
    queryKey: ["snipeTargets", userId, "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("includeAll", "true");
      const res = await fetch(`/api/snipe-targets?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) return [];
      return json.data || [];
    },
    enabled: activeTab === "overview" && !!userId,
    staleTime: 10_000,
  });

  // Removed: enhancedPatterns - pattern detection simplified

  // Handler functions for trading targets
  const handleExecuteSnipe = async (target: {
    id?: number;
    symbolName?: string;
    [key: string]: unknown;
  }) => {
    logger.info("Executing snipe for target", { target });

    try {
      // Execute snipe using the auto-sniping execution API
      const response = await fetch("/api/auto-sniping/execution", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          action: "start_execution",
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Execution Started",
          description: `Auto-sniping started. Target ${target.symbolName} will execute when conditions are met.`,
          variant: "default",
        });

        // Refresh relevant data without full reload
        try {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.snipeTargets(userId || "") }),
            queryClient.invalidateQueries({ queryKey: queryKeys.executionHistory(userId || "") }),
            queryClient.invalidateQueries({ queryKey: ["status", "unified"] }),
            queryClient.invalidateQueries({ queryKey: ["mexc", "unified-status"] }),
          ]);
        } catch {}
      } else {
        throw new Error(result.error || "Failed to execute snipe");
      }
    } catch (error) {
      logger.error(
        "Failed to execute snipe",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      toast({
        title: "Snipe Execution Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  const handleRemoveTarget = async (targetId: string | number) => {
    logger.info("Removing target", { targetId });

    try {
      await deleteSnipeTarget.mutateAsync(Number(targetId));

      toast({
        title: "Target Removed",
        description: "Snipe target has been successfully removed",
        variant: "default",
      });
    } catch (error) {
      logger.error(
        "Failed to remove target",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      toast({
        title: "Removal Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Fetch execution history for calculating metrics
  const { data: executionHistoryData } = useQuery({
    queryKey: ["execution-history", userId],
    queryFn: async () => {
      if (!userId) return null;

      const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
      const response = await fetch(
        `/api/execution-history?userId=${encodeURIComponent(userId)}&fromDate=${thirtyDaysAgo}&limit=1000`,
        { credentials: "include" },
      );

      if (!response.ok) return null;
      const data = await response.json();
      return data.success ? data.data : null;
    },
    enabled: !!userId,
    staleTime: 60 * 1000, // 1 minute cache
    placeholderData: null,
  });

  // Fetch historical balance for balance change calculation
  const { data: historicalBalance } = useQuery({
    queryKey: ["historical-balance", userId],
    queryFn: async () => {
      if (!userId) return null;

      const twentyFourHoursAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
      const response = await fetch(
        `/api/account/balance?userId=${encodeURIComponent(userId)}&timestamp=${twentyFourHoursAgo}`,
        { credentials: "include" },
      );

      if (!response.ok) return null;
      const data = await response.json();
      return data.success ? data.data?.totalUsdtValue || 0 : 0;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minute cache
    placeholderData: 0,
  });

  // Fetch historical calendar data for new listings change calculation
  const { data: historicalCalendarData } = useQuery({
    queryKey: ["historical-calendar-data"],
    queryFn: async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const response = await fetch(`/api/mexc/calendar?fromDate=${sevenDaysAgo.toISOString()}`, {
          credentials: "include",
        });

        if (!response.ok) return [];
        const data = await response.json();
        return data.success ? data.data || [] : [];
      } catch (error) {
        logger.error("Failed to fetch historical calendar data", { error });
        return [];
      }
    },
    enabled: true,
    staleTime: 10 * 60 * 1000, // 10 minute cache
    placeholderData: [],
  });

  // Fetch historical active snipe targets for comparison (compare apples to apples)
  const { data: historicalActiveTargets } = useQuery({
    queryKey: ["historical-active-targets"],
    queryFn: async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Get targets created in the last 7 days (regardless of current status)
        // This gives us a baseline of how many targets were active/created last week
        const params = new URLSearchParams();
        params.set("includeAll", "true");
        params.set("includeSystem", "true");
        const response = await fetch(`/api/snipe-targets?${params.toString()}`, {
          credentials: "include",
        });

        if (!response.ok) return [];
        const data = await response.json();
        if (!data.success) return [];

        // Filter targets created in the last 7 days
        const allTargets = data.data || [];
        const cutoffTime = sevenDaysAgo.getTime();
        return allTargets.filter(
          (target: { createdAt?: string | Date; [key: string]: unknown }) => {
            const createdAt = new Date(target.createdAt).getTime();
            return createdAt >= cutoffTime;
          },
        );
      } catch (error) {
        logger.error("Failed to fetch historical active targets", { error });
        return [];
      }
    },
    enabled: activeTab === "overview",
    staleTime: 10 * 60 * 1000, // 10 minute cache
    placeholderData: [],
  });

  // Transform snipe targets for display
  const transformedReadyTargets = useMemo(() => {
    // Combine all snipe targets (from allSnipeTargets) and active targets
    const allTargets = Array.isArray(allSnipeTargets) ? allSnipeTargets : [];
    const activeTargets = Array.isArray(activeSnipeTargets) ? activeSnipeTargets : [];

    // Merge and deduplicate by id
    const targetMap = new Map();
    [...allTargets, ...activeTargets].forEach((target: { id?: number; [key: string]: unknown }) => {
      if (target?.id) {
        targetMap.set(target.id, target);
      }
    });
    const combined = Array.from(targetMap.values());

    if (combined.length === 0) return [];

    // Filter to pending/ready/active targets and sort logically:
    // 1) ready first, 2) earlier execution time first, 3) higher confidence, 4) higher priority (lower number) first
    const filtered = combined.filter(
      (target: { status?: string; [key: string]: unknown }) =>
        target.status === "pending" || target.status === "ready" || target.status === "active",
    );

    const getExecMs = (te: string | number | Date | null | undefined): number => {
      if (typeof te === "number") return te < 1e12 ? te * 1000 : te;
      if (typeof te === "string") {
        const parsed = Date.parse(te);
        return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
      }
      return Number.POSITIVE_INFINITY;
    };

    filtered.sort(
      (
        a: {
          status?: string;
          targetExecutionTime?: string | number | Date;
          confidenceScore?: number;
          priority?: number;
          [key: string]: unknown;
        },
        b: {
          status?: string;
          targetExecutionTime?: string | number | Date;
          confidenceScore?: number;
          priority?: number;
          [key: string]: unknown;
        },
      ) => {
        const aReady = a.status === "ready" ? 0 : 1;
        const bReady = b.status === "ready" ? 0 : 1;
        if (aReady !== bReady) return aReady - bReady; // ready first

        const aMs = getExecMs(a.targetExecutionTime);
        const bMs = getExecMs(b.targetExecutionTime);
        if (aMs !== bMs) return aMs - bMs; // earlier first

        const aConf = typeof a.confidenceScore === "number" ? a.confidenceScore : -1;
        const bConf = typeof b.confidenceScore === "number" ? b.confidenceScore : -1;
        if (aConf !== bConf) return bConf - aConf; // higher first

        const aPri = typeof a.priority === "number" ? a.priority : 999;
        const bPri = typeof b.priority === "number" ? b.priority : 999;
        return aPri - bPri; // lower number first
      },
    );

    return filtered.map(
      (target: {
        vcoinId?: string | number;
        id?: number;
        symbolName?: string;
        symbol?: string;
        projectName?: string;
        targetExecutionTime?: string | number | Date;
        confidenceScore?: number;
        priority?: number;
        status?: string;
        [key: string]: unknown;
      }) => ({
        vcoinId: target.vcoinId || target.id?.toString(),
        symbol: target.symbolName || target.symbol,
        projectName: target.projectName || target.symbolName || "Unknown Project",
        launchTime: (() => {
          const ms = getExecMs(target.targetExecutionTime);
          return Number.isFinite(ms) ? new Date(ms) : new Date();
        })(),
        hoursAdvanceNotice: (() => {
          const ms = getExecMs(target.targetExecutionTime);
          const diffH = Number.isFinite(ms) ? (ms - Date.now()) / (1000 * 60 * 60) : NaN;
          return Number.isFinite(diffH) ? diffH : 1;
        })(),
        priceDecimalPlaces: target.priceDecimalPlaces || 8,
        quantityDecimalPlaces: target.quantityDecimalPlaces || 8,
        confidence: target.confidenceScore ? target.confidenceScore / 100 : 0.5,
        status:
          target.status === "ready"
            ? "ready"
            : target.status === "active"
              ? "active"
              : "monitoring",
        // Include additional fields for execution
        id: target.id,
        positionSizeUsdt: target.positionSizeUsdt,
        entryStrategy: target.entryStrategy,
        stopLossPercent: target.stopLossPercent,
        takeProfitCustom: target.takeProfitCustom,
      }),
    );
  }, [allSnipeTargets, activeSnipeTargets]);

  // Transform calendar data for pending targets
  const transformedCalendarTargets = useMemo(() => {
    if (!Array.isArray(calendarData)) return [];

    return calendarData.map(
      (entry: {
        vcoinId?: string | number;
        symbol?: string;
        projectName?: string;
        firstOpenTime?: string | number | Date;
        [key: string]: unknown;
      }) => ({
        vcoinId: entry.vcoinId,
        symbol: entry.symbol,
        projectName: entry.projectName || "Unknown Project",
        firstOpenTime: entry.firstOpenTime ? new Date(entry.firstOpenTime).getTime() : 0,
      }),
    );
  }, [calendarData]);

  // Calculate metrics
  const totalBalance = accountBalance?.totalUsdtValue || 0;
  const balanceChange = totalBalance - (historicalBalance || totalBalance);
  const newListings = Array.isArray(calendarData) ? calendarData.length : 0;
  // Use active snipe targets from database, fallback to ready targets count
  const activeTargets = Array.isArray(activeSnipeTargets)
    ? activeSnipeTargets.length
    : transformedReadyTargets.length;

  // Calculate new listings change percentage
  const newListingsChange = useMemo(() => {
    if (!historicalCalendarData || historicalCalendarData.length === 0) return 0;

    const currentWeekListings = newListings;
    const lastWeekListings = historicalCalendarData.length;

    if (lastWeekListings === 0) return currentWeekListings > 0 ? 100 : 0;

    return ((currentWeekListings - lastWeekListings) / lastWeekListings) * 100;
  }, [newListings, historicalCalendarData]);

  // Calculate active targets change percentage
  // Compare current active targets to targets created in the last 7 days
  const activeTargetsChange = useMemo(() => {
    if (!historicalActiveTargets || historicalActiveTargets.length === 0) {
      // If no historical data, show neutral (0%) instead of alarming negative
      return 0;
    }

    const currentActiveTargets = activeTargets;
    // Count how many of the historical targets are still active
    const _historicalStillActive = historicalActiveTargets.filter(
      (target: { status?: string; [key: string]: unknown }) =>
        target.status === "active" || target.status === "executing",
    ).length;

    // Use the count of historical targets created as baseline
    const baseline = historicalActiveTargets.length;

    if (baseline === 0) return currentActiveTargets > 0 ? 100 : 0;

    // Calculate change: positive if we have more active targets now than historical baseline
    return ((currentActiveTargets - baseline) / baseline) * 100;
  }, [activeTargets, historicalActiveTargets]);

  // Calculate win rate from execution history
  const winRate = useMemo(() => {
    if (!executionHistoryData?.summary) return 0;

    const { successRate } = executionHistoryData.summary;
    return typeof successRate === "number" ? successRate : 0;
  }, [executionHistoryData]);

  // Debug logging
  logger.debug("Dashboard balance data", {
    accountBalance,
    totalBalance,
    balanceLoading,
    userId,
  });

  logger.debug("Dashboard calculated metrics", {
    newListings,
    newListingsChange,
    historicalCalendarCount: historicalCalendarData?.length || 0,
    activeTargets,
    activeTargetsChange,
    historicalActiveTargetsCount: historicalActiveTargets?.length || 0,
    winRate,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Metrics Section */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Balance"
            value={`$${totalBalance.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
            change={balanceChange}
            changeLabel={balanceChange >= 0 ? "24h increase" : "24h decrease"}
            trend={balanceChange >= 0 ? "up" : "down"}
          />
          <MetricCard
            title="New Listings"
            value={newListings.toLocaleString()}
            change={Math.round(newListingsChange * 10) / 10}
            changeLabel={`${newListingsChange >= 0 ? "Up" : "Down"} ${Math.abs(Math.round(newListingsChange * 10) / 10)}% vs last week`}
            description={
              newListingsChange >= 0
                ? "Strong listing growth"
                : "Listing acquisition needs attention"
            }
            trend={newListingsChange >= 0 ? "up" : "down"}
          />
          <MetricCard
            title="Active Targets"
            value={activeTargets.toLocaleString()}
            change={Math.round(activeTargetsChange * 10) / 10}
            changeLabel={`${activeTargetsChange >= 0 ? "Up" : "Down"} ${Math.abs(Math.round(activeTargetsChange * 10) / 10)}% vs last week`}
            description={
              activeTargetsChange >= 0
                ? "Strong target retention"
                : "Target retention needs attention"
            }
            trend={activeTargetsChange >= 0 ? "up" : "down"}
          />
          <MetricCard
            title="Win Rate"
            value={`${winRate.toFixed(1)}%`}
            change={winRate > 50 ? +(winRate - 50).toFixed(1) : -(50 - winRate).toFixed(1)}
            changeLabel={winRate > 50 ? "Above average performance" : "Below average performance"}
            description={`Based on ${executionHistoryData?.summary?.totalExecutions || 0} trades`}
            trend={winRate > 50 ? "up" : "down"}
          />
        </div>

        {/* Chart Section */}
        <TradingChart />

        {/* Tabbed Content Section - Optimized for Auto-Sniping */}
        <Tabs
          defaultValue="overview"
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="auto-sniping">Auto-Sniping Control</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="async-sniper">Async Sniper</TabsTrigger>
            {/* Removed: Pattern Detection tab - simplified to trading focus */}
            <TabsTrigger value="trades">Trading History</TabsTrigger>
            <TabsTrigger value="listings">
              New Listings
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                {newListings}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auto-sniping" className="space-y-4">
            <AutoSnipingControlPanel />
          </TabsContent>

          <TabsContent value="async-sniper" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <AsyncSniperStatusPanel />
              <BalanceGuardPanel />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TakeProfitMonitorPanel />
              <EventAuditLogPanel />
            </div>
          </TabsContent>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <UpcomingCoinsSection />
                <OptimizedActivityFeed />
              </div>
              <div className="space-y-4">
                <OptimizedAccountBalance userId={userId || "system"} />
                <OptimizedTradingTargets
                  readyTargets={transformedReadyTargets}
                  pendingDetection={transformedReadyTargets
                    .filter((t) => t.status === "monitoring")
                    .map((t) => t.vcoinId)
                    .filter(Boolean)}
                  calendarTargets={transformedCalendarTargets}
                  onExecuteSnipe={handleExecuteSnipe}
                  onRemoveTarget={handleRemoveTarget}
                  isLoading={allSnipeLoading || activeSnipeLoading}
                />
              </div>
            </div>
            <RecentTradesTable userId={userId || undefined} />
          </TabsContent>

          <TabsContent value="listings" className="space-y-4">
            <CoinListingsBoard />
          </TabsContent>

          <TabsContent value="trades" className="space-y-4">
            <RecentTradesTable userId={userId || undefined} />
          </TabsContent>

          {/* Removed: Pattern Detection tab content - simplified to trading focus */}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
