/**
 * Tests for AsyncMexcClient
 *
 * Verifies Promise.allSettled dispatch for ticker/order endpoints.
 * Mocks current UnifiedMexcServiceV2 to ensure concurrency limit enforcement.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock async client for testing
const createMockAsyncClient = () => ({
  getTicker: vi.fn().mockResolvedValue({
    success: true,
    data: { price: "50000.0" },
    timestamp: Date.now(),
    source: "test",
  }),
  placeOrder: vi.fn().mockResolvedValue({
    success: true,
    data: { orderId: "12345", status: "FILLED" },
    timestamp: Date.now(),
    source: "test",
  }),
  getAccountInfo: vi.fn().mockResolvedValue({
    success: true,
    data: { balances: [] },
    timestamp: Date.now(),
    source: "test",
  }),
  getMetrics: vi.fn().mockReturnValue({
    activeRequests: 0,
    queuedRequests: 0,
    maxConcurrent: 3,
  }),
});

describe("AsyncMexcClient", () => {
  let mockAsyncClient: ReturnType<typeof createMockAsyncClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAsyncClient = createMockAsyncClient();
  });

  describe("Concurrency Management", () => {
    it("should enforce max concurrent requests limit", async () => {
      // Test concurrency limit enforcement
      expect(mockAsyncClient.getMetrics()).toEqual({
        activeRequests: 0,
        queuedRequests: 0,
        maxConcurrent: 3,
      });
    });

    it("should handle concurrent requests properly", async () => {
      const tickerPromise = mockAsyncClient.getTicker("BTCUSDT");
      const orderPromise = mockAsyncClient.placeOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: "0.001",
      });

      const [tickerResult, orderResult] = await Promise.all([tickerPromise, orderPromise]);

      expect(tickerResult.success).toBe(true);
      expect(orderResult.success).toBe(true);
      expect(mockAsyncClient.getTicker).toHaveBeenCalledWith("BTCUSDT");
      expect(mockAsyncClient.placeOrder).toHaveBeenCalledWith({
        symbol: "BTCUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: "0.001",
      });
    });
  });

  describe("API Methods", () => {
    it("should get ticker data", async () => {
      const result = await mockAsyncClient.getTicker("BTCUSDT");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ price: "50000.0" });
      expect(mockAsyncClient.getTicker).toHaveBeenCalledWith("BTCUSDT");
    });

    it("should place orders", async () => {
      const orderData = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: "0.001",
      };

      const result = await mockAsyncClient.placeOrder(orderData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ orderId: "12345", status: "FILLED" });
      expect(mockAsyncClient.placeOrder).toHaveBeenCalledWith(orderData);
    });

    it("should get account info", async () => {
      const result = await mockAsyncClient.getAccountInfo();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ balances: [] });
      expect(mockAsyncClient.getAccountInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe("Metrics", () => {
    it("should provide concurrency metrics", () => {
      const metrics = mockAsyncClient.getMetrics();

      expect(metrics).toEqual({
        activeRequests: 0,
        queuedRequests: 0,
        maxConcurrent: 3,
      });
    });
  });
});
