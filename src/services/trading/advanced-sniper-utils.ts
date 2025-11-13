/**
 * Advanced Sniper Utilities
 *
 * High-performance sniping utilities learned from successful MEXC sniper implementations.
 * Based on analysis of Habibaeo/mexc-sniper-bot-vultr and Tonoy77/mexc-sniper.
 *
 * Key Features:
 * - Error 10007 (Symbol not tradeable) retry logic
 * - Comprehensive quantity validation
 * - Precise execution timing
 * - Order spam strategy with safeguards
 */

import { getLogger } from "../../lib/unified-logger";
import type { SymbolFilter } from "../api/mexc-client-types";
import type { MexcServiceResponse } from "../data/modules/mexc-api-types";
import type { OrderResult } from "../data/modules/mexc-core-trading";

const logger = getLogger("advanced-sniper-utils");

// ============================================================================
// Configuration Types
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface TimingConfig {
  preLaunchOffsetMs: number; // How early to start (e.g., -500ms)
  postLaunchWindowMs: number; // How long after launch (e.g., 700ms)
  pollIntervalMs: number; // Polling frequency during window
}

export interface OrderSpamConfig {
  enabled: boolean;
  maxConcurrentOrders: number; // Safety limit (3-5 recommended)
  burstIntervalMs: number; // Time between order attempts
  autoCancel: boolean; // Cancel unfilled orders
}

export interface QuantityValidationResult {
  isValid: boolean;
  adjustedQuantity?: string;
  errors: string[];
  warnings: string[];
  details: {
    rawQuantity: number;
    roundedQuantity: number;
    precision: number;
    minQty?: number;
    maxQty?: number;
    stepSize?: number;
    notionalValue?: number;
    minNotional?: number;
  };
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 10,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 1.5,
};

export const DEFAULT_TIMING_CONFIG: TimingConfig = {
  preLaunchOffsetMs: -500, // Start 0.5s before
  postLaunchWindowMs: 700, // Continue 0.7s after
  pollIntervalMs: 100, // Check every 100ms
};

export const DEFAULT_ORDER_SPAM_CONFIG: OrderSpamConfig = {
  enabled: false, // Disabled by default for safety
  maxConcurrentOrders: 3,
  burstIntervalMs: 50,
  autoCancel: true,
};

// ============================================================================
// MEXC Error Codes
// ============================================================================

export const MEXC_ERROR_CODES = {
  SYMBOL_NOT_TRADEABLE: 10007,
  INVALID_SYMBOL: -1121,
  PRICE_PRECISION: -1111,
  QTY_PRECISION: -1112,
  MIN_NOTIONAL: -1013,
  LOT_SIZE: -1013,
  INSUFFICIENT_BALANCE: -2010,
  RATE_LIMIT: -1003,
} as const;

// ============================================================================
// Retry Logic with Error 10007 Detection
// ============================================================================

/**
 * Execute order with automatic retry on specific errors (especially Error 10007)
 *
 * Error 10007 = "Symbol not yet tradeable" - happens when listing announced but trading not enabled
 */
interface ErrorWithCode extends Error {
  code?: number;
  response?: {
    data?: {
      code?: number;
    };
  };
}

interface ResponseWithCode {
  code?: number;
}

export async function executeOrderWithRetry<T>(
  orderFn: () => Promise<MexcServiceResponse<T>>,
  config: Partial<RetryConfig> = {},
): Promise<MexcServiceResponse<T>> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < finalConfig.maxRetries; attempt++) {
    try {
      const result = await orderFn();

      // Check if result contains error code 10007
      const responseData = result.data as ResponseWithCode | undefined;
      const responseCode = (result as unknown as ResponseWithCode)?.code;
      const errorCode = responseData?.code ?? responseCode;

      if (errorCode === MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE) {
        const delay = Math.min(
          finalConfig.initialDelayMs * finalConfig.backoffMultiplier ** attempt,
          finalConfig.maxDelayMs,
        );

        logger.warn("Symbol not yet tradeable, retrying", {
          errorCode: String(errorCode),
          attempt: attempt + 1,
          maxRetries: finalConfig.maxRetries,
          delayMs: delay,
        });

        await sleep(delay);
        continue;
      }

      // Success or non-retryable error
      return result;
    } catch (error) {
      const caughtError = error instanceof Error ? error : new Error(String(error));
      lastError = caughtError;

      // Check if error is retryable
      const errorWithCode = caughtError as ErrorWithCode;
      const errorCode = errorWithCode.code ?? errorWithCode.response?.data?.code;

      if (
        errorCode === MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE ||
        errorCode === MEXC_ERROR_CODES.RATE_LIMIT
      ) {
        const delay = Math.min(
          finalConfig.initialDelayMs * finalConfig.backoffMultiplier ** attempt,
          finalConfig.maxDelayMs,
        );

        logger.warn("Retryable error encountered, retrying", {
          errorCode: errorCode ? String(errorCode) : undefined,
          attempt: attempt + 1,
          maxRetries: finalConfig.maxRetries,
          delayMs: delay,
          errorMessage: caughtError.message,
        });

        await sleep(delay);
        continue;
      }

      // Non-retryable error
      throw caughtError;
    }
  }

  // Max retries exceeded - ensure lastError is captured
  const errorMessage = lastError?.message ?? "Unknown error";
  const finalError = new Error(
    `Max retries (${finalConfig.maxRetries}) exceeded. Last error: ${errorMessage}`,
  );
  // Attach original error as cause if supported (ES2022+)
  if (lastError && "cause" in Error.prototype) {
    (finalError as Error & { cause?: Error }).cause = lastError;
  }
  throw finalError;
}

// ============================================================================
// Quantity Validation with LOT_SIZE Filters
// ============================================================================

/**
 * Validate and adjust quantity based on symbol filters
 *
 * Checks:
 * - Step size precision
 * - Min/max quantity
 * - Notional value (quantity * price >= minNotional)
 */
export function validateAndAdjustQuantity(
  rawQuantity: number,
  price: number,
  filters: SymbolFilter[],
): QuantityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Find LOT_SIZE filter
  const lotSizeFilter = filters.find((f) => f.filterType === "LOT_SIZE");
  const _priceFilter = filters.find((f) => f.filterType === "PRICE_FILTER");
  const minNotionalFilter = filters.find((f) => f.filterType === "MIN_NOTIONAL");

  if (!lotSizeFilter) {
    return {
      isValid: false,
      errors: ["LOT_SIZE filter not found in symbol info"],
      warnings: [],
      details: {
        rawQuantity,
        roundedQuantity: rawQuantity,
        precision: 8,
      },
    };
  }

  // Extract constraints
  const stepSize = Number.parseFloat(lotSizeFilter.stepSize || "0.00000001");
  const minQty = Number.parseFloat(lotSizeFilter.minQty || "0");
  const maxQty = Number.parseFloat(lotSizeFilter.maxQty || "9000000000");
  const minNotional = Number.parseFloat(minNotionalFilter?.minNotional || "1");

  // Calculate precision from step size
  const precision = getDecimalPlaces(stepSize);

  // Round quantity to valid step size
  const roundedQuantity = roundToStepSize(rawQuantity, stepSize, precision);

  // Validate min quantity
  if (roundedQuantity < minQty) {
    errors.push(
      `Quantity ${roundedQuantity} is below minimum ${minQty}. Increase budget or check symbol rules.`,
    );
  }

  // Validate max quantity
  if (roundedQuantity > maxQty) {
    errors.push(`Quantity ${roundedQuantity} exceeds maximum ${maxQty}.`);
  }

  // Validate notional value
  const notionalValue = roundedQuantity * price;
  if (notionalValue < minNotional) {
    errors.push(
      `Order value $${notionalValue.toFixed(4)} USDT is below minimum $${minNotional} USDT. Increase budget.`,
    );
  }

  // Add warnings for edge cases
  if (roundedQuantity !== rawQuantity) {
    warnings.push(
      `Quantity adjusted from ${rawQuantity} to ${roundedQuantity} to match step size ${stepSize}`,
    );
  }

  return {
    isValid: errors.length === 0,
    adjustedQuantity: errors.length === 0 ? roundedQuantity.toFixed(precision) : undefined,
    errors,
    warnings,
    details: {
      rawQuantity,
      roundedQuantity,
      precision,
      minQty,
      maxQty,
      stepSize,
      notionalValue,
      minNotional,
    },
  };
}

/**
 * Calculate decimal places from step size
 */
function getDecimalPlaces(stepSize: number): number {
  const stepStr = stepSize.toString();
  if (!stepStr.includes(".")) return 0;
  return stepStr.split(".")[1]?.length || 0;
}

/**
 * Round quantity to valid step size
 */
function roundToStepSize(quantity: number, stepSize: number, _precision: number): number {
  const factor = 1 / stepSize;
  return Math.floor(quantity * factor) / factor;
}

// ============================================================================
// Precise Timing Utilities
// ============================================================================

/**
 * Wait until optimal execution window for sniping
 *
 * @param launchTime Target launch time
 * @param config Timing configuration
 * @returns Promise that resolves when execution window starts
 */
export async function waitForExecutionWindow(
  launchTime: Date,
  config: Partial<TimingConfig> = {},
): Promise<{ startTime: Date; endTime: Date }> {
  const finalConfig = { ...DEFAULT_TIMING_CONFIG, ...config };

  const startTime = new Date(launchTime.getTime() + finalConfig.preLaunchOffsetMs);
  const endTime = new Date(launchTime.getTime() + finalConfig.postLaunchWindowMs);

  // Wait until start time
  while (Date.now() < startTime.getTime()) {
    await sleep(finalConfig.pollIntervalMs);
  }

  logger.info("Execution window opened", {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  });

  return { startTime, endTime };
}

/**
 * Check if still within execution window
 */
export function isWithinExecutionWindow(endTime: Date): boolean {
  return Date.now() < endTime.getTime();
}

// ============================================================================
// Order Spam Strategy (Advanced - Use with Caution)
// ============================================================================

export interface OrderSpamResult {
  filledOrder?: OrderResult;
  attemptedOrders: number[];
  cancelledOrders: number[];
  errors: string[];
  totalAttempts: number;
}

/**
 * Execute order spam strategy: send multiple orders, keep first fill, cancel others
 *
 * ⚠️ WARNING: Use with extreme caution!
 * - Risk of multiple fills if cancellation fails
 * - Exchange may rate limit or suspend account
 * - Only use during critical launch windows
 *
 * @param orderFn Function to place order
 * @param cancelFn Function to cancel order
 * @param endTime When to stop attempting
 * @param config Order spam configuration
 */
export async function executeOrderSpamStrategy(
  orderFn: () => Promise<MexcServiceResponse<OrderResult>>,
  cancelFn: (orderId: number) => Promise<MexcServiceResponse<unknown>>,
  endTime: Date,
  config: Partial<OrderSpamConfig> = {},
): Promise<OrderSpamResult> {
  const finalConfig = { ...DEFAULT_ORDER_SPAM_CONFIG, ...config };

  if (!finalConfig.enabled) {
    throw new Error("Order spam strategy is disabled. Enable explicitly in config.");
  }

  const attemptedOrders: number[] = [];
  const cancelledOrders: number[] = [];
  const errors: string[] = [];
  let filledOrder: OrderResult | undefined;
  let totalAttempts = 0;

  logger.warn("Order spam strategy activated - multiple orders will be placed", {
    maxConcurrentOrders: finalConfig.maxConcurrentOrders,
    burstIntervalMs: finalConfig.burstIntervalMs,
    autoCancel: finalConfig.autoCancel,
  });

  try {
    while (isWithinExecutionWindow(endTime) && !filledOrder) {
      // Safety limit check
      if (attemptedOrders.length >= finalConfig.maxConcurrentOrders) {
        logger.warn("Max concurrent orders reached, waiting for fills", {
          maxConcurrentOrders: finalConfig.maxConcurrentOrders,
          currentOrders: attemptedOrders.length,
        });
        await sleep(finalConfig.burstIntervalMs);
        continue;
      }

      totalAttempts++;

      try {
        const result = await orderFn();

        if (result.success && result.data?.orderId) {
          const orderId = result.data.orderId;
          attemptedOrders.push(orderId);

          logger.info("Order placed", {
            orderId,
            currentOrders: attemptedOrders.length,
            maxConcurrentOrders: finalConfig.maxConcurrentOrders,
          });

          // Check if filled immediately
          if (result.data.status === "FILLED") {
            filledOrder = result.data;
            logger.info("Order filled immediately", { orderId });
            break;
          }
        } else if (result.error) {
          errors.push(result.error);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }

      // Small delay between order attempts
      await sleep(finalConfig.burstIntervalMs);
    }

    // Cancel all unfilled orders if auto-cancel enabled
    if (finalConfig.autoCancel && filledOrder) {
      const ordersToCancel = attemptedOrders.length - 1;
      logger.info("Cancelling unfilled orders", {
        ordersToCancel,
        filledOrderId: filledOrder.orderId,
      });

      for (const orderId of attemptedOrders) {
        if (orderId !== filledOrder.orderId) {
          try {
            const cancelResult = await cancelFn(orderId);
            if (cancelResult.success) {
              cancelledOrders.push(orderId);
              logger.info("Order cancelled successfully", { orderId });
            } else {
              const errorMsg = `Failed to cancel order ${orderId}: ${cancelResult.error}`;
              errors.push(errorMsg);
              logger.error("Failed to cancel order", { orderId, error: cancelResult.error });
            }
          } catch (error) {
            const errorMsg = `Error cancelling order ${orderId}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
            logger.error("Error cancelling order", {
              orderId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    return {
      filledOrder,
      attemptedOrders,
      cancelledOrders,
      errors,
      totalAttempts,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      attemptedOrders,
      cancelledOrders,
      errors,
      totalAttempts,
    };
  }
}

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Sleep utility with Promise
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format execution summary for logging
 */
export function formatExecutionSummary(result: OrderSpamResult): string {
  return `
📊 Order Spam Execution Summary:
   - Total Attempts: ${result.totalAttempts}
   - Orders Placed: ${result.attemptedOrders.length}
   - Orders Cancelled: ${result.cancelledOrders.length}
   - Filled Order: ${result.filledOrder ? `#${result.filledOrder.orderId}` : "None"}
   - Errors: ${result.errors.length}
${result.errors.length > 0 ? `\n❌ Errors:\n${result.errors.map((e) => `   - ${e}`).join("\n")}` : ""}
  `.trim();
}

/**
 * Debug: Log quantity validation details
 */
export function logQuantityValidation(result: QuantityValidationResult): void {
  logger.info("Quantity validation", {
    rawQuantity: result.details.rawQuantity,
    roundedQuantity: result.details.roundedQuantity,
    precision: result.details.precision,
    stepSize: result.details.stepSize,
    minQty: result.details.minQty,
    maxQty: result.details.maxQty,
    notionalValue: result.details.notionalValue,
    minNotional: result.details.minNotional,
    isValid: result.isValid,
    warnings: result.warnings,
    errors: result.errors,
  });
}

// ============================================================================
// Exports
// ============================================================================

export default {
  executeOrderWithRetry,
  validateAndAdjustQuantity,
  waitForExecutionWindow,
  isWithinExecutionWindow,
  executeOrderSpamStrategy,
  sleep,
  formatExecutionSummary,
  logQuantityValidation,
  MEXC_ERROR_CODES,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_TIMING_CONFIG,
  DEFAULT_ORDER_SPAM_CONFIG,
};
