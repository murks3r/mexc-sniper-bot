/**
 * Type Safety Tests for UnifiedMexcPortfolioModule
 *
 * Validates that balance API responses include all required fields
 * and match Zod validation schemas in route handlers.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AccountBalanceSchema } from "@/src/schemas/external-api-validation-schemas";
import type { MexcCacheLayer } from "../../data/modules/mexc-cache-layer";
import type { MexcCoreClient } from "../../data/modules/mexc-core-client";
import { UnifiedMexcPortfolioModule } from "../unified-mexc-portfolio";

describe("UnifiedMexcPortfolioModule - Type Safety", () => {
  let portfolioModule: UnifiedMexcPortfolioModule;
  let mockCoreClient: MexcCoreClient;
  let mockCache: MexcCacheLayer;

  beforeEach(() => {
    mockCoreClient = {
      getAccountBalance: vi.fn(),
      getAllTickers: vi.fn(),
      getTicker: vi.fn(),
    } as unknown as MexcCoreClient;

    mockCache = {
      getOrSet: vi.fn(),
    } as unknown as MexcCacheLayer;

    portfolioModule = new UnifiedMexcPortfolioModule(mockCoreClient, mockCache);
  });

  describe("getAccountBalances response structure", () => {
    it("should include lastUpdated field in data object", async () => {
      // Mock balance response
      (mockCoreClient.getAccountBalance as any).mockResolvedValue({
        success: true,
        data: [
          { asset: "USDT", free: "1000.00", locked: "0.00" },
          { asset: "BTC", free: "0.5", locked: "0.0" },
        ],
        timestamp: Date.now(),
      });

      // Mock ticker responses
      (mockCache.getOrSet as any).mockResolvedValue({
        success: true,
        data: [{ symbol: "BTCUSDT", price: "50000.00", lastPrice: "50000.00" }],
        timestamp: Date.now(),
      });

      const response = await portfolioModule.getAccountBalances();

      // Verify response structure
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data?.lastUpdated).toBeDefined();
      expect(typeof response.data?.lastUpdated).toBe("string");

      // Verify ISO 8601 format
      const timestamp = response.data?.lastUpdated;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(() => new Date(timestamp!).toISOString()).not.toThrow();
    });

    it("should match route validation schema structure", async () => {
      // This schema matches app/api/account/balance/route.ts (lines 226-239)
      const RouteResponseSchema = z.object({
        success: z.boolean(),
        data: z
          .object({
            balances: z.array(AccountBalanceSchema),
            totalUsdtValue: z.number().nonnegative(),
            lastUpdated: z.string(), // ← Critical field
          })
          .optional(),
        error: z.string().optional(),
        timestamp: z.union([z.string(), z.number()]),
        executionTimeMs: z.number().optional(),
        source: z.string().optional(),
      });

      // Mock responses
      (mockCoreClient.getAccountBalance as any).mockResolvedValue({
        success: true,
        data: [{ asset: "USDT", free: "100.00", locked: "0.00" }],
        timestamp: Date.now(),
      });

      (mockCache.getOrSet as any).mockResolvedValue({
        success: true,
        data: [],
        timestamp: Date.now(),
      });

      const response = await portfolioModule.getAccountBalances();

      // Validate against route schema
      const validationResult = RouteResponseSchema.safeParse(response);

      if (!validationResult.success) {
        console.error("Validation errors:", validationResult.error.errors);
      }

      expect(validationResult.success).toBe(true);
    });

    it("should have lastUpdated as ISO 8601 datetime string", async () => {
      (mockCoreClient.getAccountBalance as any).mockResolvedValue({
        success: true,
        data: [{ asset: "USDT", free: "1000.00", locked: "0.00" }],
        timestamp: Date.now(),
      });

      (mockCache.getOrSet as any).mockResolvedValue({
        success: true,
        data: [],
        timestamp: Date.now(),
      });

      const response = await portfolioModule.getAccountBalances();

      expect(response.data?.lastUpdated).toBeDefined();

      // Validate ISO 8601 format using Zod
      const IsoDateSchema = z.string().datetime();
      const validation = IsoDateSchema.safeParse(response.data?.lastUpdated);

      expect(validation.success).toBe(true);
    });

    it("should include all required PortfolioSummary fields", async () => {
      (mockCoreClient.getAccountBalance as any).mockResolvedValue({
        success: true,
        data: [
          { asset: "BTC", free: "1.0", locked: "0.0" },
          { asset: "USDT", free: "50000.00", locked: "0.00" },
        ],
        timestamp: Date.now(),
      });

      (mockCache.getOrSet as any).mockResolvedValue({
        success: true,
        data: [{ symbol: "BTCUSDT", price: "50000.00" }],
        timestamp: Date.now(),
      });

      const response = await portfolioModule.getAccountBalances();

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        balances: expect.any(Array),
        totalUsdtValue: expect.any(Number),
        totalValue: expect.any(Number),
        totalValueBTC: expect.any(Number),
        allocation: expect.any(Object),
        performance24h: expect.objectContaining({
          change: expect.any(Number),
          changePercent: expect.any(Number),
        }),
        lastUpdated: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // ISO 8601
      });
    });
  });

  describe("Type safety with AccountBalanceSchema", () => {
    it("should validate balance entries with AccountBalanceSchema", async () => {
      (mockCoreClient.getAccountBalance as any).mockResolvedValue({
        success: true,
        data: [{ asset: "USDT", free: "1000.00", locked: "50.00" }],
        timestamp: Date.now(),
      });

      (mockCache.getOrSet as any).mockResolvedValue({
        success: true,
        data: [],
        timestamp: Date.now(),
      });

      const response = await portfolioModule.getAccountBalances();

      expect(response.data?.balances).toBeDefined();

      // Validate each balance against AccountBalanceSchema
      for (const balance of response.data?.balances) {
        const validation = AccountBalanceSchema.safeParse(balance);

        if (!validation.success) {
          console.error("Balance validation error:", validation.error.errors);
          console.error("Balance data:", balance);
        }

        expect(validation.success).toBe(true);
      }
    });
  });

  describe("Error handling maintains type safety", () => {
    it("should not include lastUpdated in error responses", async () => {
      (mockCoreClient.getAccountBalance as any).mockResolvedValue({
        success: false,
        error: "API Error",
        timestamp: Date.now(),
      });

      const response = await portfolioModule.getAccountBalances();

      expect(response.success).toBe(false);
      expect(response.data).toBeUndefined();
      expect(response.error).toBe("API Error");
    });
  });
});
