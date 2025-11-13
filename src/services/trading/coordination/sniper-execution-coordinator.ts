/**
 * SniperExecutionCoordinator
 *
 * Time-based orchestration for sniper order execution:
 * - Pre/post window handling
 * - Cancellation triggers
 * - Retry fallback reuse
 * - Concurrent execution management
 */

import { StructuredLoggerAdapter } from "@/src/lib/structured-logger-adapter";
import type { AsyncMexcClient } from "@/src/services/trading/clients/async-mexc-client";

interface ExecutionWindowConfig {
  preWindowBufferMs: number;
  postWindowBufferMs: number;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
}

interface OrderData {
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  quantity: string;
  price?: string;
}

interface ExecutionResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

export class SniperExecutionCoordinator {
  private readonly logger: StructuredLoggerAdapter;
  private readonly client: AsyncMexcClient;
  private readonly config: ExecutionWindowConfig;

  constructor(client: AsyncMexcClient, config: ExecutionWindowConfig) {
    this.client = client;
    this.config = config;
    this.logger = new StructuredLoggerAdapter();
  }

  /**
   * Execute order within execution window
   */
  async executeInWindow(
    executionTime: Date,
    orderData: OrderData,
    abortSignal: AbortSignal,
    retryConfig?: RetryConfig,
  ): Promise<ExecutionResult> {
    const requestId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const correlationId = `corr-${Date.now()}`;

    this.logger.info("Execution window started", {
      requestId,
      correlationId,
      executionTime: executionTime.toISOString(),
      symbol: orderData.symbol,
    });

    try {
      // Check if execution time is too far in the past (beyond post-window buffer)
      const now = Date.now();
      const executionTimeMs = executionTime.getTime();
      const timeSinceExecution = now - executionTimeMs;

      if (timeSinceExecution > this.config.postWindowBufferMs) {
        const error = `Execution window expired: ${timeSinceExecution}ms past execution time (max: ${this.config.postWindowBufferMs}ms)`;
        this.logger.warn(error, {
          requestId,
          correlationId,
          timeSinceExecution,
          postWindowBufferMs: this.config.postWindowBufferMs,
        });
        return {
          success: false,
          error,
        };
      }

      // Calculate wait time
      const timeUntilExecution = executionTimeMs - now;
      const waitTime = Math.max(0, timeUntilExecution - this.config.preWindowBufferMs);

      // Wait until execution window (with cancellation check)
      if (waitTime > 0) {
        await this.waitWithCancellation(waitTime, abortSignal, requestId);
      }

      // Check if cancelled during wait
      if (abortSignal.aborted) {
        const error = "Execution cancelled during wait period";
        this.logger.warn(error, { requestId, correlationId });
        return {
          success: false,
          error,
        };
      }

      // Execute order with retry logic
      const result = await this.executeWithRetry(
        orderData,
        abortSignal,
        retryConfig || { maxRetries: 3, baseDelay: 1000 },
        requestId,
        correlationId,
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Execution failed", {
        requestId,
        correlationId,
        error: errorMessage,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Wait with cancellation support
   */
  private async waitWithCancellation(
    ms: number,
    abortSignal: AbortSignal,
    _requestId: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (abortSignal.aborted) {
        reject(new Error("Cancelled"));
        return;
      }

      const timeoutId = setTimeout(() => {
        abortSignal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(new Error("Cancelled"));
      };

      abortSignal.addEventListener("abort", onAbort);
    });
  }

  /**
   * Execute order with retry logic
   */
  private async executeWithRetry(
    orderData: OrderData,
    abortSignal: AbortSignal,
    retryConfig: RetryConfig,
    requestId: string,
    correlationId: string,
  ): Promise<ExecutionResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      // Check cancellation before each attempt
      if (abortSignal.aborted) {
        return {
          success: false,
          error: "Execution cancelled",
        };
      }

      try {
        const startTime = Date.now();
        const result = await this.client.placeOrder(orderData);
        const latency = Date.now() - startTime;

        this.logger.info("Order executed successfully", {
          requestId,
          correlationId,
          attempt,
          latency,
          orderId: result.orderId,
          status: result.status,
        });

        return {
          success: true,
          orderId: result.orderId,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const latency = Date.now() - Date.now(); // Will be recalculated

        this.logger.warn("Order execution attempt failed", {
          requestId,
          correlationId,
          attempt,
          error: lastError.message,
          latency,
        });

        // Don't retry on last attempt
        if (attempt < retryConfig.maxRetries) {
          const delay = retryConfig.baseDelay * 2 ** attempt; // Exponential backoff
          this.logger.debug("Retrying after delay", {
            requestId,
            correlationId,
            attempt: attempt + 1,
            delay,
          });

          await this.waitWithCancellation(delay, abortSignal, requestId);

          // Check cancellation after delay
          if (abortSignal.aborted) {
            return {
              success: false,
              error: "Execution cancelled during retry delay",
            };
          }
        }
      }
    }

    // All retries exhausted
    return {
      success: false,
      error: lastError?.message || "Execution failed after all retries",
    };
  }
}
