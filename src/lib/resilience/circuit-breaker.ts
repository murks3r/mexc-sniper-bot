/**
 * Circuit Breaker Implementation
 *
 * Core circuit breaker pattern implementation for fault tolerance
 */

import { EventEmitter } from "node:events";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerMetrics {
  successCount: number;
  failureCount: number;
  totalRequests: number;
  successRate: number;
  averageResponseTime: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

export class EnhancedCircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttempt?: number;
  private responseTimes: number[] = [];
  private readonly config: CircuitBreakerConfig;

  constructor(
    private readonly name: string,
    config: Partial<CircuitBreakerConfig> = {},
  ) {
    super();
    this.config = {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000,
      resetTimeout: 60000,
      monitoringPeriod: 300000,
      ...config,
    };

    this.startMonitoring();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.shouldReject()) {
      const error = new Error(`Circuit breaker [${this.name}] is OPEN`);
      this.emit("request-rejected", { name: this.name, state: this.state });
      throw error;
    }

    const startTime = Date.now();

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Operation timeout")), this.config.timeout);
        }),
      ]);

      this.onSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldReject(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitState.OPEN:
        if (this.nextAttempt && now >= this.nextAttempt) {
          this.state = CircuitState.HALF_OPEN;
          this.emit("state-change", {
            name: this.name,
            from: CircuitState.OPEN,
            to: CircuitState.HALF_OPEN,
          });
          return false;
        }
        return true;

      case CircuitState.HALF_OPEN:
        return false;

      case CircuitState.CLOSED:
        return false;

      default:
        return false;
    }
  }

  private onSuccess(responseTime: number): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();
    this.responseTimes.push(responseTime);

    if (this.responseTimes.length > 100) {
      this.responseTimes = this.responseTimes.slice(-50);
    }

    switch (this.state) {
      case CircuitState.HALF_OPEN:
        if (this.successCount >= this.config.successThreshold) {
          this.state = CircuitState.CLOSED;
          this.failureCount = 0;
          this.emit("state-change", {
            name: this.name,
            from: CircuitState.HALF_OPEN,
            to: CircuitState.CLOSED,
          });
        }
        break;

      case CircuitState.CLOSED:
        this.failureCount = Math.max(0, this.failureCount - 1);
        break;
    }

    this.emit("success", {
      name: this.name,
      responseTime,
      successCount: this.successCount,
    });
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    switch (this.state) {
      case CircuitState.CLOSED:
        if (this.failureCount >= this.config.failureThreshold) {
          this.state = CircuitState.OPEN;
          this.nextAttempt = Date.now() + this.config.resetTimeout;
          this.emit("state-change", {
            name: this.name,
            from: CircuitState.CLOSED,
            to: CircuitState.OPEN,
          });
        }
        break;

      case CircuitState.HALF_OPEN:
        this.state = CircuitState.OPEN;
        this.nextAttempt = Date.now() + this.config.resetTimeout;
        this.emit("state-change", {
          name: this.name,
          from: CircuitState.HALF_OPEN,
          to: CircuitState.OPEN,
        });
        break;
    }

    this.emit("failure", { name: this.name, failureCount: this.failureCount });
  }

  private startMonitoring(): void {
    setInterval(() => {
      const metrics = this.getMetrics();
      this.emit("metrics", { name: this.name, metrics });

      if (Date.now() - (this.lastFailureTime || 0) > this.config.monitoringPeriod) {
        this.resetMetrics();
      }
    }, 30000);
  }

  private resetMetrics(): void {
    this.successCount = 0;
    this.failureCount = 0;
    this.responseTimes = [];
  }

  getMetrics(): CircuitBreakerMetrics {
    const totalRequests = this.successCount + this.failureCount;
    const successRate = totalRequests > 0 ? this.successCount / totalRequests : 0;
    const averageResponseTime =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
        : 0;

    return {
      successCount: this.successCount,
      failureCount: this.failureCount,
      totalRequests,
      successRate,
      averageResponseTime,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  getState(): CircuitState {
    return this.state;
  }

  getName(): string {
    return this.name;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.resetMetrics();
    this.nextAttempt = undefined;
    this.emit("reset", { name: this.name });
  }
}
