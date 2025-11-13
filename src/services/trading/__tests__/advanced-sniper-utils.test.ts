/**
 * Tests for Advanced Sniper Utilities
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SymbolFilter } from "../../api/mexc-client-types";
import type { MexcServiceResponse } from "../../data/modules/mexc-api-types";
import {
  DEFAULT_RETRY_CONFIG,
  DEFAULT_TIMING_CONFIG,
  executeOrderWithRetry,
  isWithinExecutionWindow,
  MEXC_ERROR_CODES,
  type QuantityValidationResult,
  sleep,
  validateAndAdjustQuantity,
  waitForExecutionWindow,
} from "../advanced-sniper-utils";

describe("Advanced Sniper Utilities", () => {
  describe("executeOrderWithRetry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should succeed on first attempt", async () => {
      const mockFn = vi.fn().mockResolvedValue({
        success: true,
        data: { orderId: 123 },
      });

      const promise = executeOrderWithRetry(mockFn);
      vi.runAllTimers();
      const result = await promise;

      expect(result.success).toBe(true);
      expect((result.data as any)?.orderId).toBe(123);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should retry on Error 10007 and succeed", async () => {
      const mockFn = vi
        .fn()
        .mockResolvedValueOnce({
          success: false,
          data: { code: MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { orderId: 123 },
        });

      const promise = executeOrderWithRetry(mockFn, { maxRetries: 3, initialDelayMs: 100 });

      // Fast-forward through first retry delay
      vi.advanceTimersByTime(100);
      await Promise.resolve(); // Let promises resolve

      const result = await promise;

      expect(result.success).toBe(true);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should fail after max retries", async () => {
      const mockFn = vi.fn().mockResolvedValue({
        success: false,
        data: { code: MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE },
      });

      const promise = executeOrderWithRetry(mockFn, {
        maxRetries: 2,
        initialDelayMs: 100,
        maxDelayMs: 200,
      });

      // Fast-forward through all retry delays
      vi.advanceTimersByTime(100); // First retry
      await Promise.resolve();
      vi.advanceTimersByTime(150); // Second retry (capped at 200ms)
      await Promise.resolve();

      await expect(promise).rejects.toThrow("Max retries");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should not retry on non-retryable errors", async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error("Invalid symbol"));

      const promise = executeOrderWithRetry(mockFn);

      await expect(promise).rejects.toThrow("Invalid symbol");
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("validateAndAdjustQuantity", () => {
    const mockFilters: SymbolFilter[] = [
      {
        filterType: "LOT_SIZE",
        minQty: "0.001",
        maxQty: "9000000",
        stepSize: "0.001",
      },
      {
        filterType: "PRICE_FILTER",
        minPrice: "0.00000001",
        maxPrice: "100000",
        tickSize: "0.00000001",
      },
      {
        filterType: "MIN_NOTIONAL",
        minNotional: "10",
      },
    ];

    it("should validate and round valid quantity", () => {
      const result = validateAndAdjustQuantity(100.12345, 0.5, mockFilters);

      expect(result.isValid).toBe(true);
      expect(result.adjustedQuantity).toBe("100.123");
      expect(result.errors).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0); // Should warn about rounding
    });

    it("should reject quantity below minimum", () => {
      const result = validateAndAdjustQuantity(0.0005, 1.0, mockFilters);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("below minimum");
    });

    it("should reject notional value below minimum", () => {
      const result = validateAndAdjustQuantity(5, 1.5, mockFilters); // 5 * 1.5 = 7.5 < 10

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("below minimum");
    });

    it("should handle missing LOT_SIZE filter", () => {
      const result = validateAndAdjustQuantity(100, 1.0, []);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("LOT_SIZE filter not found");
    });

    it("should calculate correct precision from step size", () => {
      const filtersWithDifferentStep: SymbolFilter[] = [
        {
          filterType: "LOT_SIZE",
          minQty: "0.00001",
          maxQty: "9000000",
          stepSize: "0.00001", // 5 decimal places
        },
        {
          filterType: "MIN_NOTIONAL",
          minNotional: "1",
        },
      ];

      const result = validateAndAdjustQuantity(100.123456, 1.0, filtersWithDifferentStep);

      expect(result.isValid).toBe(true);
      expect(result.details.precision).toBe(5);
      expect(result.adjustedQuantity).toBe("100.12345");
    });
  });

  describe("waitForExecutionWindow", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should wait until execution window", async () => {
      const launchTime = new Date(Date.now() + 5000); // 5 seconds in future

      const promise = waitForExecutionWindow(launchTime, {
        preLaunchOffsetMs: -1000, // Start 1s before
        pollIntervalMs: 100,
      });

      // Fast-forward to just before window (3.5s = 3500ms)
      vi.advanceTimersByTime(3500);
      await Promise.resolve();

      // Fast-forward past window start
      vi.advanceTimersByTime(1000);

      const result = await promise;

      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
      expect(result.startTime.getTime()).toBeLessThan(result.endTime.getTime());
    });
  });

  describe("isWithinExecutionWindow", () => {
    it("should return true if before end time", () => {
      const endTime = new Date(Date.now() + 5000);
      expect(isWithinExecutionWindow(endTime)).toBe(true);
    });

    it("should return false if after end time", () => {
      const endTime = new Date(Date.now() - 1000);
      expect(isWithinExecutionWindow(endTime)).toBe(false);
    });
  });

  describe("sleep", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should sleep for specified duration", async () => {
      const promise = sleep(1000);

      vi.advanceTimersByTime(999);
      await Promise.resolve();
      // Should still be pending

      vi.advanceTimersByTime(1);
      await promise; // Should resolve now
    });
  });
});
