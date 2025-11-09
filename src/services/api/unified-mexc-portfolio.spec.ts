import { beforeEach, describe, expect, it, type MockedFunction, vi } from "vitest";
import type { BalanceEntry, MexcServiceResponse } from "../data/modules/mexc-api-types";
import type { MexcCacheLayer } from "../data/modules/mexc-cache-layer";
import type { MexcCoreClient } from "../data/modules/mexc-core-client";
import { UnifiedMexcPortfolioModule } from "./unified-mexc-portfolio";

describe("UnifiedMexcPortfolioModule", () => {
  let portfolioModule: UnifiedMexcPortfolioModule;
  let mockCoreClient: {
    getAccountBalance: MockedFunction<() => Promise<MexcServiceResponse<BalanceEntry[]>>>;
    getTicker: MockedFunction<(symbol: string) => Promise<MexcServiceResponse<any>>>;
    getAllTickers: MockedFunction<() => Promise<MexcServiceResponse<any[]>>>;
  };
  let mockCache: {
    getOrSet: MockedFunction<
      (
        key: string,
        fn: () => Promise<MexcServiceResponse<any>>,
        ttlType?: string,
      ) => Promise<MexcServiceResponse<any>>
    >;
  };

  beforeEach(() => {
    // Create mock core client
    mockCoreClient = {
      getAccountBalance: vi.fn(),
      getTicker: vi.fn(),
      getAllTickers: vi.fn(),
    } as any;

    // Create mock cache layer
    mockCache = {
      getOrSet: vi.fn(),
    } as any;

    portfolioModule = new UnifiedMexcPortfolioModule(
      mockCoreClient as unknown as MexcCoreClient,
      mockCache as unknown as MexcCacheLayer,
    );
  });

  describe("getAccountBalances", () => {
    it("should aggregate portfolio values correctly with batch ticker retrieval", async () => {
      const balances: BalanceEntry[] = [
        { asset: "USDT", free: "1000", locked: "0" },
        { asset: "BTC", free: "0.5", locked: "0" },
        { asset: "ETH", free: "2", locked: "0" },
      ];

      const allTickers = [
        { symbol: "BTCUSDT", price: "50000", lastPrice: "50000" },
        { symbol: "ETHUSDT", price: "3000", lastPrice: "3000" },
      ];

      mockCoreClient.getAccountBalance.mockResolvedValue({
        success: true,
        data: balances,
        timestamp: Date.now(),
        source: "test",
      });

      mockCache.getOrSet.mockImplementation(async (key, fn) => {
        if (key === "mexc:tickers:all") {
          return {
            success: true,
            data: allTickers,
            timestamp: Date.now(),
            source: "test",
          };
        }
        return fn();
      });

      const result = await portfolioModule.getAccountBalances();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.totalUsdtValue).toBe(1000 + 0.5 * 50000 + 2 * 3000); // 1000 + 25000 + 6000 = 32000
      expect(result.data?.balances).toEqual(balances);
      expect(result.data?.allocation).toBeDefined();
      expect(mockCache.getOrSet).toHaveBeenCalledWith(
        "mexc:tickers:all",
        expect.any(Function),
        "realTime",
      );
    });

    it("should handle missing price data gracefully", async () => {
      const balances: BalanceEntry[] = [
        { asset: "USDT", free: "1000", locked: "0" },
        { asset: "UNKNOWN", free: "100", locked: "0" }, // No ticker available
      ];

      const allTickers: any[] = []; // Empty tickers

      mockCoreClient.getAccountBalance.mockResolvedValue({
        success: true,
        data: balances,
        timestamp: Date.now(),
        source: "test",
      });

      mockCoreClient.getTicker.mockResolvedValue({
        success: false,
        error: "Ticker not found",
        timestamp: Date.now(),
        source: "test",
      });

      mockCache.getOrSet.mockImplementation(async (key, fn) => {
        if (key === "mexc:tickers:all") {
          return {
            success: true,
            data: allTickers,
            timestamp: Date.now(),
            source: "test",
          };
        }
        // Fallback to individual ticker request
        if (key.startsWith("mexc:ticker:")) {
          return fn(); // This will call getTicker
        }
        return fn();
      });

      const result = await portfolioModule.getAccountBalances();

      expect(result.success).toBe(true);
      expect(result.data?.totalUsdtValue).toBe(1000); // Only USDT counted
      expect(result.data?.allocation.USDT).toBe(100);
      expect(result.data?.allocation.UNKNOWN).toBe(0);
      // Verify fallback ticker request was attempted
      expect(mockCache.getOrSet).toHaveBeenCalledWith(
        "mexc:ticker:UNKNOWNUSDT",
        expect.any(Function),
        "realTime",
      );
    });

    it("should use cached tickers when available", async () => {
      const balances: BalanceEntry[] = [{ asset: "BTC", free: "1", locked: "0" }];

      const cachedTickers = [{ symbol: "BTCUSDT", price: "50000", lastPrice: "50000" }];

      mockCoreClient.getAccountBalance.mockResolvedValue({
        success: true,
        data: balances,
        timestamp: Date.now(),
        source: "test",
      });

      // Cache returns cached data immediately
      mockCache.getOrSet.mockResolvedValue({
        success: true,
        data: cachedTickers,
        timestamp: Date.now(),
        source: "test-cached",
      });

      const result = await portfolioModule.getAccountBalances();

      expect(result.success).toBe(true);
      expect(result.data?.totalUsdtValue).toBe(50000);
      // Verify cache was checked
      expect(mockCache.getOrSet).toHaveBeenCalled();
      // Verify getAllTickers was not called directly (cache handled it)
      expect(mockCoreClient.getAllTickers).not.toHaveBeenCalled();
    });

    it("should fallback to individual ticker requests if batch fails", async () => {
      const balances: BalanceEntry[] = [{ asset: "BTC", free: "1", locked: "0" }];

      mockCoreClient.getAccountBalance.mockResolvedValue({
        success: true,
        data: balances,
        timestamp: Date.now(),
        source: "test",
      });

      // Batch ticker fetch fails
      mockCache.getOrSet.mockImplementation(async (key, fn) => {
        if (key === "mexc:tickers:all") {
          return {
            success: false,
            error: "Batch fetch failed",
            timestamp: Date.now(),
            source: "test",
          };
        }
        // Fallback to individual ticker
        if (key.startsWith("mexc:ticker:")) {
          return {
            success: true,
            data: { price: "50000", lastPrice: "50000" },
            timestamp: Date.now(),
            source: "test",
          };
        }
        return fn();
      });

      const result = await portfolioModule.getAccountBalances();

      expect(result.success).toBe(true);
      expect(result.data?.totalUsdtValue).toBe(50000);
    });

    it("should handle zero balances correctly", async () => {
      const balances: BalanceEntry[] = [
        { asset: "USDT", free: "0", locked: "0" },
        { asset: "BTC", free: "0", locked: "0" },
      ];

      mockCoreClient.getAccountBalance.mockResolvedValue({
        success: true,
        data: balances,
        timestamp: Date.now(),
        source: "test",
      });

      mockCache.getOrSet.mockResolvedValue({
        success: true,
        data: [],
        timestamp: Date.now(),
        source: "test",
      });

      const result = await portfolioModule.getAccountBalances();

      expect(result.success).toBe(true);
      expect(result.data?.totalUsdtValue).toBe(0);
      expect(result.data?.allocation).toEqual({});
    });

    it("should calculate allocation percentages correctly", async () => {
      const balances: BalanceEntry[] = [
        { asset: "USDT", free: "1000", locked: "0" },
        { asset: "BTC", free: "0.5", locked: "0" },
      ];

      const allTickers = [{ symbol: "BTCUSDT", price: "50000", lastPrice: "50000" }];

      mockCoreClient.getAccountBalance.mockResolvedValue({
        success: true,
        data: balances,
        timestamp: Date.now(),
        source: "test",
      });

      mockCache.getOrSet.mockResolvedValue({
        success: true,
        data: allTickers,
        timestamp: Date.now(),
        source: "test",
      });

      const result = await portfolioModule.getAccountBalances();

      expect(result.success).toBe(true);
      const totalValue = 1000 + 0.5 * 50000; // 26000
      expect(result.data?.allocation.USDT).toBeCloseTo((1000 / totalValue) * 100, 2);
      expect(result.data?.allocation.BTC).toBeCloseTo((25000 / totalValue) * 100, 2);
    });

    it("should return error when balance fetch fails", async () => {
      mockCoreClient.getAccountBalance.mockResolvedValue({
        success: false,
        error: "Failed to fetch balances",
        timestamp: Date.now(),
        source: "test",
      });

      const result = await portfolioModule.getAccountBalances();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to fetch balances");
    });

    it("should handle locked balances correctly", async () => {
      const balances: BalanceEntry[] = [
        { asset: "USDT", free: "500", locked: "500" },
        { asset: "BTC", free: "0.25", locked: "0.25" },
      ];

      const allTickers = [{ symbol: "BTCUSDT", price: "50000", lastPrice: "50000" }];

      mockCoreClient.getAccountBalance.mockResolvedValue({
        success: true,
        data: balances,
        timestamp: Date.now(),
        source: "test",
      });

      mockCache.getOrSet.mockResolvedValue({
        success: true,
        data: allTickers,
        timestamp: Date.now(),
        source: "test",
      });

      const result = await portfolioModule.getAccountBalances();

      expect(result.success).toBe(true);
      // Total: 1000 USDT + 0.5 BTC * 50000 = 1000 + 25000 = 26000
      expect(result.data?.totalUsdtValue).toBe(1000 + 0.5 * 50000);
    });
  });

  describe("getTotalPortfolioValue", () => {
    it("should return total portfolio value", async () => {
      const balances: BalanceEntry[] = [
        { asset: "USDT", free: "1000", locked: "0" },
        { asset: "BTC", free: "0.5", locked: "0" },
      ];

      const allTickers = [{ symbol: "BTCUSDT", price: "50000", lastPrice: "50000" }];

      mockCoreClient.getAccountBalance.mockResolvedValue({
        success: true,
        data: balances,
        timestamp: Date.now(),
        source: "test",
      });

      mockCache.getOrSet.mockResolvedValue({
        success: true,
        data: allTickers,
        timestamp: Date.now(),
        source: "test",
      });

      const result = await portfolioModule.getTotalPortfolioValue();

      expect(result).toBe(1000 + 0.5 * 50000);
    });

    it("should return 0 when balance fetch fails", async () => {
      mockCoreClient.getAccountBalance.mockResolvedValue({
        success: false,
        error: "Failed",
        timestamp: Date.now(),
        source: "test",
      });

      const result = await portfolioModule.getTotalPortfolioValue();

      expect(result).toBe(0);
    });
  });
});
