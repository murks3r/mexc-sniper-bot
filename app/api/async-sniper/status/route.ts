/**
 * Async Sniper Status API
 *
 * Provides status information for async sniper components:
 * - AsyncMexcClient status
 * - TakeProfitMonitor status
 * - BalanceGuard status
 * - Event audit log stats
 */

import { NextResponse } from "next/server";
import { loadSniperConfig } from "@/src/config/sniper-config-loader";

export async function GET() {
  try {
    const config = await loadSniperConfig();

    // Get async config status
    const asyncEnabled = config.async?.enabled ?? false;
    const maxConcurrency = config.async?.maxConcurrency ?? 5;
    const requestTimeout = config.async?.requestTimeoutMs ?? 5000;

    // Get take-profit monitor config
    const tpConfig = {
      checkIntervalMs: config.takeProfit?.checkIntervalMs ?? 1000,
      takeProfitPercent: config.takeProfit?.takeProfitPercent ?? 10,
      stopLossPercent: config.takeProfit?.stopLossPercent ?? 5,
    };

    // Get balance guard config
    const balanceGuardConfig = {
      minBalanceBufferPercent: config.balanceGuard?.minBalanceBufferPercent ?? 5,
      checkIntervalMs: config.balanceGuard?.checkIntervalMs ?? 5000,
    };

    return NextResponse.json({
      success: true,
      data: {
        async: {
          enabled: asyncEnabled,
          maxConcurrency,
          requestTimeout,
          status: asyncEnabled ? "active" : "disabled",
        },
        takeProfitMonitor: {
          config: tpConfig,
          status: asyncEnabled ? "ready" : "disabled",
        },
        balanceGuard: {
          config: balanceGuardConfig,
          status: asyncEnabled ? "ready" : "disabled",
        },
        eventAuditLog: {
          status: "active",
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
