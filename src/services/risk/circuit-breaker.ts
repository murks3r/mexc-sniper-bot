/**
 * Circuit Breaker Stub
 *
 * Stub implementation for circuit breaker pattern.
 */

export class CircuitBreaker {
  isOpen() {
    return false;
  }

  getState() {
    return "closed";
  }

  getStats() {
    return {
      failures: 0,
      successes: 0,
      state: "closed",
    };
  }

  recordSuccess() {
    // Stub
  }

  recordFailure() {
    // Stub
  }
}

export const circuitBreaker = new CircuitBreaker();

export const circuitBreakerRegistry = {
  get: (_key: string) => circuitBreaker,
  getBreaker: (_key: string) => circuitBreaker,
  create: (_key: string) => circuitBreaker,
  has: () => false,
};
