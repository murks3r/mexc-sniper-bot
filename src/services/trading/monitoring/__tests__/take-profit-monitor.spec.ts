/**
 * TakeProfitMonitor Tests
 *
 * Simulates partial fills, verifies auto-cancel and TP triggering via mocked mexc service.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncMexcClient } from "@/src/services/trading/clients/async-mexc-client";
import { TakeProfitMonitor } from "../take-profit-monitor";

// Helper to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("TakeProfitMonitor", () => {
  let monitor: TakeProfitMonitor;
  let mockAsyncClient: {
    getTicker: ReturnType<typeof vi.fn>;
    cancelOrder: ReturnType<typeof vi.fn>;
    placeOrder: ReturnType<typeof vi.fn>;
  };
  let mockOnTakeProfit: ReturnType<typeof vi.fn>;
  let mockOnCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAsyncClient = {
      getTicker: vi.fn(),
      cancelOrder: vi.fn(),
      placeOrder: vi.fn(),
    };

    mockOnTakeProfit = vi.fn();
    mockOnCancel = vi.fn();

    monitor = new TakeProfitMonitor(mockAsyncClient as unknown as AsyncMexcClient, {
      checkIntervalMs: 100,
      takeProfitPercent: 10,
      stopLossPercent: 5,
    });
  });

  afterEach(() => {
    monitor.stop();
  });

  describe("partial fill detection", () => {
    it("should detect when position reaches take-profit level", async () => {
      const position = {
        id: 1,
        symbol: "BTCUSDT",
        entryPrice: 50000,
        quantity: "0.001",
        status: "open" as const,
      };

      // Entry price: $50,000
      // Take profit: $55,000 (10% above)
      // Current price reaches TP
      mockAsyncClient.getTicker.mockResolvedValue({
        price: "55000",
        symbol: "BTCUSDT",
      });

      monitor.startMonitoring(position, mockOnTakeProfit, mockOnCancel);

      // Wait for check interval
      await wait(150);

      expect(mockAsyncClient.getTicker).toHaveBeenCalled();
      expect(mockOnTakeProfit).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 1,
          symbol: "BTCUSDT",
          entryPrice: 50000,
          currentPrice: 55000,
          profitPercent: 10,
        }),
      );
    });

    it("should detect when position hits stop-loss level", async () => {
      const position = {
        id: 2,
        symbol: "ETHUSDT",
        entryPrice: 3000,
        quantity: "0.01",
        status: "open" as const,
      };

      // Entry price: $3,000
      // Stop loss: $2,850 (5% below)
      // Current price hits SL
      mockAsyncClient.getTicker.mockResolvedValue({
        price: "2850",
        symbol: "ETHUSDT",
      });

      monitor.startMonitoring(position, mockOnTakeProfit, mockOnCancel);

      await wait(150);

      expect(mockOnCancel).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 2,
          symbol: "ETHUSDT",
          reason: "stop_loss",
        }),
      );
    });

    it("should continue monitoring when price is within range", async () => {
      const position = {
        id: 3,
        symbol: "BNBUSDT",
        entryPrice: 400,
        quantity: "0.1",
        status: "open" as const,
      };

      // Entry: $400
      // TP: $440 (10%), SL: $380 (5%)
      // Current: $410 (within range)
      mockAsyncClient.getTicker.mockResolvedValue({
        price: "410",
        symbol: "BNBUSDT",
      });

      monitor.startMonitoring(position, mockOnTakeProfit, mockOnCancel);

      await wait(150);

      expect(mockAsyncClient.getTicker).toHaveBeenCalled();
      expect(mockOnTakeProfit).not.toHaveBeenCalled();
      expect(mockOnCancel).not.toHaveBeenCalled();
    });
  });

  describe("auto-cancel functionality", () => {
    it("should auto-cancel order when TP is triggered", async () => {
      const position = {
        id: 4,
        symbol: "SOLUSDT",
        entryPrice: 100,
        quantity: "1",
        status: "open" as const,
        orderId: "order-123",
      };

      mockAsyncClient.getTicker.mockResolvedValue({
        price: "110", // 10% above entry
        symbol: "SOLUSDT",
      });

      mockAsyncClient.cancelOrder.mockResolvedValue({
        success: true,
        orderId: "order-123",
      });

      monitor.startMonitoring(position, mockOnTakeProfit, mockOnCancel);

      await wait(150);

      expect(mockOnTakeProfit).toHaveBeenCalled();
      // Should attempt to cancel any pending orders
      expect(mockAsyncClient.cancelOrder).toHaveBeenCalled();
    });

    it("should handle cancel order failures gracefully", async () => {
      const position = {
        id: 5,
        symbol: "ADAUSDT",
        entryPrice: 0.5,
        quantity: "100",
        status: "open" as const,
        orderId: "order-456",
      };

      mockAsyncClient.getTicker.mockResolvedValue({
        price: "0.55", // 10% above entry
        symbol: "ADAUSDT",
      });

      mockAsyncClient.cancelOrder.mockRejectedValue(new Error("Cancel failed"));

      monitor.startMonitoring(position, mockOnTakeProfit, mockOnCancel);

      await wait(150);

      // Should still trigger TP even if cancel fails
      expect(mockOnTakeProfit).toHaveBeenCalled();
      expect(mockAsyncClient.cancelOrder).toHaveBeenCalled();
    });
  });

  describe("monitoring lifecycle", () => {
    it("should stop monitoring when stop() is called", async () => {
      const position = {
        id: 6,
        symbol: "DOTUSDT",
        entryPrice: 7,
        quantity: "10",
        status: "open" as const,
      };

      mockAsyncClient.getTicker.mockResolvedValue({
        price: "7.5",
        symbol: "DOTUSDT",
      });

      monitor.startMonitoring(position, mockOnTakeProfit, mockOnCancel);

      await wait(50);
      const callCountBeforeStop = mockAsyncClient.getTicker.mock.calls.length;

      monitor.stop();

      await wait(200);
      const callCountAfterStop = mockAsyncClient.getTicker.mock.calls.length;

      // Should not continue checking after stop
      expect(callCountAfterStop).toBe(callCountBeforeStop);
    });

    it("should handle multiple positions concurrently", async () => {
      const position1 = {
        id: 7,
        symbol: "LINKUSDT",
        entryPrice: 15,
        quantity: "5",
        status: "open" as const,
      };

      const position2 = {
        id: 8,
        symbol: "UNIUSDT",
        entryPrice: 8,
        quantity: "10",
        status: "open" as const,
      };

      mockAsyncClient.getTicker
        .mockResolvedValueOnce({ price: "16.5", symbol: "LINKUSDT" }) // TP
        .mockResolvedValueOnce({ price: "7.6", symbol: "UNIUSDT" }); // SL

      monitor.startMonitoring(position1, mockOnTakeProfit, mockOnCancel);
      monitor.startMonitoring(position2, mockOnTakeProfit, mockOnCancel);

      await wait(150);

      expect(mockAsyncClient.getTicker).toHaveBeenCalledTimes(2);
      expect(mockOnTakeProfit).toHaveBeenCalledTimes(1);
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("price calculation", () => {
    it("should calculate profit percentage correctly", async () => {
      const position = {
        id: 9,
        symbol: "MATICUSDT",
        entryPrice: 1,
        quantity: "100",
        status: "open" as const,
      };

      // 15% profit
      mockAsyncClient.getTicker.mockResolvedValue({
        price: "1.15",
        symbol: "MATICUSDT",
      });

      monitor.startMonitoring(position, mockOnTakeProfit, mockOnCancel);

      await wait(150);

      expect(mockOnTakeProfit).toHaveBeenCalledWith(
        expect.objectContaining({
          profitPercent: expect.closeTo(15, 1), // Allow 1% tolerance for floating point
        }),
      );
    });

    it("should calculate loss percentage correctly", async () => {
      const position = {
        id: 10,
        symbol: "AVAXUSDT",
        entryPrice: 30,
        quantity: "5",
        status: "open" as const,
      };

      // 8% loss (beyond 5% stop loss)
      mockAsyncClient.getTicker.mockResolvedValue({
        price: "27.6",
        symbol: "AVAXUSDT",
      });

      monitor.startMonitoring(position, mockOnTakeProfit, mockOnCancel);

      await wait(150);

      expect(mockOnCancel).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "stop_loss",
        }),
      );
    });
  });
});
