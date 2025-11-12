/**
 * Simple Dynamic Position Sizer
 *
 * Minimal approach to make position size dynamic based on balance
 * using unified MEXC portfolio APIs.
 */

import { getUnifiedMexcService } from "@/src/services/api/unified-mexc-service-factory";

export interface DynamicSizingConfig {
  perTradeFraction: number; // % of total USDT (default 2% = 0.02)
  maxUtilizationFraction: number; // % of free USDT (default 10% = 0.1)
  minPositionSize: number; // Minimum USDT (default 1)
  maxPositionSize: number; // Maximum USDT (default 1000)
}

export interface BalanceInfo {
  totalUsdtValue: number;
  freeUsdt: number;
  allBalances: Array<{
    asset: string;
    free: number;
    locked: number;
    total: number;
  }>;
}

export class DynamicPositionSizer {
  private defaultConfig: DynamicSizingConfig = {
    perTradeFraction: 0.02, // 2% of total USDT
    maxUtilizationFraction: 0.1, // 10% of free USDT
    minPositionSize: 1, // $1 minimum
    maxPositionSize: 1000, // $1000 maximum
  };

  /**
   * Get current balance info from unified MEXC service
   */
  async getBalanceInfo(): Promise<BalanceInfo | null> {
    try {
      const mexcService = await getUnifiedMexcService();
      const portfolio = await mexcService.getAccountBalances();

      if (!portfolio.success || !portfolio.data) {
        console.error("Failed to get portfolio:", portfolio.error);
        return null;
      }

      const totalUsdtValue = portfolio.data.totalUsdtValue || 0;
      const usdtBalance = portfolio.data.balances.find((b) => b.asset === "USDT");
      const freeUsdt = usdtBalance?.total || 0;

      return {
        totalUsdtValue,
        freeUsdt,
        allBalances: portfolio.data.balances.map((b) => ({
          asset: b.asset,
          free: parseFloat(b.free || "0"),
          locked: parseFloat(b.locked || "0"),
          total: parseFloat(b.free || "0") + parseFloat(b.locked || "0"),
        })),
      };
    } catch (error) {
      console.error("Error getting balance info:", error);
      return null;
    }
  }

  /**
   * Calculate dynamic position size based on current balance
   */
  async calculateDynamicPositionSize(
    staticPositionSize?: number,
    customConfig?: Partial<DynamicSizingConfig>,
  ): Promise<{ size: number; source: "dynamic" | "static"; reasoning: string }> {
    const config = { ...this.defaultConfig, ...customConfig };

    // Get current balance
    const balanceInfo = await this.getBalanceInfo();

    if (!balanceInfo) {
      // Fallback to static if balance fetch fails
      return {
        size: staticPositionSize || config.minPositionSize,
        source: "static",
        reasoning: "Balance fetch failed - using static position size",
      };
    }

    // Calculate size based on multiple constraints
    const basedOnTotalValue = balanceInfo.totalUsdtValue * config.perTradeFraction;
    const basedOnFreeUsdt = balanceInfo.freeUsdt * config.maxUtilizationFraction;

    // Apply the most restrictive constraint
    let dynamicSize = Math.min(
      config.maxPositionSize || Infinity,
      basedOnTotalValue,
      basedOnFreeUsdt,
    );

    // Ensure minimum
    dynamicSize = Math.max(dynamicSize, config.minPositionSize);

    // Can't exceed available free USDT
    dynamicSize = Math.min(dynamicSize, balanceInfo.freeUsdt);

    const reasoning = [
      `Total USDT: $${balanceInfo.totalUsdtValue.toFixed(2)}`,
      `Free USDT: $${balanceInfo.freeUsdt.toFixed(2)}`,
      `${config.perTradeFraction * 100}% of total = $${basedOnTotalValue.toFixed(2)}`,
      `${config.maxUtilizationFraction * 100}% of free = $${basedOnFreeUsdt.toFixed(2)}`,
      `Final: $${dynamicSize.toFixed(2)}`,
    ].join(" | ");

    return {
      size: dynamicSize,
      source: "dynamic",
      reasoning,
    };
  }

  /**
   * Get position size for a target (dynamic if possible, fallback to static)
   */
  async getPositionSizeForTarget(
    staticPositionSize?: number,
    customConfig?: Partial<DynamicSizingConfig>,
  ): Promise<number> {
    const result = await this.calculateDynamicPositionSize(staticPositionSize, customConfig);
    return result.size;
  }
}

export const dynamicPositionSizer = new DynamicPositionSizer();
