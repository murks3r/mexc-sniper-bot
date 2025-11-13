/**
 * Database Rate Limiter - Emergency Cost Prevention
 *
 * This class prevents runaway database queries that could cause quota overages
 * and financial damage. It implements strict rate limiting with automatic
 * circuit breaking when limits are exceeded.
 */

import { getLogger } from "./unified-logger";

export class DatabaseRateLimiter {
  private readonly logger = getLogger("database-rate-limiter");
  private queryCount = 0;
  private resetTime = Date.now();
  private readonly maxQueriesPerMinute: number;
  private readonly maxQueryTime: number;
  private readonly emergencyThreshold: number;

  constructor(
    options: {
      maxQueriesPerMinute?: number;
      maxQueryTimeMs?: number;
      emergencyThreshold?: number;
    } = {},
  ) {
    this.maxQueriesPerMinute = options.maxQueriesPerMinute ?? 100;
    this.maxQueryTime = options.maxQueryTimeMs ?? 10000; // 10 seconds
    this.emergencyThreshold = options.emergencyThreshold ?? 80; // 80% of limit
  }

  async executeQuery<T>(query: () => Promise<T>, operationName = "database-query"): Promise<T> {
    // Reset counter if minute has passed
    if (Date.now() - this.resetTime >= 60000) {
      this.queryCount = 0;
      this.resetTime = Date.now();
    }

    // Check if we should rate limit
    if (this.shouldRateLimit()) {
      const error = new Error(
        `Database query rate limit exceeded - preventing cost overrun. Limit: ${this.maxQueriesPerMinute}/min`,
      );
      this.logger.error("Cost protection - rate limit exceeded", {
        currentCount: this.queryCount,
        limit: this.maxQueriesPerMinute,
        operation: operationName,
        message: error.message,
      });
      throw error;
    }

    this.queryCount++;

    // Warn when approaching limit (check after incrementing)
    if (this.queryCount >= (this.maxQueriesPerMinute * this.emergencyThreshold) / 100) {
      this.logger.warn("Cost warning - approaching query limit", {
        operation: operationName,
        currentCount: this.queryCount,
        limit: this.maxQueriesPerMinute,
        remaining: this.maxQueriesPerMinute - this.queryCount,
        percentUsed: Math.round((this.queryCount / this.maxQueriesPerMinute) * 100),
      });
    }
    const startTime = Date.now();

    try {
      // Race the query against timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Query timeout: ${operationName} exceeded ${this.maxQueryTime}ms limit`),
          );
        }, this.maxQueryTime);
      });

      const result = await Promise.race([query(), timeoutPromise]);
      const queryTime = Date.now() - startTime;

      // Log slow queries that could cause cost issues
      if (queryTime > 5000) {
        this.logger.error("Cost alert - slow query detected", {
          operation: operationName,
          duration: queryTime,
          threshold: 5000,
          potentialCost: this.estimateQueryCost(queryTime),
        });
      }

      // Log query metrics for monitoring
      this.logger.debug("Query metrics", {
        operation: operationName,
        duration: queryTime,
        queryCount: this.queryCount,
        limitUsage: `${this.queryCount}/${this.maxQueriesPerMinute}`,
      });

      return result;
    } catch (error) {
      const queryTime = Date.now() - startTime;
      this.logger.error(
        "Query failed",
        {
          operation: operationName,
          duration: queryTime,
          queryCount: this.queryCount,
        },
        error instanceof Error ? error : undefined,
      );
      throw error;
    }
  }

  private shouldRateLimit(): boolean {
    return this.queryCount >= this.maxQueriesPerMinute;
  }

  private estimateQueryCost(queryTimeMs: number): string {
    // Rough cost estimation based on query time
    const costPerSecond = 0.01; // $0.01 per second of query time
    const estimatedCost = Math.ceil(queryTimeMs / 1000) * costPerSecond;
    return `$${estimatedCost.toFixed(2)}`;
  }

  /**
   * Get current rate limiting status
   */
  getStatus() {
    const timeRemaining = 60000 - (Date.now() - this.resetTime);
    return {
      queryCount: this.queryCount,
      limit: this.maxQueriesPerMinute,
      remaining: Math.max(0, this.maxQueriesPerMinute - this.queryCount),
      resetIn: Math.max(0, timeRemaining),
      percentUsed: Math.round((this.queryCount / this.maxQueriesPerMinute) * 100),
      isNearLimit: this.queryCount >= (this.maxQueriesPerMinute * this.emergencyThreshold) / 100,
    };
  }

  /**
   * Force reset the rate limiter (emergency use only)
   */
  emergencyReset(): void {
    this.logger.warn("Emergency reset - database rate limiter reset manually", {
      previousCount: this.queryCount,
    });
    this.queryCount = 0;
    this.resetTime = Date.now();
  }
}

// Global rate limiter instance
export const globalDatabaseRateLimiter = new DatabaseRateLimiter({
  maxQueriesPerMinute: parseInt(process.env.DB_MAX_QUERIES_PER_MINUTE || "100", 10),
  maxQueryTimeMs: parseInt(process.env.DB_MAX_QUERY_TIME_MS || "10000", 10),
  emergencyThreshold: parseInt(process.env.DB_EMERGENCY_THRESHOLD || "80", 10),
});

/**
 * Convenience function to execute database queries with rate limiting
 */
export async function executeWithRateLimit<T>(
  query: () => Promise<T>,
  operationName?: string,
): Promise<T> {
  return globalDatabaseRateLimiter.executeQuery(query, operationName);
}
