"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/src/components/auth/supabase-auth-provider";
import { AutoSnipingControlPanel } from "@/src/components/auto-sniping-control-panel";
import { AIEnhancedPatternDisplay } from "@/src/components/dashboard/ai-intelligence/ai-enhanced-pattern-display";
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
import { ManualTradingPanel } from "@/src/components/manual-trading-panel";
import { Button } from "@/src/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { useToast } from "@/src/components/ui/use-toast";
import { useAccountBalance } from "@/src/hooks/use-account-balance";
import { useEnhancedPatterns } from "@/src/hooks/use-enhanced-patterns";
import { useMexcCalendar, useReadyLaunches } from "@/src/hooks/use-mexc-data";
import {
  useDeleteSnipeTarget,
  useSnipeTargets,
} from "@/src/hooks/use-portfolio";
import { queryKeys } from "@/src/lib/query-client";

export default function DashboardPage() {
  const { user, isLoading: userLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use authenticated user ID
  const userId = user?.id;

  // Hooks for trading operations
  const deleteSnipeTarget = useDeleteSnipeTarget();

  const { data: accountBalance, isLoading: balanceLoading } = useAccountBalance(
    {
      userId: userId || "system",
      enabled: activeTab === "overview",
    }
  );
  const { data: calendarData } = useMexcCalendar({ enabled: true });
  const { data: readyLaunches } = useReadyLaunches({ enabled: true });
  // Show both user-owned and system-owned targets (read-only) in overview
  const { data: userSnipeTargets, isLoading: userSnipeLoading } =
    useSnipeTargets(userId || "", undefined, { enabled: activeTab === "overview" });
  // Also fetch all visible targets (user + system) from the unified API semantics
  const {
    data: allSnipeTargets,
    isLoading: allSnipeLoading,
  } = useQuery({
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
    enabled: true,
    staleTime: 10_000,
  });
  const { data: enhancedPatterns, isLoading: patternsLoading } =
    useEnhancedPatterns({
      enableAI: true,
      confidenceThreshold: 70,
      includeAdvanceDetection: true,
      enabled: true,
    });

  // Handler functions for trading targets
  const handleExecuteSnipe = async (target: any) => {
    console.info("Executing snipe for target:", target);

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
      console.error("Failed to execute snipe:", error);
      toast({
        title: "Snipe Execution Failed",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  const handleRemoveTarget = async (targetId: string | number) => {
    console.info("Removing target:", { targetId });

    try {
      await deleteSnipeTarget.mutateAsync(Number(targetId));

      toast({
        title: "Target Removed",
        description: "Snipe target has been successfully removed",
        variant: "default",
      });
    } catch (error) {
      console.error("Failed to remove target:", error);
      toast({
        title: "Removal Failed",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Fetch execution history for calculating metrics
  const { data: executionHistoryData } = useQuery({
    queryKey: ["execution-history", userId],
    queryFn: async () => {
      if (!userId) return null;

      const thirtyDaysAgo = Math.floor(
        (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
      );
      const response = await fetch(
        `/api/execution-history?userId=${encodeURIComponent(userId)}&fromDate=${thirtyDaysAgo}&limit=1000`,
        { credentials: "include" }
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

      const twentyFourHoursAgo = Math.floor(
        (Date.now() - 24 * 60 * 60 * 1000) / 1000
      );
      const response = await fetch(
        `/api/account/balance?userId=${encodeURIComponent(userId)}&timestamp=${twentyFourHoursAgo}`,
        { credentials: "include" }
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

        const response = await fetch(
          `/api/mexc/calendar?fromDate=${sevenDaysAgo.toISOString()}`,
          { credentials: "include" }
        );

        if (!response.ok) return [];
        const data = await response.json();
        return data.success ? data.data || [] : [];
      } catch (error) {
        console.error("Failed to fetch historical calendar data:", error);
        return [];
      }
    },
    enabled: true,
    staleTime: 10 * 60 * 1000, // 10 minute cache
    placeholderData: [],
  });

  // Fetch historical ready launches for active targets change calculation
  const { data: historicalReadyLaunches } = useQuery({
    queryKey: ["historical-ready-launches"],
    queryFn: async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const response = await fetch(
          `/api/ready-launches?fromDate=${sevenDaysAgo.toISOString()}`,
          { credentials: "include" }
        );

        if (!response.ok) return [];
        const data = await response.json();
        return data.success ? data.data || [] : [];
      } catch (error) {
        console.error("Failed to fetch historical ready launches:", error);
        return [];
      }
    },
    enabled: true,
    staleTime: 10 * 60 * 1000, // 10 minute cache
    placeholderData: [],
  });

  // Transform snipe targets for display
  const transformedReadyTargets = useMemo(() => {
    const combined = Array.isArray(allSnipeTargets) && allSnipeTargets.length > 0
      ? allSnipeTargets
      : (Array.isArray(userSnipeTargets) ? userSnipeTargets : []);

    if (combined.length === 0) return [];

    // Filter to pending/ready and sort logically:
    // 1) ready first, 2) earlier execution time first, 3) higher confidence, 4) higher priority (lower number) first
    const filtered = combined.filter(
      (target: any) => target.status === "pending" || target.status === "ready"
    );

    const getExecMs = (te: any): number => {
      if (typeof te === "number") return te < 1e12 ? te * 1000 : te;
      if (typeof te === "string") {
        const parsed = Date.parse(te);
        return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
      }
      return Number.POSITIVE_INFINITY;
    };

    filtered.sort((a: any, b: any) => {
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
    });

    return filtered.map((target: any) => ({
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
      status: target.status === "ready" ? "ready" : "monitoring",
      // Include additional fields for execution
      id: target.id,
      positionSizeUsdt: target.positionSizeUsdt,
      entryStrategy: target.entryStrategy,
      stopLossPercent: target.stopLossPercent,
      takeProfitCustom: target.takeProfitCustom,
    }));
  }, [userSnipeTargets, allSnipeTargets]);

  // Transform calendar data for pending targets
  const transformedCalendarTargets = useMemo(() => {
    if (!Array.isArray(calendarData)) return [];

    return calendarData.map((entry: any) => ({
      vcoinId: entry.vcoinId,
      symbol: entry.symbol,
      projectName: entry.projectName || "Unknown Project",
      firstOpenTime: new Date(entry.firstOpenTime).getTime(),
    }));
  }, [calendarData]);

  // Calculate metrics
  const totalBalance = accountBalance?.totalUsdtValue || 0;
  const balanceChange = totalBalance - (historicalBalance || totalBalance);
  const newListings = Array.isArray(calendarData) ? calendarData.length : 0;
  const activeTargets = transformedReadyTargets.length;

  // Calculate new listings change percentage
  const newListingsChange = useMemo(() => {
    if (!historicalCalendarData || historicalCalendarData.length === 0)
      return 0;

    const currentWeekListings = newListings;
    const lastWeekListings = historicalCalendarData.length;

    if (lastWeekListings === 0) return currentWeekListings > 0 ? 100 : 0;

    return ((currentWeekListings - lastWeekListings) / lastWeekListings) * 100;
  }, [newListings, historicalCalendarData]);

  // Calculate active targets change percentage
  const activeTargetsChange = useMemo(() => {
    if (!historicalReadyLaunches || historicalReadyLaunches.length === 0)
      return 0;

    const currentActiveTargets = activeTargets;
    const lastWeekActiveTargets = historicalReadyLaunches.length;

    if (lastWeekActiveTargets === 0) return currentActiveTargets > 0 ? 100 : 0;

    return (
      ((currentActiveTargets - lastWeekActiveTargets) / lastWeekActiveTargets) *
      100
    );
  }, [activeTargets, historicalReadyLaunches]);

  // Calculate win rate from execution history
  const winRate = useMemo(() => {
    if (!executionHistoryData?.summary) return 0;

    const { successRate } = executionHistoryData.summary;
    return typeof successRate === "number" ? successRate : 0;
  }, [executionHistoryData]);

  // Debug logging
  console.debug("[Dashboard] Balance data:", {
    accountBalance,
    totalBalance,
    balanceLoading,
    userId,
  });

  console.debug("[Dashboard] Calculated metrics:", {
    newListings,
    newListingsChange,
    historicalCalendarCount: historicalCalendarData?.length || 0,
    activeTargets,
    activeTargetsChange,
    historicalReadyLaunchesCount: historicalReadyLaunches?.length || 0,
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
            change={
              winRate > 50
                ? +(winRate - 50).toFixed(1)
                : -(50 - winRate).toFixed(1)
            }
            changeLabel={
              winRate > 50
                ? "Above average performance"
                : "Below average performance"
            }
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
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="auto-sniping">
                Auto-Sniping Control
              </TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger
                value="patterns"
              >
                Pattern Detection
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {readyLaunches ? readyLaunches.length : 0}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="trades"
              >
                Trading History
              </TabsTrigger>
              <TabsTrigger
                value="listings"
              >
                New Listings
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {newListings}
                </span>
              </TabsTrigger>
              <TabsTrigger value="manual-trading">Manual Trading</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Section
              </Button>
            </div>
          </div>

          <TabsContent value="auto-sniping" className="space-y-4">
            <AutoSnipingControlPanel />
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
                  isLoading={userSnipeLoading || allSnipeLoading}
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

          <TabsContent value="manual-trading" className="space-y-4">
            <ManualTradingPanel userId={userId || ""} />
          </TabsContent>

          <TabsContent value="patterns" className="space-y-4">
            <div className="grid gap-4">
              <AIEnhancedPatternDisplay
                patterns={enhancedPatterns?.patterns || []}
                isLoading={patternsLoading}
                showAdvanceDetection={true}
              />
              <CoinListingsBoard />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
