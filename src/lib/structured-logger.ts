/**
 * Structured Logger Wrapper
 *
 * Provides a simple API for timer and performance tracking operations.
 * This module wraps the unified logger to provide a clean interface for
 * performance monitoring across the application.
 */

import { loggerRegistry } from "./unified-logger";

/**
 * Creates a timer for performance monitoring
 * @param operation - The name of the operation being timed
 * @param component - The component name for logging context
 * @returns A timer object with an end() method that stops the timer and logs the duration
 */
export function createTimer(
  operation: string,
  component: string,
): { end: (context?: Record<string, unknown>) => number } {
  const logger = loggerRegistry.getLogger(component);
  const startTime = Date.now();

  return {
    end: (context?: Record<string, unknown>) => {
      const duration = Date.now() - startTime;
      logger.performance(operation, duration, context as any);
      return duration;
    },
  };
}

/**
 * Gets a logger instance for manual logging operations
 */
export { loggerRegistry } from "./unified-logger";
