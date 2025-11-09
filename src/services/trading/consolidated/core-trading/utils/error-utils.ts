/**
 * Error handling utilities for trading operations
 */

/**
 * Check if an error is non-retryable (should not be retried)
 */
export function isNonRetryableError(error: Error | string): boolean {
  const errorMessage = typeof error === "string" ? error : error.message;

  const nonRetryablePatterns = [
    "insufficient balance",
    "invalid symbol",
    "trading disabled",
    "MARKET_LOT_SIZE",
    "MIN_NOTIONAL",
    "Order price cannot exceed",
    "exceeds maximum allowed price",
    "below minimum allowed price",
    "price limit",
    "30010", // MEXC price limit error code
  ];

  return nonRetryablePatterns.some((pattern) => errorMessage.includes(pattern));
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(attempt: number, maxDelay: number = 5000): number {
  return Math.min(1000 * 2 ** (attempt - 1), maxDelay);
}



