/**
 * Structured Logger Wrapper
 *
 * Provides a simple API for timer and performance tracking operations.
 * This module wraps the unified logger to provide a clean interface for
 * performance monitoring across the application.
 */

import { loggerRegistry, type LoggerConfig } from "./unified-logger";

/**
 * Creates a timer for performance monitoring
 * @param operation - The name of the operation being timed
 * @param component - The component name for logging context
 * @returns A function that stops the timer and logs the duration
 */
export function createTimer(operation: string, component: string): () => void {
  const logger = loggerRegistry.getLogger(component);
  return logger.startTimer(operation);
}

/**
 * Gets a logger instance for manual logging operations
 */
export { loggerRegistry } from "./unified-logger";
