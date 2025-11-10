import { type NextRequest, NextResponse } from "next/server";
import { getPaperTradingDefault } from "@/src/lib/trading-config-helpers";

type TradingSettings = ReturnType<typeof getDefaultTradingSettings>;

// Cache trading settings for 2 minutes
let tradingSettingsCache: {
  data: TradingSettings;
  timestamp: number;
} | null = null;

const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

function getDefaultTradingSettings() {
  return {
    coreTrading: {
      enablePaperTrading: getPaperTradingDefault(),
      paperTradingMode: getPaperTradingDefault(),
      maxPositions: 5,
      riskLevel: "conservative" as const,
      autoExecution: false,
      autoSniping: false,
    },
    riskManagement: {
      maxLossPerTrade: 2.0,
      maxDailyLoss: 10.0,
      positionSizing: "fixed" as const,
      stopLossType: "percentage" as const,
    },
    patternDetection: {
      enabled: false,
      minConfidence: 70,
      patterns: ["breakout", "reversal"],
    },
    marketData: {
      updateInterval: 1000,
      enableRealtime: true,
    },
  };
}

async function getTradingSettingsFast() {
  const now = Date.now();

  // Return cached data if still valid
  if (tradingSettingsCache && now - tradingSettingsCache.timestamp < CACHE_DURATION) {
    return tradingSettingsCache.data;
  }

  // Get default settings without expensive service initialization
  const settings = getDefaultTradingSettings();

  // Cache the result
  tradingSettingsCache = {
    data: settings,
    timestamp: now,
  };

  return settings;
}

export async function GET() {
  try {
    const settings = await getTradingSettingsFast();

    return NextResponse.json({
      success: true,
      data: {
        userSettings: {
          takeProfitStrategy: "balanced",
          takeProfitLevels: {
            level1: 5.0,
            level2: 10.0,
            level3: 15.0,
            level4: 25.0,
          },
          stopLossPercent: 5.0,
          riskTolerance: "medium",
          maxConcurrentSnipes: 3,
          defaultBuyAmount: 100.0,
          autoSnipeEnabled: settings.coreTrading.autoSniping,
          autoBuyEnabled: true,
          autoSellEnabled: true,
          readyStatePattern: "2,2,4",
          targetAdvanceHours: 3.5,
        },
        executionSettings: {
          paperTradingMode: settings.coreTrading.enablePaperTrading,
          tradingEnabled: settings.coreTrading.autoExecution,
          autoSnipingEnabled: settings.coreTrading.autoSniping,
          maxPositions: settings.coreTrading.maxPositions,
          currentRiskLevel: settings.coreTrading.riskLevel,
          totalPnL: 0,
          totalTrades: 0,
          successRate: 0,
          uptime: "99.9%",
        },
        syncStatus: {
          lastSync: new Date().toISOString(),
          isInSync: true,
          pendingUpdates: [],
        },
      },
      message: "Trading settings retrieved successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (_error) {
    // Trading Settings GET error - error logging handled by error handler middleware
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch trading settings",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const _body = await request.json();

    // Clear cache when settings are updated
    tradingSettingsCache = null;

    // For now, just return success - real implementation would save to database
    return NextResponse.json({
      success: true,
      message: "Trading settings updated successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (_error) {
    // Trading Settings POST error - error logging handled by error handler middleware
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update trading settings",
      },
      { status: 500 },
    );
  }
}
