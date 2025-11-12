/**
 * Resilience Coordinator
 *
 * Orchestrates circuit breakers, retries, and fallbacks
 */

import { createSimpleLogger } from "../unified-logger";
import {
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  CircuitState,
  EnhancedCircuitBreaker,
} from "./circuit-breaker";
import { FallbackManager, type FallbackStrategy } from "./fallback-manager";
import { type RetryConfig, RetryManager } from "./retry-manager";

export class ResilienceCoordinator {
  private circuitBreakers = new Map<string, EnhancedCircuitBreaker>();
  private metrics = new Map<string, any>();
  private logger = createSimpleLogger("ResilienceCoordinator");

  getOrCreateCircuitBreaker(
    name: string,
    config?: Partial<CircuitBreakerConfig>,
  ): EnhancedCircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      const circuitBreaker = new EnhancedCircuitBreaker(name, config);

      circuitBreaker.on("state-change", (event) => {
        this.logger.info("Circuit breaker state changed", {
          name: event.name,
          from: event.from,
          to: event.to,
        });
      });

      circuitBreaker.on("metrics", (event) => {
        this.metrics.set(event.name, event.metrics);
      });

      this.circuitBreakers.set(name, circuitBreaker);
    }

    return this.circuitBreakers.get(name)!;
  }

  async executeResilientOperation<T>(
    operation: () => Promise<T>,
    options: {
      circuitBreakerName: string;
      circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
      retryConfig?: Partial<RetryConfig>;
      fallbackStrategies?: FallbackStrategy<T>[];
      enableCaching?: boolean;
      cacheKey?: string;
    },
  ): Promise<T> {
    const circuitBreaker = this.getOrCreateCircuitBreaker(
      options.circuitBreakerName,
      options.circuitBreakerConfig,
    );

    const resilientOperation = async () => {
      return await circuitBreaker.execute(operation);
    };

    const operationWithRetry = async () => {
      return await RetryManager.executeWithRetry(resilientOperation, options.retryConfig);
    };

    if (options.fallbackStrategies && options.fallbackStrategies.length > 0) {
      return await FallbackManager.executeWithFallback(operationWithRetry, {
        strategies: options.fallbackStrategies,
        timeout: options.circuitBreakerConfig?.timeout || 30000,
        enableCaching: options.enableCaching || false,
        cacheKey: options.cacheKey,
      });
    }

    return await operationWithRetry();
  }

  getSystemResilienceMetrics(): {
    circuitBreakers: Array<{
      name: string;
      state: CircuitState;
      metrics: CircuitBreakerMetrics;
    }>;
    overallHealth: number;
    recommendations: string[];
  } {
    const circuitBreakerMetrics = Array.from(this.circuitBreakers.entries()).map(([name, cb]) => ({
      name,
      state: cb.getState(),
      metrics: cb.getMetrics(),
    }));

    const totalCbs = circuitBreakerMetrics.length;
    if (totalCbs === 0) {
      return {
        circuitBreakers: [],
        overallHealth: 100,
        recommendations: [],
      };
    }

    const healthyCount = circuitBreakerMetrics.filter(
      (cb) => cb.state === CircuitState.CLOSED,
    ).length;
    const avgSuccessRate =
      circuitBreakerMetrics.reduce((sum, cb) => sum + cb.metrics.successRate, 0) / totalCbs;
    const overallHealth = (healthyCount / totalCbs) * 0.6 + (avgSuccessRate / 100) * 0.4;

    const recommendations: string[] = [];
    const openCircuits = circuitBreakerMetrics.filter((cb) => cb.state === CircuitState.OPEN);
    const degradedCircuits = circuitBreakerMetrics.filter((cb) => cb.metrics.successRate < 90);

    if (openCircuits.length > 0) {
      recommendations.push(
        `${openCircuits.length} circuit breaker(s) are OPEN: ${openCircuits.map((cb) => cb.name).join(", ")}`,
      );
    }

    if (degradedCircuits.length > 0) {
      recommendations.push(`${degradedCircuits.length} circuit breaker(s) have low success rates`);
    }

    if (overallHealth < 0.8) {
      recommendations.push(
        "Overall system resilience is below 80% - consider implementing additional fallback strategies",
      );
    }

    return {
      circuitBreakers: circuitBreakerMetrics,
      overallHealth,
      recommendations,
    };
  }

  resetAllCircuitBreakers(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
    this.logger.info("All circuit breakers have been reset");
  }

  getCircuitBreakerNames(): string[] {
    return Array.from(this.circuitBreakers.keys());
  }
}
