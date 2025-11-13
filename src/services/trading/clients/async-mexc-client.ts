/**
 * AsyncMexcClient
 *
 * Wrapper around UnifiedMexcServiceV2 that provides:
 * - Parallel request dispatch via Promise.allSettled
 * - Concurrency limit enforcement
 * - Request timeout handling
 * - Structured error handling
 */

import { createSimpleLogger } from "@/src/lib/unified-logger";
import type { UnifiedMexcServiceV2 } from "@/src/services/api/unified-mexc-service-v2";

interface AsyncMexcClientConfig {
  maxConcurrentRequests: number;
  requestTimeout: number;
}

interface PendingRequest {
  promise: Promise<unknown>;
  resolve: () => void;
  timestamp: number;
}

export class AsyncMexcClient {
  private readonly logger = createSimpleLogger("async-mexc-client");
  private readonly config: AsyncMexcClientConfig;
  private readonly service: UnifiedMexcServiceV2;
  private activeRequests = 0;
  private requestQueue: PendingRequest[] = [];

  constructor(service: UnifiedMexcServiceV2, config: AsyncMexcClientConfig) {
    this.service = service;
    this.config = config;
  }

  /**
   * Execute a request with concurrency control and timeout
   */
  private async executeRequest<T>(requestFn: () => Promise<T>, requestId: string): Promise<T> {
    // Wait for available slot
    await this.waitForSlot();

    const startTime = Date.now();
    this.activeRequests++;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Request timeout after ${this.config.requestTimeout}ms`)),
          this.config.requestTimeout,
        );
      });

      const result = await Promise.race([requestFn(), timeoutPromise]);
      const latency = Date.now() - startTime;

      this.logger.debug("Request completed", {
        requestId,
        latency,
        activeRequests: this.activeRequests - 1,
      });

      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.error("Request failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        latency,
      });
      throw error;
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  /**
   * Wait for an available concurrency slot
   */
  private async waitForSlot(): Promise<void> {
    if (this.activeRequests < this.config.maxConcurrentRequests) {
      return;
    }

    return new Promise<void>((resolve) => {
      this.requestQueue.push({
        promise: Promise.resolve(),
        resolve,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Process queued requests when slots become available
   */
  private processQueue(): void {
    while (
      this.requestQueue.length > 0 &&
      this.activeRequests < this.config.maxConcurrentRequests
    ) {
      const next = this.requestQueue.shift();
      if (next) {
        next.resolve();
      }
    }
  }

  /**
   * Get ticker data for a symbol
   */
  async getTicker(symbol: string): Promise<{ price: string; symbol: string }> {
    const requestId = `ticker-${symbol}-${Date.now()}`;
    return this.executeRequest(() => this.service.getTicker(symbol), requestId);
  }

  /**
   * Place an order
   */
  async placeOrder(orderData: {
    symbol: string;
    side: "BUY" | "SELL";
    type: string;
    quantity: string;
    price?: string;
  }): Promise<{ orderId: string; status: string }> {
    const requestId = `order-${orderData.symbol}-${Date.now()}`;
    return this.executeRequest(() => this.service.placeOrder(orderData), requestId);
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<{
    balances: Array<{ asset: string; free: string; locked: string }>;
  }> {
    const requestId = `account-${Date.now()}`;
    return this.executeRequest(() => this.service.getAccountInfo(), requestId);
  }

  /**
   * Get current concurrency metrics
   */
  getMetrics(): {
    activeRequests: number;
    queuedRequests: number;
    maxConcurrent: number;
  } {
    return {
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      maxConcurrent: this.config.maxConcurrentRequests,
    };
  }
}
