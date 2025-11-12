/**
 * Retry Mechanism with Exponential Backoff
 *
 * Implements retry logic with exponential backoff and jitter
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryCondition?: (error: any) => boolean;
}

export class RetryManager {
  private static readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => {
      if (error?.status >= 400 && error?.status < 500) return false;
      return true;
    },
  };

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
  ): Promise<T> {
    const retryConfig = { ...RetryManager.defaultConfig, ...config };
    let lastError: any;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (retryConfig.retryCondition && !retryConfig.retryCondition(error)) {
          throw error;
        }

        if (attempt === retryConfig.maxAttempts) {
          throw error;
        }

        const baseDelay = Math.min(
          retryConfig.baseDelay * retryConfig.backoffMultiplier ** (attempt - 1),
          retryConfig.maxDelay,
        );

        const delay = retryConfig.jitter ? baseDelay + Math.random() * baseDelay * 0.1 : baseDelay;

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  static calculateDelay(attempt: number, config: RetryConfig): number {
    const baseDelay = Math.min(
      config.baseDelay * config.backoffMultiplier ** (attempt - 1),
      config.maxDelay,
    );

    return config.jitter ? baseDelay + Math.random() * baseDelay * 0.1 : baseDelay;
  }
}
