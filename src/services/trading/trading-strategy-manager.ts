/**
 * Trading Strategy Manager
 *
 * Provides default trading strategy for sniping operations.
 */

export interface TakeProfitLevel {
  percentage: number;
  quantityPercent: number;
}

export interface TradingStrategy {
  name: string;
  levels: TakeProfitLevel[];
}

export class TradingStrategyManager {
  private defaultStrategy: TradingStrategy = {
    name: "default-sniper",
    levels: [
      { percentage: 2, quantityPercent: 50 },
      { percentage: 5, quantityPercent: 30 },
      { percentage: 10, quantityPercent: 20 },
    ],
  };

  getStrategy(): TradingStrategy {
    return this.defaultStrategy;
  }

  setStrategy(strategy: TradingStrategy) {
    this.defaultStrategy = strategy;
  }
}

export const tradingStrategyManager = new TradingStrategyManager();
