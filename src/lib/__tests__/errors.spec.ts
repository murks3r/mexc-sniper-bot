/**
 * Error Handling System Tests
 *
 * Comprehensive tests for all error classes, type guards, and utilities
 */

import { describe, expect, it } from "vitest";
import {
  ApplicationError,
  AuthenticationError,
  AuthorizationError,
  BusinessLogicError,
  ConfigurationError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  getErrorCode,
  getErrorMessage,
  getErrorStatusCode,
  isApplicationError,
  isAuthenticationError,
  isAuthorizationError,
  isBusinessLogicError,
  isConfigurationError,
  isConflictError,
  isDatabaseError,
  isExternalServiceError,
  isNotFoundError,
  isOperationalError,
  isRateLimitError,
  isTradingError,
  isValidationError,
  NotFoundError,
  RateLimitError,
  TradingError,
  ValidationError,
} from "../errors";

describe("ApplicationError", () => {
  it("should create error with all properties", () => {
    const error = new ApplicationError("Test error", "TEST_ERROR", 500, true, { userId: "123" });

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
    expect(error.context).toEqual({ userId: "123" });
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.name).toBe("ApplicationError");
  });

  it("should convert to JSON", () => {
    const error = new ApplicationError("Test", "TEST", 500);
    const json = error.toJSON();

    expect(json).toHaveProperty("name", "ApplicationError");
    expect(json).toHaveProperty("message", "Test");
    expect(json).toHaveProperty("code", "TEST");
    expect(json).toHaveProperty("statusCode", 500);
    expect(json).toHaveProperty("timestamp");
    expect(json).toHaveProperty("stack");
  });

  it("should have getUserMessage method", () => {
    const error = new ApplicationError("Test error", "TEST", 500);
    expect(error.getUserMessage()).toBe("Test error");
  });
});

describe("ValidationError", () => {
  it("should create validation error with field and value", () => {
    const error = new ValidationError("Invalid email", "email", "not-an-email");

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.message).toBe("Invalid email");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.field).toBe("email");
    expect(error.value).toBe("not-an-email");
  });

  it("should provide user-friendly message with field", () => {
    const error = new ValidationError("must be positive", "amount", -5);
    expect(error.getUserMessage()).toBe("Invalid value for field 'amount': must be positive");
  });

  it("should provide user-friendly message without field", () => {
    const error = new ValidationError("Invalid input");
    expect(error.getUserMessage()).toBe("Validation failed: Invalid input");
  });
});

describe("AuthenticationError", () => {
  it("should create authentication error", () => {
    const error = new AuthenticationError();

    expect(error.message).toBe("Authentication required");
    expect(error.code).toBe("AUTHENTICATION_ERROR");
    expect(error.statusCode).toBe(401);
  });

  it("should provide user-friendly message", () => {
    const error = new AuthenticationError();
    expect(error.getUserMessage()).toBe("Please log in to access this resource");
  });
});

describe("AuthorizationError", () => {
  it("should create authorization error", () => {
    const error = new AuthorizationError();

    expect(error.message).toBe("Insufficient permissions");
    expect(error.code).toBe("AUTHORIZATION_ERROR");
    expect(error.statusCode).toBe(403);
  });
});

describe("NotFoundError", () => {
  it("should create not found error with resource", () => {
    const error = new NotFoundError("User", "123");

    expect(error.message).toBe("User with ID '123' not found");
    expect(error.code).toBe("NOT_FOUND_ERROR");
    expect(error.statusCode).toBe(404);
    expect(error.resourceType).toBe("User");
    expect(error.resourceId).toBe("123");
  });

  it("should provide user-friendly message with resource type", () => {
    const error = new NotFoundError("Order", "456");
    expect(error.getUserMessage()).toBe("Order not found");
  });
});

describe("ConflictError", () => {
  it("should create conflict error", () => {
    const error = new ConflictError("Email already exists", "email");

    expect(error.message).toBe("Email already exists");
    expect(error.code).toBe("CONFLICT_ERROR");
    expect(error.statusCode).toBe(409);
    expect(error.conflictType).toBe("email");
  });
});

describe("RateLimitError", () => {
  it("should create rate limit error with retry after", () => {
    const error = new RateLimitError(60, 100);

    expect(error.message).toBe("Rate limit exceeded. Retry after 60 seconds");
    expect(error.code).toBe("RATE_LIMIT_ERROR");
    expect(error.statusCode).toBe(429);
    expect(error.retryAfter).toBe(60);
  });

  it("should provide user-friendly message with retry time", () => {
    const error = new RateLimitError(30, 100);
    expect(error.getUserMessage()).toBe(
      "Too many requests. Please wait 30 seconds before trying again.",
    );
  });
});

describe("ExternalServiceError", () => {
  it("should create external service error", () => {
    const error = new ExternalServiceError("MEXC", "Connection timeout");

    expect(error.message).toBe("External service error: MEXC - Connection timeout");
    expect(error.code).toBe("EXTERNAL_SERVICE_ERROR");
    expect(error.statusCode).toBe(502);
    expect(error.serviceName).toBe("MEXC");
  });
});

describe("DatabaseError", () => {
  it("should create database error", () => {
    const error = new DatabaseError("Connection lost", "SELECT");

    expect(error.message).toBe("Connection lost");
    expect(error.code).toBe("DATABASE_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.query).toBe("SELECT");
  });
});

describe("BusinessLogicError", () => {
  it("should create business logic error", () => {
    const error = new BusinessLogicError("Insufficient balance", "INSUFFICIENT_FUNDS");

    expect(error.message).toBe("Insufficient balance");
    expect(error.code).toBe("BUSINESS_LOGIC_ERROR");
    expect(error.statusCode).toBe(422);
    expect(error.businessRule).toBe("INSUFFICIENT_FUNDS");
  });
});

describe("TradingError", () => {
  it("should create trading error with trade details", () => {
    const error = new TradingError("Order execution failed", "BTCUSDT", "buy", 100);

    expect(error.message).toBe("Order execution failed");
    expect(error.code).toBe("BUSINESS_LOGIC_ERROR");
    expect(error.statusCode).toBe(422);
    expect(error.symbol).toBe("BTCUSDT");
    expect(error.action).toBe("buy");
    expect(error.amount).toBe(100);
  });

  it("should provide user-friendly message with trade details", () => {
    const error = new TradingError("Insufficient funds", "ETHUSDT", "buy", 50);
    expect(error.getUserMessage()).toBe("Insufficient funds");
  });
});

describe("ConfigurationError", () => {
  it("should create configuration error", () => {
    const error = new ConfigurationError("apiKey", "Missing API key");

    expect(error.message).toBe("Missing API key");
    expect(error.code).toBe("CONFIGURATION_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.configKey).toBe("apiKey");
  });
});

describe("Type Guards", () => {
  it("should identify ApplicationError", () => {
    const error = new ApplicationError("Test", "TEST", 500);
    expect(isApplicationError(error)).toBe(true);
    expect(isApplicationError(new Error("test"))).toBe(false);
    expect(isApplicationError("not an error")).toBe(false);
  });

  it("should identify ValidationError", () => {
    const error = new ValidationError("Invalid", "field");
    expect(isValidationError(error)).toBe(true);
    expect(isValidationError(new Error("test"))).toBe(false);
  });

  it("should identify AuthenticationError", () => {
    const error = new AuthenticationError();
    expect(isAuthenticationError(error)).toBe(true);
    expect(isAuthenticationError(new Error("test"))).toBe(false);
  });

  it("should identify AuthorizationError", () => {
    const error = new AuthorizationError();
    expect(isAuthorizationError(error)).toBe(true);
  });

  it("should identify NotFoundError", () => {
    const error = new NotFoundError("User", "123");
    expect(isNotFoundError(error)).toBe(true);
  });

  it("should identify ConflictError", () => {
    const error = new ConflictError("Duplicate");
    expect(isConflictError(error)).toBe(true);
  });

  it("should identify RateLimitError", () => {
    const error = new RateLimitError(60);
    expect(isRateLimitError(error)).toBe(true);
  });

  it("should identify ExternalServiceError", () => {
    const error = new ExternalServiceError("API", "timeout");
    expect(isExternalServiceError(error)).toBe(true);
  });

  it("should identify DatabaseError", () => {
    const error = new DatabaseError("Connection lost");
    expect(isDatabaseError(error)).toBe(true);
  });

  it("should identify BusinessLogicError", () => {
    const error = new BusinessLogicError("Invalid operation", "INVALID_OP");
    expect(isBusinessLogicError(error)).toBe(true);
  });

  it("should identify TradingError", () => {
    const error = new TradingError("Failed", "BTCUSDT");
    expect(isTradingError(error)).toBe(true);
  });

  it("should identify ConfigurationError", () => {
    const error = new ConfigurationError("apiKey", "Missing config");
    expect(isConfigurationError(error)).toBe(true);
  });
});

describe("Utility Functions", () => {
  describe("getErrorMessage", () => {
    it("should extract message from Error", () => {
      const error = new Error("Test error");
      expect(getErrorMessage(error)).toBe("Test error");
    });

    it("should extract message from ApplicationError", () => {
      const error = new ApplicationError("App error", "APP_ERROR", 500);
      expect(getErrorMessage(error)).toBe("App error");
    });

    it("should handle string errors", () => {
      expect(getErrorMessage("String error")).toBe("String error");
    });

    it("should handle unknown error types", () => {
      expect(getErrorMessage({ foo: "bar" })).toBe("An unknown error occurred");
      expect(getErrorMessage(null)).toBe("An unknown error occurred");
      expect(getErrorMessage(undefined)).toBe("An unknown error occurred");
    });
  });

  describe("getErrorCode", () => {
    it("should extract code from ApplicationError", () => {
      const error = new ValidationError("Invalid");
      expect(getErrorCode(error)).toBe("VALIDATION_ERROR");
    });

    it("should return UNKNOWN_ERROR for regular errors", () => {
      expect(getErrorCode(new Error("test"))).toBe("UNKNOWN_ERROR");
      expect(getErrorCode("string error")).toBe("UNKNOWN_ERROR");
    });
  });

  describe("getErrorStatusCode", () => {
    it("should extract status code from ApplicationError", () => {
      const error = new NotFoundError("User", "123");
      expect(getErrorStatusCode(error)).toBe(404);
    });

    it("should return 500 for regular errors", () => {
      expect(getErrorStatusCode(new Error("test"))).toBe(500);
      expect(getErrorStatusCode("string error")).toBe(500);
    });
  });

  describe("isOperationalError", () => {
    it("should identify operational errors", () => {
      const error = new ValidationError("Invalid");
      expect(isOperationalError(error)).toBe(true);
    });

    it("should identify non-operational errors", () => {
      const error = new ApplicationError("Test", "TEST", 500, false);
      expect(isOperationalError(error)).toBe(false);
    });

    it("should treat regular errors as non-operational", () => {
      expect(isOperationalError(new Error("test"))).toBe(false);
      expect(isOperationalError("string error")).toBe(false);
    });
  });
});
