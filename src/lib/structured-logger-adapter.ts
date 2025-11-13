/**
 * StructuredLoggerAdapter
 *
 * Wrapper around logger that ensures contextual payloads are always included:
 * - requestId, attempt, latency
 * - correlationId (auto-generated if not provided)
 * - timestamp
 * - Maintains compatibility with existing logger interface
 */

import { createSimpleLogger } from "./unified-logger";

interface LogContext {
  requestId?: string;
  attempt?: number;
  latency?: number;
  correlationId?: string;
  [key: string]: unknown;
}

interface LoggerInterface {
  info: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext, error?: Error) => void;
  warn: (message: string, context?: LogContext) => void;
  debug: (message: string, context?: LogContext) => void;
}

export class StructuredLoggerAdapter {
  private readonly baseLogger: LoggerInterface;
  private correlationIdCounter = 0;

  constructor(baseLogger?: LoggerInterface) {
    this.baseLogger = baseLogger || createSimpleLogger("structured-logger");
  }

  /**
   * Enrich context with default fields
   */
  private enrichContext(context: LogContext = {}): LogContext {
    const enriched: LogContext = {
      ...context,
      timestamp: new Date().toISOString(),
    };

    // Generate correlation ID if not provided
    if (!enriched.correlationId) {
      enriched.correlationId = this.generateCorrelationId();
    }

    return enriched;
  }

  /**
   * Generate a unique correlation ID
   */
  private generateCorrelationId(): string {
    const timestamp = Date.now();
    const counter = ++this.correlationIdCounter;
    return `corr-${timestamp}-${counter}`;
  }

  /**
   * Log info message with context
   */
  info(message: string, context: LogContext = {}): void {
    const enriched = this.enrichContext(context);
    this.baseLogger.info(message, enriched);
  }

  /**
   * Log error message with context and error object
   */
  error(message: string, context: LogContext = {}, error?: Error): void {
    const enriched = this.enrichContext({
      ...context,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
    this.baseLogger.error(message, enriched, error);
  }

  /**
   * Log warning message with context
   */
  warn(message: string, context: LogContext = {}): void {
    const enriched = this.enrichContext(context);
    this.baseLogger.warn(message, enriched);
  }

  /**
   * Log debug message with context
   */
  debug(message: string, context: LogContext = {}): void {
    const enriched = this.enrichContext(context);
    this.baseLogger.debug(message, enriched);
  }

  /**
   * Create a child logger with persistent context
   */
  child(defaultContext: LogContext): StructuredLoggerAdapter {
    const childAdapter = new StructuredLoggerAdapter(this.baseLogger);
    // Merge default context into all subsequent calls
    const originalEnrich = childAdapter.enrichContext.bind(childAdapter);
    childAdapter.enrichContext = (context: LogContext = {}) => {
      return originalEnrich({ ...defaultContext, ...context });
    };
    return childAdapter;
  }
}
