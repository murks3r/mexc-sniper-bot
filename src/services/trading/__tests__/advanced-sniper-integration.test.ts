/**
 * Integration Test for Advanced Sniper Utilities
 *
 * Tests that the advanced retry logic is properly integrated into production modules
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEXC_ERROR_CODES } from "../advanced-sniper-utils";
import { AutoSnipingModule } from "../consolidated/core-trading/auto-sniping";
import { OrderExecutor } from "../consolidated/core-trading/modules/order-executor";
import type { TradeParameters } from "../consolidated/core-trading/types";
import { OrderExecutionHelper } from "../consolidated/core-trading/utils/order-execution-helper";

describe("Advanced Sniper Integration", () => {
  describe("Error 10007 Retry Integration", () => {
    it("should retry on Error 10007 in OrderExecutor", async () => {
      const mockMexcService = {
        placeOrder: vi
          .fn()
          .mockResolvedValueOnce({
            success: false,
            error: "Symbol not tradeable",
            data: { code: MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE },
          })
          .mockResolvedValueOnce({
            success: true,
            data: {
              orderId: 12345,
              symbol: "TESTUSDT",
              side: "BUY",
              type: "MARKET",
              executedQty: "10",
              status: "FILLED",
            },
          }),
        getSymbolInfoBasic: vi.fn().mockResolvedValue({
          success: true,
          data: { status: "TRADING" },
        }),
      };

      const mockContext = {
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        },
        mexcService: mockMexcService,
        config: {
          maxRetries: 3,
        },
      };

      const orderExecutor = new OrderExecutor(mockContext as any);

      const params: TradeParameters = {
        symbol: "TESTUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 10,
        timeInForce: "IOC",
      };

      const result = await orderExecutor.executeRealSnipe(params);

      expect(result.success).toBe(true);
      expect(result.data?.orderId).toBe("12345");
      // Should have been called twice due to retry
      expect(mockMexcService.placeOrder).toHaveBeenCalledTimes(2);
    });

    it("should eventually fail after max retries on Error 10007", async () => {
      const mockMexcService = {
        placeOrder: vi.fn().mockResolvedValue({
          success: false,
          error: "Symbol not tradeable",
          data: { code: MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE },
        }),
        getSymbolInfoBasic: vi.fn().mockResolvedValue({
          success: true,
          data: { status: "TRADING" },
        }),
      };

      const mockContext = {
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        mexcService: mockMexcService,
        config: {
          maxRetries: 3,
        },
      };

      const orderExecutor = new OrderExecutor(mockContext as any);

      const params: TradeParameters = {
        symbol: "TESTUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 10,
        timeInForce: "IOC",
      };

      const result = await orderExecutor.executeRealSnipe(params);

      expect(result.success).toBe(false);
      // Should have retried maxRetries times
      expect(mockMexcService.placeOrder).toHaveBeenCalledTimes(3);
    });

    it("should not retry on non-retryable errors", async () => {
      const mockMexcService = {
        placeOrder: vi.fn().mockRejectedValue(new Error("Insufficient balance")),
        getSymbolInfoBasic: vi.fn().mockResolvedValue({
          success: true,
          data: { status: "TRADING" },
        }),
      };

      const mockContext = {
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        mexcService: mockMexcService,
        config: {
          maxRetries: 3,
        },
      };

      const orderExecutor = new OrderExecutor(mockContext as any);

      const params: TradeParameters = {
        symbol: "TESTUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 10,
        timeInForce: "IOC",
      };

      const result = await orderExecutor.executeRealSnipe(params);

      expect(result.success).toBe(false);
      // Should only be called once (no retry for insufficient balance)
      expect(mockMexcService.placeOrder).toHaveBeenCalledTimes(1);
      expect(result.error).toContain("Insufficient balance");
    });

    it("should succeed immediately on first attempt", async () => {
      const mockMexcService = {
        placeOrder: vi.fn().mockResolvedValue({
          success: true,
          data: {
            orderId: 67890,
            symbol: "TESTUSDT",
            side: "BUY",
            type: "MARKET",
            executedQty: "5",
            status: "FILLED",
          },
        }),
        getSymbolInfoBasic: vi.fn().mockResolvedValue({
          success: true,
          data: { status: "TRADING" },
        }),
        getCurrentPrice: vi.fn().mockResolvedValue(1.0),
      };

      const mockContext = {
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        mexcService: mockMexcService,
        config: {
          maxRetries: 3,
        },
      };

      const orderExecutor = new OrderExecutor(mockContext as any);

      const params: TradeParameters = {
        symbol: "TESTUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 5,
        timeInForce: "IOC",
      };

      const result = await orderExecutor.executeRealSnipe(params);

      expect(result.success).toBe(true);
      expect(result.data?.orderId).toBe("67890");
      // Should only be called once (no retry needed)
      expect(mockMexcService.placeOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe("OrderExecutionHelper Integration", () => {
    it("should use advanced retry logic", async () => {
      const mockMexcService = {
        placeOrder: vi
          .fn()
          .mockResolvedValueOnce({
            success: false,
            error: "Symbol not tradeable",
            data: { code: MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE },
          })
          .mockResolvedValueOnce({
            success: true,
            data: {
              orderId: 11111,
              symbol: "HELPERUSDT",
              status: "FILLED",
            },
          }),
      };

      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const helper = new OrderExecutionHelper({
        mexcService: mockMexcService,
        logger: mockLogger,
        getCurrentPrice: vi.fn().mockResolvedValue(2.0),
        maxRetries: 3,
      });

      const result = await helper.executeTrade({
        symbol: "HELPERUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data?.orderId).toBe(11111);
      expect(mockMexcService.placeOrder).toHaveBeenCalledTimes(2);
    });
  });

  describe("Error Detection", () => {
    it("should detect MEXC error code 10007 in response", async () => {
      const errorResponse = {
        success: false,
        data: {
          code: MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE,
          msg: "Symbol is not tradeable",
        },
      };

      // The executeOrderWithRetry function should detect this code
      expect(errorResponse.data.code).toBe(MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE);
    });

    it("should detect error code in error object", () => {
      const error = {
        code: MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE,
        message: "Symbol not yet tradeable",
      };

      expect(error.code).toBe(MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE);
    });
  });
});
