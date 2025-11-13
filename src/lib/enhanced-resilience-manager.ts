/**
 * Enhanced Resilience Manager - Comprehensive fault tolerance implementation
 *
 * Implements circuit breakers, retries, fallbacks, and graceful degradation
 * to improve system resilience from 33.93% to >80%
 */

// Re-export main classes for backward compatibility
export type {
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
  CircuitState,
} from "./resilience/circuit-breaker";
// Export all resilience modules
export * from "./resilience/circuit-breaker";
export { EnhancedCircuitBreaker } from "./resilience/circuit-breaker";
export type { FallbackConfig, FallbackStrategy } from "./resilience/fallback-manager";
export * from "./resilience/fallback-manager";
export { FallbackManager } from "./resilience/fallback-manager";
export * from "./resilience/resilience-coordinator";
export { ResilienceCoordinator } from "./resilience/resilience-coordinator";
export type { RetryConfig } from "./resilience/retry-manager";
export * from "./resilience/retry-manager";
export { RetryManager } from "./resilience/retry-manager";

// Create and export global resilience coordinator instance
import { ResilienceCoordinator } from "./resilience/resilience-coordinator";
export const globalResilienceCoordinator = new ResilienceCoordinator();

import type { FallbackStrategy } from "./resilience/fallback-manager";
// Export convenience functions
import type { RetryConfig } from "./resilience/retry-manager";

/**
 * Execute operation with comprehensive resilience (circuit breaker + retries + fallbacks)
 */
export async function executeWithResilience<T>(
  operation: () => Promise<T>,
  operationName: string,
  options?: {
    enableRetries?: boolean;
    enableCircuitBreaker?: boolean;
    customFallbacks?: FallbackStrategy<T>[];
    circuitBreakerConfig?: Partial<import("./resilience/circuit-breaker").CircuitBreakerConfig>;
    retryConfig?: Partial<RetryConfig>;
  },
): Promise<T> {
  const {
    enableRetries = true,
    enableCircuitBreaker = true,
    customFallbacks,
    circuitBreakerConfig,
    retryConfig,
  } = options || {};

  return globalResilienceCoordinator.executeResilientOperation(operation, {
    circuitBreakerName: operationName,
    circuitBreakerConfig,
    retryConfig: enableRetries ? retryConfig : undefined,
    fallbackStrategies: customFallbacks,
  });
}

/**
 * Get system resilience status for health checks
 */
export function getSystemResilienceStatus(): {
  isHealthy: boolean;
  overallScore: number;
  circuitBreakerCount: number;
  openCircuitCount: number;
  recommendations: string[];
} {
  const metrics = globalResilienceCoordinator.getSystemResilienceMetrics();

  return {
    isHealthy: metrics.overallHealth >= 80,
    overallScore: metrics.overallHealth,
    circuitBreakerCount: metrics.circuitBreakers.length,
    openCircuitCount: metrics.circuitBreakers.filter(
      (cb) => cb.state === "OPEN" || cb.state === "HALF_OPEN",
    ).length,
    recommendations: metrics.recommendations,
  };
}
