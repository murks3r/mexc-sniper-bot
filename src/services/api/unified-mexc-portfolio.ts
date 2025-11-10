import type { BalanceEntry, MexcServiceResponse } from "../data/modules/mexc-api-types";
import type { MexcCacheLayer } from "../data/modules/mexc-cache-layer";
import type { MexcCoreClient } from "../data/modules/mexc-core-client";

interface PortfolioBalanceEntry extends BalanceEntry {
  usdtValue: number;
  total: number;
}

interface PortfolioSummary {
  balances: PortfolioBalanceEntry[];
  totalUsdtValue: number;
  totalValue: number;
  totalValueBTC: number;
  allocation: Record<string, number>;
  performance24h: { change: number; changePercent: number };
}

export class UnifiedMexcPortfolioModule {
  constructor(
    private coreClient: MexcCoreClient,
    private cache: MexcCacheLayer,
  ) {}

  async getAccountBalance(): Promise<MexcServiceResponse<BalanceEntry[]>> {
    return this.coreClient.getAccountBalance();
  }

  async getAccountBalances(): Promise<MexcServiceResponse<PortfolioSummary>> {
    const balanceResponse = await this.getAccountBalance();
    if (!balanceResponse.success || !balanceResponse.data) {
      return {
        success: false,
        error: balanceResponse.error || "Failed to fetch balances",
        timestamp: Date.now(),
        source: "unified-mexc-portfolio",
      };
    }

    const balances = balanceResponse.data;

    // Try to fetch all tickers at once for efficiency
    const tickersResponse = await this.cache.getOrSet(
      "mexc:tickers:all",
      () => this.coreClient.getAllTickers(),
      "realTime",
    );

    // Build price lookup map from batch ticker data
    const priceMap = new Map<string, number>();
    if (tickersResponse.success && Array.isArray(tickersResponse.data)) {
      type TickerRecord = { symbol: string; price?: string | number; lastPrice?: string | number };
      (tickersResponse.data as TickerRecord[]).forEach((ticker) => {
        if (ticker.symbol && (ticker.price || ticker.lastPrice)) {
          const price = parseFloat(String(ticker.price ?? ticker.lastPrice ?? "0"));
          if (price > 0) {
            priceMap.set(ticker.symbol.toUpperCase(), price);
          }
        }
      });
    }

    // Enrich balances with prices - include ALL assets, even with zero balances
    const enrichedBalances = await Promise.all(
      balances.map(async (balance) => {
        const free = parseFloat(balance.free || "0");
        const locked = parseFloat(balance.locked || "0");
        const totalAmount = free + locked;

        // Always calculate USDT value, even for zero balances
        // This ensures all assets are shown in the UI with their values
        if (balance.asset.toUpperCase() === "USDT") {
          return { balance, usdtValue: totalAmount };
        }

        const symbol = `${balance.asset.toUpperCase()}USDT`;
        let price = priceMap.get(symbol) || 0;

        // Fallback to individual ticker request if not found in batch
        if (price === 0) {
          const ticker = await this.cache.getOrSet(
            `mexc:ticker:${symbol}`,
            () => this.coreClient.getTicker(symbol),
            "realTime",
          );
          if (ticker?.success && ticker.data) {
            const fallbackPrice = parseFloat(
              String(
                (ticker.data as { price?: string | number; lastPrice?: string | number }).price ??
                  (ticker.data as { price?: string | number; lastPrice?: string | number })
                    .lastPrice ??
                  "0",
              ),
            );
            price = Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : 0;
          }
        }

        const usdtValue = totalAmount * price;
        return { balance, usdtValue };
      }),
    );

    // Calculate total after all balances are enriched
    const totalUsdtValue = enrichedBalances.reduce((sum, { usdtValue }) => sum + usdtValue, 0);

    const allocation: Record<string, number> = {};
    if (totalUsdtValue > 0) {
      enrichedBalances.forEach(({ balance, usdtValue }) => {
        const percent = (usdtValue / totalUsdtValue) * 100;
        allocation[balance.asset] = Number(percent.toFixed(2));
      });
    }

    // Add USDT value to each balance for frontend display
    // Include ALL balances, sorted by USDT value (descending), then by asset name
    const balancesWithValues = enrichedBalances
      .map(({ balance, usdtValue }) => ({
        ...balance,
        usdtValue: Number(usdtValue.toFixed(2)),
        total: parseFloat(balance.free || "0") + parseFloat(balance.locked || "0"),
      }))
      .sort((a, b) => {
        // Sort by USDT value descending, then by asset name ascending
        if (b.usdtValue !== a.usdtValue) {
          return b.usdtValue - a.usdtValue;
        }
        return a.asset.localeCompare(b.asset);
      });

    return {
      success: true,
      data: {
        balances: balancesWithValues, // Include usdtValue per asset
        totalUsdtValue: Number(totalUsdtValue.toFixed(2)),
        totalValue: Number(totalUsdtValue.toFixed(2)),
        totalValueBTC: 0,
        allocation,
        performance24h: { change: 0, changePercent: 0 },
      },
      timestamp: Date.now(),
      source: "unified-mexc-portfolio",
    };
  }

  async getAccountInfo(): Promise<MexcServiceResponse<any>> {
    return this.cache.getOrSet("mexc:account:info", () => this.coreClient.getAccountInfo(), "user");
  }

  async getTotalPortfolioValue(): Promise<number> {
    const response = await this.getAccountBalances();
    return response.success && response.data ? response.data.totalUsdtValue : 0;
  }

  async getTopAssets(limit = 10): Promise<BalanceEntry[]> {
    const response = await this.getAccountBalance();
    if (!response.success || !response.data) {
      return [];
    }

    return response.data
      .filter((balance) => parseFloat(balance.free || "0") + parseFloat(balance.locked || "0") > 0)
      .slice(0, limit);
  }

  async hasSufficientBalance(asset: string, requiredAmount: number): Promise<boolean> {
    const response = await this.coreClient.getAssetBalance(asset);
    if (!response.success || !response.data) {
      return false;
    }

    const balance = response.data;
    const free = parseFloat(balance.free || "0");
    const locked = parseFloat(balance.locked || "0");
    return free + locked >= requiredAmount;
  }

  async getAssetBalance(asset: string): Promise<{ free: string; locked: string } | null> {
    const response = await this.coreClient.getAssetBalance(asset);
    if (!response.success) {
      return null;
    }
    return response.data;
  }
}
