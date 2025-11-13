/**
 * AsyncMexcClient Tests
 *
 * Verifies parallel Promise.allSettled dispatch for ticker/order endpoints.
 * Mocks UnifiedMexcServiceV2 to ensure concurrency limit enforcement.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedMexcServiceV2 } from "@/src/services/api/unified-mexc-service-v2";
import { AsyncMexcClient } from "../async-mexc-client";

describe("AsyncMexcClient", () => {
  let mockService: {
    getTicker: ReturnType<typeof vi.fn>;
    placeOrder: ReturnType<typeof vi.fn>;
    getAccountInfo: ReturnType<typeof vi.fn>;
  };
  let client: AsyncMexcClient;

  beforeEach(() => {
    mockService = {
      getTicker: vi.fn(),
      placeOrder: vi.fn(),
      getAccountInfo: vi.fn(),
    };

    client = new AsyncMexcClient(mockService as unknown as UnifiedMexcServiceV2, {
      maxConcurrentRequests: 5,
      requestTimeout: 5000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("parallel request dispatch", () => {
    it("should execute multiple ticker requests in parallel", async () => {
      const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
      const mockTickerData = { price: "50000", symbol: "BTCUSDT" };

      mockService.getTicker.mockResolvedValue(mockTickerData);

      const promises = symbols.map((symbol) => client.getTicker(symbol));
      const results = await Promise.allSettled(promises);

      expect(mockService.getTicker).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.status).toBe("fulfilled");
        if (result.status === "fulfilled") {
          expect(result.value).toEqual(mockTickerData);
        }
      });
    });

    it("should enforce concurrency limit", async () => {
      const maxConcurrent = 2;
      client = new AsyncMexcClient(mockService as unknown as UnifiedMexcServiceV2, {
        maxConcurrentRequests: maxConcurrent,
        requestTimeout: 5000,
      });

      let resolveCount = 0;
      const resolveOrder: number[] = [];

      mockService.getTicker.mockImplementation(async () => {
        resolveCount++;
        resolveOrder.push(resolveCount);
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { price: "50000", symbol: "BTCUSDT" };
      });

      // Create 5 requests but only 2 should run concurrently
      const promises = Array.from({ length: 5 }, (_, i) => client.getTicker(`SYMBOL${i}`));

      await Promise.allSettled(promises);

      // Verify concurrency was limited
      expect(mockService.getTicker).toHaveBeenCalledTimes(5);
      // First two should start immediately
      expect(resolveOrder.slice(0, 2)).toEqual([1, 2]);
    });

    it("should handle mixed ticker and order requests in parallel", async () => {
      mockService.getTicker.mockResolvedValue({ price: "50000", symbol: "BTCUSDT" });
      mockService.placeOrder.mockResolvedValue({ orderId: "12345", status: "NEW" });

      const tickerPromise = client.getTicker("BTCUSDT");
      const orderPromise = client.placeOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      });

      const [tickerResult, orderResult] = await Promise.allSettled([tickerPromise, orderPromise]);

      expect(tickerResult.status).toBe("fulfilled");
      expect(orderResult.status).toBe("fulfilled");
      expect(mockService.getTicker).toHaveBeenCalledTimes(1);
      expect(mockService.placeOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should handle individual request failures without blocking others", async () => {
      mockService.getTicker
        .mockResolvedValueOnce({ price: "50000", symbol: "BTCUSDT" })
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ price: "3000", symbol: "ETHUSDT" });

      const promises = [
        client.getTicker("BTCUSDT"),
        client.getTicker("INVALID"),
        client.getTicker("ETHUSDT"),
      ];

      const results = await Promise.allSettled(promises);

      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect(results[2].status).toBe("fulfilled");

      if (results[1].status === "rejected") {
        expect(results[1].reason).toBeInstanceOf(Error);
        expect(results[1].reason.message).toBe("Network error");
      }
    });

    it("should respect request timeout", async () => {
      client = new AsyncMexcClient(mockService as unknown as UnifiedMexcServiceV2, {
        maxConcurrentRequests: 5,
        requestTimeout: 100, // 100ms timeout
      });

      mockService.getTicker.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ price: "50000" }), 200)),
      );

      await expect(client.getTicker("BTCUSDT")).rejects.toThrow(/timeout/i);
    });
  });

  describe("account info requests", () => {
    it("should fetch account info in parallel with other requests", async () => {
      mockService.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "1000", locked: "0" }],
      });
      mockService.getTicker.mockResolvedValue({ price: "50000", symbol: "BTCUSDT" });

      const [accountResult, tickerResult] = await Promise.allSettled([
        client.getAccountInfo(),
        client.getTicker("BTCUSDT"),
      ]);

      expect(accountResult.status).toBe("fulfilled");
      expect(tickerResult.status).toBe("fulfilled");
      expect(mockService.getAccountInfo).toHaveBeenCalledTimes(1);
      expect(mockService.getTicker).toHaveBeenCalledTimes(1);
    });
  });
});
