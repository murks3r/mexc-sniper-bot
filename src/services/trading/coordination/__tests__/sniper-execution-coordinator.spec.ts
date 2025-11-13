/**
 * SniperExecutionCoordinator Tests
 *
 * Uses fake timers to confirm pre/post window handling, cancellation triggers,
 * and retry fallback reuse.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncMexcClient } from "@/src/services/trading/clients/async-mexc-client";
import { SniperExecutionCoordinator } from "../sniper-execution-coordinator";

// Helper to wait for time to pass
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("SniperExecutionCoordinator", () => {
  let coordinator: SniperExecutionCoordinator;
  let mockAsyncClient: {
    placeOrder: ReturnType<typeof vi.fn>;
    getTicker: ReturnType<typeof vi.fn>;
  };
  let mockCancelToken: AbortController;

  beforeEach(() => {
    mockAsyncClient = {
      placeOrder: vi.fn(),
      getTicker: vi.fn(),
    };

    mockCancelToken = new AbortController();

    coordinator = new SniperExecutionCoordinator(mockAsyncClient as unknown as AsyncMexcClient, {
      preWindowBufferMs: 1000,
      postWindowBufferMs: 2000,
    });
  });

  afterEach(() => {
    mockCancelToken.abort();
  });

  describe("execution window timing", () => {
    it("should wait until pre-window buffer before execution", async () => {
      const executionTime = new Date(Date.now() + 5000); // 5 seconds from now
      const orderData = {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      };

      mockAsyncClient.placeOrder.mockResolvedValue({
        orderId: "12345",
        status: "NEW",
      });

      const executePromise = coordinator.executeInWindow(
        executionTime,
        orderData,
        mockCancelToken.signal,
      );

      // Should not execute immediately
      expect(mockAsyncClient.placeOrder).not.toHaveBeenCalled();

      // Wait a bit - should not execute yet
      await wait(100);
      expect(mockAsyncClient.placeOrder).not.toHaveBeenCalled();

      // Wait until execution window
      await wait(4100);

      const result = await executePromise;
      expect(mockAsyncClient.placeOrder).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    it("should execute immediately if execution time is in the past", async () => {
      const executionTime = new Date(Date.now() - 1000); // 1 second ago
      const orderData = {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      };

      mockAsyncClient.placeOrder.mockResolvedValue({
        orderId: "12345",
        status: "NEW",
      });

      const executePromise = coordinator.executeInWindow(
        executionTime,
        orderData,
        mockCancelToken.signal,
      );

      await wait(100);
      const result = await executePromise;

      expect(mockAsyncClient.placeOrder).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    it("should handle execution time within pre-window buffer", async () => {
      const executionTime = new Date(Date.now() + 500); // 500ms from now (within 1000ms buffer)
      const orderData = {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      };

      mockAsyncClient.placeOrder.mockResolvedValue({
        orderId: "12345",
        status: "NEW",
      });

      const executePromise = coordinator.executeInWindow(
        executionTime,
        orderData,
        mockCancelToken.signal,
      );

      // Should execute immediately since we're within buffer
      await wait(100);
      const result = await executePromise;

      expect(mockAsyncClient.placeOrder).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });

  describe("cancellation triggers", () => {
    it("should cancel execution when abort signal is triggered", async () => {
      const executionTime = new Date(Date.now() + 5000);
      const orderData = {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      };

      const executePromise = coordinator.executeInWindow(
        executionTime,
        orderData,
        mockCancelToken.signal,
      );

      // Cancel before execution
      mockCancelToken.abort();

      await wait(100);
      const result = await executePromise;

      expect(mockAsyncClient.placeOrder).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain("cancel");
    });

    it("should cancel execution during wait period", async () => {
      const executionTime = new Date(Date.now() + 5000);
      const orderData = {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      };

      const executePromise = coordinator.executeInWindow(
        executionTime,
        orderData,
        mockCancelToken.signal,
      );

      // Wait a bit
      await wait(2000);

      // Cancel during wait
      mockCancelToken.abort();

      await wait(100);
      const result = await executePromise;

      expect(mockAsyncClient.placeOrder).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });
  });

  describe("retry fallback reuse", () => {
    it("should retry on failure using existing retry logic", async () => {
      const executionTime = new Date(Date.now() + 1000);
      const orderData = {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      };

      // First attempt fails, second succeeds
      mockAsyncClient.placeOrder
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          orderId: "12345",
          status: "NEW",
        });

      const executePromise = coordinator.executeInWindow(
        executionTime,
        orderData,
        mockCancelToken.signal,
        {
          maxRetries: 2,
          baseDelay: 100,
        },
      );

      await wait(100);
      const result = await executePromise;

      expect(mockAsyncClient.placeOrder).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it("should fail after max retries exceeded", async () => {
      const executionTime = new Date(Date.now() + 1000);
      const orderData = {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      };

      mockAsyncClient.placeOrder.mockRejectedValue(new Error("Persistent error"));

      const executePromise = coordinator.executeInWindow(
        executionTime,
        orderData,
        mockCancelToken.signal,
        {
          maxRetries: 2,
          baseDelay: 100,
        },
      );

      await wait(100);
      const result = await executePromise;

      expect(mockAsyncClient.placeOrder).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(result.success).toBe(false);
      expect(result.error).toContain("Persistent error");
    });
  });

  describe("post-window handling", () => {
    it("should not execute if execution time has passed beyond post-window buffer", async () => {
      const executionTime = new Date(Date.now() - 3000); // 3 seconds ago (beyond 2s post-window)
      const orderData = {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      };

      const executePromise = coordinator.executeInWindow(
        executionTime,
        orderData,
        mockCancelToken.signal,
      );

      await wait(100);
      const result = await executePromise;

      expect(mockAsyncClient.placeOrder).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toContain("window");
    });

    it("should execute if within post-window buffer", async () => {
      const executionTime = new Date(Date.now() - 1000); // 1 second ago (within 2s post-window)
      const orderData = {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      };

      mockAsyncClient.placeOrder.mockResolvedValue({
        orderId: "12345",
        status: "NEW",
      });

      const executePromise = coordinator.executeInWindow(
        executionTime,
        orderData,
        mockCancelToken.signal,
      );

      await wait(100);
      const result = await executePromise;

      expect(mockAsyncClient.placeOrder).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });

  describe("concurrent executions", () => {
    it("should handle multiple concurrent execution windows", async () => {
      const executionTime1 = new Date(Date.now() + 2000);
      const executionTime2 = new Date(Date.now() + 3000);
      const orderData1 = {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.001",
        price: "50000",
      };
      const orderData2 = {
        symbol: "ETHUSDT",
        side: "BUY" as const,
        type: "LIMIT",
        quantity: "0.01",
        price: "3000",
      };

      mockAsyncClient.placeOrder.mockResolvedValue({
        orderId: "12345",
        status: "NEW",
      });

      const token1 = new AbortController();
      const token2 = new AbortController();

      const promise1 = coordinator.executeInWindow(executionTime1, orderData1, token1.signal);
      const promise2 = coordinator.executeInWindow(executionTime2, orderData2, token2.signal);

      // Wait for first execution
      await wait(2100);

      // Wait for second execution
      await wait(1100);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(mockAsyncClient.placeOrder).toHaveBeenCalledTimes(2);
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      token1.abort();
      token2.abort();
    });
  });
});
