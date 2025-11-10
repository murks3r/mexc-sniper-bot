/**
 * Standardized Error Handling System
 *
 * This module provides a comprehensive error class hierarchy for consistent
 * error handling across the entire codebase.
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class ApplicationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    isOperational = true,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON-serializable format
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    // Override in subclasses for custom user messages
    return this.message;
  }
}

/**
 * Validation error for input validation failures
 */
export class ValidationError extends ApplicationError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, true, { ...context, field, value });
    this.field = field;
    this.value = value;
  }

  getUserMessage(): string {
    if (this.field) {
      return `Invalid value for field '${this.field}': ${this.message}`;
    }
    return `Validation failed: ${this.message}`;
  }
}

/**
 * Authentication error for auth failures
 */
export class AuthenticationError extends ApplicationError {
  constructor(message = "Authentication required", context?: Record<string, unknown>) {
    super(message, "AUTHENTICATION_ERROR", 401, true, context);
  }

  getUserMessage(): string {
    return "Please log in to access this resource";
  }
}

/**
 * Authorization error for permission failures
 */
export class AuthorizationError extends ApplicationError {
  constructor(message = "Insufficient permissions", context?: Record<string, unknown>) {
    super(message, "AUTHORIZATION_ERROR", 403, true, context);
  }

  getUserMessage(): string {
    return "You do not have permission to perform this action";
  }
}

/**
 * API error for external API failures
 */
export class ApiError extends ApplicationError {
  public readonly apiName: string;
  public readonly apiStatusCode?: number;
  public readonly apiResponse?: unknown;

  constructor(
    message: string,
    apiName: string,
    apiStatusCode?: number,
    apiResponse?: unknown,
    context?: Record<string, unknown>,
  ) {
    super(message, "API_ERROR", apiStatusCode === 429 ? 429 : 502, true, {
      ...context,
      apiName,
      apiStatusCode,
      apiResponse,
    });
    this.apiName = apiName;
    this.apiStatusCode = apiStatusCode;
    this.apiResponse = apiResponse;
  }

  getUserMessage(): string {
    if (this.apiStatusCode === 429) {
      return "Too many requests. Please try again later.";
    }
    return `External service error: ${this.apiName} is temporarily unavailable`;
  }
}

/**
 * Rate limit error for too many requests
 */
export class RateLimitError extends ApplicationError {
  public readonly retryAfter: number;
  public readonly limit: number;

  constructor(retryAfter: number, limit: number, context?: Record<string, unknown>) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds`, "RATE_LIMIT_ERROR", 429, true, {
      ...context,
      retryAfter,
      limit,
    });
    this.retryAfter = retryAfter;
    this.limit = limit;
  }

  getUserMessage(): string {
    return `Too many requests. Please wait ${this.retryAfter} seconds before trying again.`;
  }
}

/**
 * Database error for database operations
 */
export class DatabaseError extends ApplicationError {
  public readonly query?: string;
  public readonly dbError?: Error;

  constructor(message: string, query?: string, dbError?: Error, context?: Record<string, unknown>) {
    super(
      message,
      "DATABASE_ERROR",
      500,
      false, // Database errors are not operational
      { ...context, query, dbError: dbError?.message },
    );
    this.query = query;
    this.dbError = dbError;
  }

  getUserMessage(): string {
    return "A database error occurred. Please try again later.";
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends ApplicationError {
  public readonly resourceType: string;
  public readonly resourceId?: string;

  constructor(resourceType: string, resourceId?: string, context?: Record<string, unknown>) {
    const message = resourceId
      ? `${resourceType} with ID '${resourceId}' not found`
      : `${resourceType} not found`;

    super(message, "NOT_FOUND_ERROR", 404, true, {
      ...context,
      resourceType,
      resourceId,
    });
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }

  getUserMessage(): string {
    return `${this.resourceType} not found`;
  }
}

/**
 * Conflict error for resource conflicts
 */
export class ConflictError extends ApplicationError {
  public readonly conflictType: string;

  constructor(message: string, conflictType: string, context?: Record<string, unknown>) {
    super(message, "CONFLICT_ERROR", 409, true, { ...context, conflictType });
    this.conflictType = conflictType;
  }

  getUserMessage(): string {
    return "The requested operation conflicts with the current state";
  }
}

/**
 * Business logic error for domain-specific failures
 */
export class BusinessLogicError extends ApplicationError {
  public readonly businessRule: string;

  constructor(message: string, businessRule: string, context?: Record<string, unknown>) {
    super(message, "BUSINESS_LOGIC_ERROR", 422, true, {
      ...context,
      businessRule,
    });
    this.businessRule = businessRule;
  }

  getUserMessage(): string {
    return this.message; // Business logic errors often have user-friendly messages
  }
}

/**
 * Trading error for trading-specific failures
 */
export class TradingError extends BusinessLogicError {
  public readonly symbol?: string;
  public readonly action?: "buy" | "sell";
  public readonly amount?: number;

  constructor(
    message: string,
    symbol?: string,
    action?: "buy" | "sell",
    amount?: number,
    context?: Record<string, unknown>,
  ) {
    super(message, "TRADING_ERROR", { ...context, symbol, action, amount });
    this.symbol = symbol;
    this.action = action;
    this.amount = amount;
  }
}

/**
 * Configuration error for missing or invalid configuration
 */
export class ConfigurationError extends ApplicationError {
  public readonly configKey: string;

  constructor(configKey: string, message?: string, context?: Record<string, unknown>) {
    super(
      message || `Missing or invalid configuration: ${configKey}`,
      "CONFIGURATION_ERROR",
      500,
      false, // Configuration errors are not operational
      { ...context, configKey },
    );
    this.configKey = configKey;
  }

  getUserMessage(): string {
    return "The application is not properly configured. Please contact support.";
  }
}

/**
 * Timeout error for operation timeouts
 */
export class TimeoutError extends ApplicationError {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number, context?: Record<string, unknown>) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, "TIMEOUT_ERROR", 504, true, {
      ...context,
      operation,
      timeoutMs,
    });
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }

  getUserMessage(): string {
    return "The operation took too long to complete. Please try again.";
  }
}

/**
 * Network error for connection failures
 */
export class NetworkError extends ApplicationError {
  public readonly endpoint?: string;

  constructor(message: string, endpoint?: string, context?: Record<string, unknown>) {
    super(message, "NETWORK_ERROR", 503, true, { ...context, endpoint });
    this.endpoint = endpoint;
  }

  getUserMessage(): string {
    return "Network connection error. Please check your connection and try again.";
  }
}

/**
 * Error type guards
 */
export const isApplicationError = (error: unknown): error is ApplicationError => {
  return error instanceof ApplicationError;
};

export const isValidationError = (error: unknown): error is ValidationError => {
  return error instanceof ValidationError;
};

export const isAuthenticationError = (error: unknown): error is AuthenticationError => {
  return error instanceof AuthenticationError;
};

export const isAuthorizationError = (error: unknown): error is AuthorizationError => {
  return error instanceof AuthorizationError;
};

export const isApiError = (error: unknown): error is ApiError => {
  return error instanceof ApiError;
};

export const isRateLimitError = (error: unknown): error is RateLimitError => {
  return error instanceof RateLimitError;
};

export const isDatabaseError = (error: unknown): error is DatabaseError => {
  return error instanceof DatabaseError;
};

export const isNotFoundError = (error: unknown): error is NotFoundError => {
  return error instanceof NotFoundError;
};

export const isBusinessLogicError = (error: unknown): error is BusinessLogicError => {
  return error instanceof BusinessLogicError;
};

export const isTradingError = (error: unknown): error is TradingError => {
  return error instanceof TradingError;
};

export const isNetworkError = (error: unknown): error is NetworkError => {
  return error instanceof NetworkError;
};

export const isOperationalError = (error: unknown): boolean => {
  if (isApplicationError(error)) {
    return error.isOperational;
  }
  return false;
};

/**
 * External service error (alias for ApiError for consistency)
 */
export class ExternalServiceError extends ApplicationError {
  public readonly serviceName: string;

  constructor(serviceName: string, message: string, context?: Record<string, unknown>) {
    super(
      `External service error: ${serviceName} - ${message}`,
      "EXTERNAL_SERVICE_ERROR",
      502,
      true,
      {
        ...context,
        serviceName,
      },
    );
    this.serviceName = serviceName;
  }

  getUserMessage(): string {
    return `External service ${this.serviceName} is temporarily unavailable`;
  }
}

export const isExternalServiceError = (error: unknown): error is ExternalServiceError => {
  return error instanceof ExternalServiceError;
};

export const isConflictError = (error: unknown): error is ConflictError => {
  return error instanceof ConflictError;
};

export const isConfigurationError = (error: unknown): error is ConfigurationError => {
  return error instanceof ConfigurationError;
};

/**
 * Utility functions for error handling
 */

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}

/**
 * Extract error code from error
 */
export function getErrorCode(error: unknown): string {
  if (isApplicationError(error)) {
    return error.code;
  }
  return "UNKNOWN_ERROR";
}

/**
 * Extract HTTP status code from error
 */
export function getErrorStatusCode(error: unknown): number {
  if (isApplicationError(error)) {
    return error.statusCode;
  }
  return 500;
}

/**
 * Additional utility functions from error-type-utils
 */

export interface SafeError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  [key: string]: unknown;
}

/**
 * Converts unknown error to SafeError object for logging
 */
export function toSafeError(error: unknown): SafeError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: error,
    };
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    return {
      name: typeof obj.name === "string" ? obj.name : "Error",
      message: typeof obj.message === "string" ? obj.message : String(error),
      stack: typeof obj.stack === "string" ? obj.stack : undefined,
      cause: obj.cause,
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
}

/**
 * Extracts error stack from unknown error
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.stack === "string") {
      return obj.stack;
    }
  }

  return undefined;
}

/**
 * Creates a proper Error object from unknown error
 */
export function ensureError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  const safeError = toSafeError(error);
  const newError = new Error(safeError.message);
  newError.name = safeError.name;
  if (safeError.stack) {
    newError.stack = safeError.stack;
  }
  if (safeError.cause !== undefined) {
    newError.cause = safeError.cause;
  }

  return newError;
}
