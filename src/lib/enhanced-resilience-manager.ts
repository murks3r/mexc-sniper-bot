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
