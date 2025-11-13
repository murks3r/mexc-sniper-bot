/**
 * StructuredLoggerAdapter Tests
 *
 * Ensures contextual payloads (requestId, attempt, latency) are emitted.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { StructuredLoggerAdapter } from "../structured-logger-adapter";

describe("StructuredLoggerAdapter", () => {
  let adapter: StructuredLoggerAdapter;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    adapter = new StructuredLoggerAdapter(mockLogger as any);
  });

  describe("contextual payloads", () => {
    it("should include requestId in log payload", () => {
      const requestId = "req-123";
      adapter.info("Test message", { requestId });

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Test message",
        expect.objectContaining({
          requestId,
        }),
      );
    });

    it("should include attempt number in log payload", () => {
      const attempt = 3;
      adapter.info("Retry attempt", { attempt });

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Retry attempt",
        expect.objectContaining({
          attempt,
        }),
      );
    });

    it("should include latency in log payload", () => {
      const latency = 150;
      adapter.info("Request completed", { latency });

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Request completed",
        expect.objectContaining({
          latency,
        }),
      );
    });

    it("should include multiple context fields", () => {
      const context = {
        requestId: "req-456",
        attempt: 2,
        latency: 250,
        symbol: "BTCUSDT",
      };

      adapter.info("Order executed", context);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Order executed",
        expect.objectContaining(context),
      );
    });
  });

  describe("log levels", () => {
    it("should log info messages", () => {
      adapter.info("Info message", { requestId: "req-1" });
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it("should log error messages with error object", () => {
      const error = new Error("Test error");
      adapter.error("Error occurred", { requestId: "req-2" }, error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error occurred",
        expect.objectContaining({
          requestId: "req-2",
        }),
        error,
      );
    });

    it("should log warning messages", () => {
      adapter.warn("Warning message", { requestId: "req-3" });
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });

    it("should log debug messages", () => {
      adapter.debug("Debug message", { requestId: "req-4" });
      expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    });
  });

  describe("correlation IDs", () => {
    it("should generate correlation ID when not provided", () => {
      adapter.info("Message without correlation ID");

      const context = mockLogger.info.mock.calls[0][1];
      expect(context).toHaveProperty("correlationId");
      expect(typeof context.correlationId).toBe("string");
      expect(context.correlationId.length).toBeGreaterThan(0);
    });

    it("should use provided correlation ID", () => {
      const correlationId = "corr-789";
      adapter.info("Message with correlation ID", { correlationId });

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Message with correlation ID",
        expect.objectContaining({
          correlationId,
        }),
      );
    });
  });

  describe("timestamps", () => {
    it("should include timestamp in log payload", () => {
      adapter.info("Timestamped message");

      const context = mockLogger.info.mock.calls[0][1];
      expect(context).toHaveProperty("timestamp");
      expect(typeof context.timestamp).toBe("string");
      // Should be ISO format
      expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("nested context", () => {
    it("should handle nested context objects", () => {
      const context = {
        requestId: "req-999",
        metadata: {
          userId: "user-123",
          orderType: "LIMIT",
        },
      };

      adapter.info("Nested context", context);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Nested context",
        expect.objectContaining({
          requestId: "req-999",
          metadata: {
            userId: "user-123",
            orderType: "LIMIT",
          },
        }),
      );
    });
  });
});
