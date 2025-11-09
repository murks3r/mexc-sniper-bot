import { describe, it, expect } from "vitest";
import { ErrorClassifier, handleApiError } from "./unified-error-handler";
import { TimeoutError, NetworkError, ValidationError, AuthenticationError } from "./errors";

describe("ErrorClassifier", () => {
  describe("isTimeout", () => {
    it("should return true for TimeoutError instances", () => {
      const error = new TimeoutError("Operation timed out");
      expect(ErrorClassifier.isTimeout(error)).toBe(true);
    });

    it("should return true for AbortError", () => {
      const error = new Error("Operation aborted");
      error.name = "AbortError";
      expect(ErrorClassifier.isTimeout(error)).toBe(true);
    });

    it("should return true for messages containing 'timeout'", () => {
      const error = new Error("Request timeout occurred");
      expect(ErrorClassifier.isTimeout(error)).toBe(true);
    });

    it("should return true for messages containing 'timed out'", () => {
      const error = new Error("Connection timed out");
      expect(ErrorClassifier.isTimeout(error)).toBe(true);
    });

    it("should return false for non-timeout errors", () => {
      const error = new Error("Network error");
      expect(ErrorClassifier.isTimeout(error)).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(ErrorClassifier.isTimeout(null)).toBe(false);
      expect(ErrorClassifier.isTimeout(undefined)).toBe(false);
    });
  });

  describe("isConnection", () => {
    it("should return true for NetworkError instances", () => {
      const error = new NetworkError("Connection failed");
      expect(ErrorClassifier.isConnection(error)).toBe(true);
    });

    it("should return true for ECONNREFUSED errors", () => {
      const error = new Error("ECONNREFUSED");
      expect(ErrorClassifier.isConnection(error)).toBe(true);
    });

    it("should return true for ENOTFOUND errors", () => {
      const error = new Error("ENOTFOUND");
      expect(ErrorClassifier.isConnection(error)).toBe(true);
    });

  it("should return true for network-related messages", () => {
    const error = new Error("fetch failed");
    expect(ErrorClassifier.isConnection(error)).toBe(true);
  });

    it("should return false for non-connection errors", () => {
      const error = new Error("Validation failed");
      expect(ErrorClassifier.isConnection(error)).toBe(false);
    });
  });

  describe("isRetryable", () => {
    it("should return true for timeout errors", () => {
      const error = new TimeoutError("Operation timed out");
      expect(ErrorClassifier.isRetryable(error)).toBe(true);
    });

    it("should return true for connection errors", () => {
      const error = new NetworkError("Connection failed");
      expect(ErrorClassifier.isRetryable(error)).toBe(true);
    });

    it("should return false for other errors", () => {
      const error = new ValidationError("Invalid input");
      expect(ErrorClassifier.isRetryable(error)).toBe(false);
    });
  });

  describe("getErrorType", () => {
    it("should return 'timeout' for timeout errors", () => {
      const error = new TimeoutError("Operation timed out");
      expect(ErrorClassifier.getErrorType(error)).toBe("timeout");
    });

    it("should return 'connection' for network errors", () => {
      const error = new NetworkError("Connection failed");
      expect(ErrorClassifier.getErrorType(error)).toBe("connection");
    });

    it("should return 'auth' for authentication errors", () => {
      const error = new AuthenticationError("Not authenticated");
      expect(ErrorClassifier.getErrorType(error)).toBe("auth");
    });

    it("should return 'validation' for validation errors", () => {
      const error = new ValidationError("Invalid input");
      expect(ErrorClassifier.getErrorType(error)).toBe("validation");
    });

    it("should return 'unknown' for unknown errors", () => {
      const error = new Error("Unknown error");
      expect(ErrorClassifier.getErrorType(error)).toBe("unknown");
    });
  });
});

describe("handleApiError", () => {
  it("should handle ValidationError with 400 status", () => {
    const error = new ValidationError("Invalid input data");

    const response = handleApiError(error);

    expect(response.status).toBe(400);
    // Note: In a real test environment, we'd check the response body
    // but NextResponse creates complex objects that are hard to inspect
  });

  it("should handle AuthenticationError with 401 status", () => {
    const error = new AuthenticationError("Not authenticated");

    const response = handleApiError(error);

    expect(response.status).toBe(401);
  });

  it("should handle unknown errors with 500 status", () => {
    const error = new Error("Unexpected error");

    const response = handleApiError(error);

    expect(response.status).toBe(500);
  });

  it("should handle string errors", () => {
    const error = "String error message";

    const response = handleApiError(error);

    expect(response.status).toBe(500);
  });

  it("should handle null/undefined errors", () => {
    const response = handleApiError(null);

    expect(response.status).toBe(500);
  });
});
