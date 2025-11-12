/**
 * Dynamic Position Sizing Service
 *
 * Calculates position sizes based on user balance and risk management rules.
 * Follows proper risk management principles.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { userPreferences as userPreferencesTable } from "@/src/db/schemas/auth";
import { balanceSnapshots } from "@/src/db/schemas/trading";
import { getLogger } from "@/src/lib/unified-logger";

export interface PositionSizingConfig {
  maxRiskPerTrade: number; // % of total balance (default 2%)
  minPositionSize: number; // Minimum USDT (default 10)
  maxPositionSize: number; // Maximum USDT (default 1000)
  reserveRatio: number; // % of balance to keep as reserve (default 20%)
}

export interface PositionSizingResult {
  recommendedSize: number;
  availableBalance: number;
  riskAmount: number;
  riskPercent: number;
  reasoning: string;
  warnings: string[];
}

export class DynamicPositionSizingService {
  private logger = getLogger("DynamicPositionSizingService");
  private defaultConfig: PositionSizingConfig = {
    maxRiskPerTrade: 2.0, // 2% risk per trade
    minPositionSize: 10, // $10 minimum
    maxPositionSize: 1000, // $1000 maximum
    reserveRatio: 0.2, // Keep 20% as reserve
  };

  /**
   * Calculate dynamic position size based on user balance
   */
  async calculatePositionSize(
    userId: string,
    customConfig?: Partial<PositionSizingConfig>,
  ): Promise<PositionSizingResult> {
    const config = { ...this.defaultConfig, ...customConfig };

    // Get user's latest USDT balance
    const balance = await this.getLatestBalance(userId);
    const availableBalance = balance * (1 - config.reserveRatio); // Subtract reserve

    // Calculate position based on risk
    const riskAmount = availableBalance * (config.maxRiskPerTrade / 100);
    let recommendedSize = Math.min(riskAmount, config.maxPositionSize);

    // Ensure minimum position size
    recommendedSize = Math.max(recommendedSize, config.minPositionSize);

    // Can't exceed available balance
    recommendedSize = Math.min(recommendedSize, availableBalance);

    const riskPercent = (recommendedSize / balance) * 100;

    const warnings: string[] = [];
    const reasoning: string[] = [];

    // Build reasoning
    reasoning.push(`Total USDT balance: $${balance.toFixed(2)}`);
    reasoning.push(
      `Available after ${config.reserveRatio * 100}% reserve: $${availableBalance.toFixed(2)}`,
    );
    reasoning.push(`Risk per trade: ${config.maxRiskPerTrade}% = $${riskAmount.toFixed(2)}`);

    if (recommendedSize >= config.maxPositionSize) {
      reasoning.push(`Capped at maximum: $${config.maxPositionSize.toFixed(2)}`);
      warnings.push(`Position size capped at maximum limit`);
    }

    if (recommendedSize <= config.minPositionSize) {
      reasoning.push(`Using minimum: $${config.minPositionSize.toFixed(2)}`);
      warnings.push(`Using minimum position size - low balance`);
    }

    if (riskPercent > 5) {
      warnings.push(`High risk: ${riskPercent.toFixed(1)}% of total balance`);
    }

    if (balance < 50) {
      warnings.push(`Low balance: Consider adding more funds`);
    }

    return {
      recommendedSize,
      availableBalance,
      riskAmount,
      riskPercent,
      reasoning: reasoning.join(" | "),
      warnings,
    };
  }

  /**
   * Get user's latest USDT balance
   */
  private async getLatestBalance(userId: string): Promise<number> {
    try {
      const balance = await db
        .select({ freeAmount: balanceSnapshots.freeAmount })
        .from(balanceSnapshots)
        .where(and(eq(balanceSnapshots.userId, userId), eq(balanceSnapshots.asset, "USDT")))
        .orderBy(desc(balanceSnapshots.timestamp))
        .limit(1);

      return balance[0]?.freeAmount || 0;
    } catch (error) {
      this.logger.error("Failed to get user balance", { userId }, error as Error);
      return 0;
    }
  }

  /**
   * Get user's position sizing preferences
   */
  async getUserPositionSizingConfig(userId: string): Promise<Partial<PositionSizingConfig>> {
    try {
      const prefs = await db
        .select({
          defaultBuyAmountUsdt: userPreferencesTable.defaultBuyAmountUsdt,
        })
        .from(userPreferencesTable)
        .where(eq(userPreferencesTable.userId, userId))
        .limit(1);

      if (prefs.length > 0) {
        return {
          maxPositionSize: prefs[0].defaultBuyAmountUsdt || undefined,
        };
      }
    } catch (error) {
      this.logger.error("Failed to get user preferences", { userId }, error as Error);
    }

    return {};
  }

  /**
   * Update user's position size preference
   */
  async updateUserPositionSize(userId: string, positionSize: number): Promise<boolean> {
    try {
      await db
        .update(userPreferencesTable)
        .set({ defaultBuyAmountUsdt: positionSize })
        .where(eq(userPreferencesTable.userId, userId));

      return true;
    } catch (error) {
      this.logger.error(
        "Failed to update user position size",
        { userId, positionSize },
        error as Error,
      );
      return false;
    }
  }
}

export const dynamicPositionSizingService = new DynamicPositionSizingService();
