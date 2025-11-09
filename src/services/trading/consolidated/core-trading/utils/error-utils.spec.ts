import { describe, it, expect } from "vitest";
import { isNonRetryableError, calculateRetryDelay } from "./error-utils";

describe("isNonRetryableError", () => {
  it("should return true for insufficient balance errors", () => {
    expect(isNonRetryableError("insufficient balance")).toBe(true);
    expect(isNonRetryableError(new Error("insufficient balance for order"))).toBe(true);
  });

  it("should return true for invalid symbol errors", () => {
    expect(isNonRetryableError("invalid symbol")).toBe(true);
    expect(isNonRetryableError(new Error("invalid symbol"))).toBe(true);
  });

  it("should return true for trading disabled errors", () => {
    expect(isNonRetryableError("trading disabled")).toBe(true);
    expect(isNonRetryableError(new Error("trading disabled"))).toBe(true);
  });

  it("should be case-sensitive for pattern matching", () => {
    expect(isNonRetryableError("INVALID SYMBOL")).toBe(false);
    expect(isNonRetryableError("Trading Disabled")).toBe(false);
  });

  it("should return true for lot size errors", () => {
    expect(isNonRetryableError("MARKET_LOT_SIZE")).toBe(true);
    expect(isNonRetryableError(new Error("Quantity violates MARKET_LOT_SIZE"))).toBe(true);
  });

  it("should return true for notional errors", () => {
    expect(isNonRetryableError("MIN_NOTIONAL")).toBe(true);
    expect(isNonRetryableError(new Error("Order amount below MIN_NOTIONAL"))).toBe(true);
  });

  it("should return true for price limit errors", () => {
    expect(isNonRetryableError("Order price cannot exceed")).toBe(true);
    expect(isNonRetryableError("exceeds maximum allowed price")).toBe(true);
    expect(isNonRetryableError("below minimum allowed price")).toBe(true);
    expect(isNonRetryableError("price limit")).toBe(true);
  });

  it("should return true for MEXC error code 30010", () => {
    expect(isNonRetryableError("30010")).toBe(true);
    expect(isNonRetryableError(new Error("API Error 30010: Price limit exceeded"))).toBe(true);
  });

  it("should return false for retryable errors", () => {
    expect(isNonRetryableError("timeout")).toBe(false);
    expect(isNonRetryableError("network error")).toBe(false);
    expect(isNonRetryableError("connection refused")).toBe(false);
    expect(isNonRetryableError(new Error("Rate limit exceeded"))).toBe(false);
  });

  it("should handle string inputs", () => {
    expect(isNonRetryableError("insufficient balance")).toBe(true);
    expect(isNonRetryableError("some other error")).toBe(false);
  });

  it("should handle Error objects", () => {
    expect(isNonRetryableError(new Error("insufficient balance"))).toBe(true);
    expect(isNonRetryableError(new Error("some other error"))).toBe(false);
  });
});

describe("calculateRetryDelay", () => {
  it("should calculate exponential backoff delays", () => {
    expect(calculateRetryDelay(1)).toBe(1000); // 2^(1-1) = 2^0 = 1 * 1000 = 1000
    expect(calculateRetryDelay(2)).toBe(2000); // 2^(2-1) = 2^1 = 2 * 1000 = 2000
    expect(calculateRetryDelay(3)).toBe(4000); // 2^(3-1) = 2^2 = 4 * 1000 = 4000
    expect(calculateRetryDelay(4)).toBe(5000); // 2^(4-1) = 2^3 = 8 * 1000 = 8000, but capped at 5000
  });

  it("should respect maximum delay limit", () => {
    expect(calculateRetryDelay(10)).toBe(5000); // Should be capped at 5000
    expect(calculateRetryDelay(20)).toBe(5000); // Should be capped at 5000
  });

  it("should allow custom max delay", () => {
    expect(calculateRetryDelay(1, 1000)).toBe(1000);
    expect(calculateRetryDelay(2, 1000)).toBe(1000); // Capped at custom max
  });

  it("should handle edge cases", () => {
    expect(calculateRetryDelay(0)).toBe(500); // 2^(0-1) = 2^(-1) = 0.5 * 1000 = 500
    expect(calculateRetryDelay(-1)).toBe(250); // 2^(-1-1) = 2^(-2) = 0.25 * 1000 = 250
  });
});
