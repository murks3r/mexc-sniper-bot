/**
 * EventAuditLog Tests
 *
 * Ensures each major lifecycle event emits structuredLogger.info with correlation IDs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventAuditLog } from "../event-audit-log";
import type { StructuredLoggerAdapter } from "../structured-logger-adapter";

describe("EventAuditLog", () => {
  let auditLog: EventAuditLog;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Create audit log with mocked logger
    auditLog = new EventAuditLog(mockLogger as unknown as StructuredLoggerAdapter);
  });

  describe("order lifecycle events", () => {
    it("should log order placed event with correlation ID", () => {
      const event = {
        orderId: "order-123",
        symbol: "BTCUSDT",
        side: "BUY" as const,
        quantity: "0.001",
        price: "50000",
        correlationId: "corr-abc-123",
      };

      auditLog.logOrderPlaced(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("order_placed"),
        expect.objectContaining({
          orderId: "order-123",
          symbol: "BTCUSDT",
          side: "BUY",
          correlationId: "corr-abc-123",
        }),
      );
    });

    it("should log order filled event", () => {
      const event = {
        orderId: "order-456",
        symbol: "ETHUSDT",
        filledQuantity: "0.01",
        filledPrice: "3000",
        correlationId: "corr-def-456",
      };

      auditLog.logOrderFilled(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("order_filled"),
        expect.objectContaining({
          orderId: "order-456",
          symbol: "ETHUSDT",
          filledQuantity: "0.01",
          correlationId: "corr-def-456",
        }),
      );
    });

    it("should log order cancelled event", () => {
      const event = {
        orderId: "order-789",
        symbol: "BNBUSDT",
        reason: "timeout",
        correlationId: "corr-ghi-789",
      };

      auditLog.logOrderCancelled(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("order_cancelled"),
        expect.objectContaining({
          orderId: "order-789",
          symbol: "BNBUSDT",
          reason: "timeout",
          correlationId: "corr-ghi-789",
        }),
      );
    });
  });

  describe("execution coordination events", () => {
    it("should log execution window started", () => {
      const event = {
        targetId: 1,
        symbol: "SOLUSDT",
        windowStart: new Date("2024-01-01T10:00:00Z"),
        windowEnd: new Date("2024-01-01T10:05:00Z"),
        correlationId: "corr-window-1",
      };

      auditLog.logExecutionWindowStarted(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("execution_window_started"),
        expect.objectContaining({
          targetId: 1,
          symbol: "SOLUSDT",
          correlationId: "corr-window-1",
        }),
      );
    });

    it("should log execution window ended", () => {
      const event = {
        targetId: 2,
        symbol: "ADAUSDT",
        ordersPlaced: 3,
        ordersFilled: 1,
        correlationId: "corr-window-2",
      };

      auditLog.logExecutionWindowEnded(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("execution_window_ended"),
        expect.objectContaining({
          targetId: 2,
          symbol: "ADAUSDT",
          ordersPlaced: 3,
          ordersFilled: 1,
          correlationId: "corr-window-2",
        }),
      );
    });
  });

  describe("take-profit events", () => {
    it("should log take-profit triggered", () => {
      const event = {
        positionId: 10,
        symbol: "DOTUSDT",
        entryPrice: 7,
        exitPrice: 7.7,
        profitPercent: 10,
        correlationId: "corr-tp-1",
      };

      auditLog.logTakeProfitTriggered(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("take_profit_triggered"),
        expect.objectContaining({
          positionId: 10,
          symbol: "DOTUSDT",
          entryPrice: 7,
          exitPrice: 7.7,
          profitPercent: 10,
          correlationId: "corr-tp-1",
        }),
      );
    });

    it("should log stop-loss triggered", () => {
      const event = {
        positionId: 11,
        symbol: "LINKUSDT",
        entryPrice: 15,
        exitPrice: 14.25,
        lossPercent: 5,
        correlationId: "corr-sl-1",
      };

      auditLog.logStopLossTriggered(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("stop_loss_triggered"),
        expect.objectContaining({
          positionId: 11,
          symbol: "LINKUSDT",
          entryPrice: 15,
          exitPrice: 14.25,
          lossPercent: 5,
          correlationId: "corr-sl-1",
        }),
      );
    });
  });

  describe("balance guard events", () => {
    it("should log balance check blocked", () => {
      const event = {
        asset: "USDT",
        requiredBalance: 1000,
        availableBalance: 500,
        reason: "insufficient_balance",
        correlationId: "corr-balance-1",
      };

      auditLog.logBalanceCheckBlocked(event);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("balance_check_blocked"),
        expect.objectContaining({
          asset: "USDT",
          requiredBalance: 1000,
          availableBalance: 500,
          reason: "insufficient_balance",
          correlationId: "corr-balance-1",
        }),
      );
    });

    it("should log balance updated from websocket", () => {
      const event = {
        asset: "BTC",
        free: "0.1",
        locked: "0",
        correlationId: "corr-balance-2",
      };

      auditLog.logBalanceUpdated(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("balance_updated"),
        expect.objectContaining({
          asset: "BTC",
          free: "0.1",
          locked: "0",
          correlationId: "corr-balance-2",
        }),
      );
    });
  });

  describe("error events", () => {
    it("should log execution error", () => {
      const event = {
        targetId: 5,
        symbol: "MATICUSDT",
        error: "Order placement failed",
        correlationId: "corr-error-1",
      };

      auditLog.logExecutionError(event);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("execution_error"),
        expect.objectContaining({
          targetId: 5,
          symbol: "MATICUSDT",
          error: "Order placement failed",
          correlationId: "corr-error-1",
        }),
      );
    });
  });

  describe("correlation ID handling", () => {
    it("should auto-generate correlation ID if not provided", () => {
      const event = {
        orderId: "order-auto",
        symbol: "AVAXUSDT",
        side: "SELL" as const,
        quantity: "1",
        price: "30",
      };

      auditLog.logOrderPlaced(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          orderId: "order-auto",
          correlationId: expect.any(String),
        }),
      );
    });

    it("should preserve provided correlation ID", () => {
      const event = {
        orderId: "order-preserved",
        symbol: "UNIUSDT",
        side: "BUY" as const,
        quantity: "10",
        price: "8",
        correlationId: "custom-correlation-id",
      };

      auditLog.logOrderPlaced(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          correlationId: "custom-correlation-id",
        }),
      );
    });
  });
});
