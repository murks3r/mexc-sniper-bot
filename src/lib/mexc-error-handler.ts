/**
 * MEXC Error Handler - Slice 4.1: Error Handling State Machine
 *
 * This implements Table 2 from the optimization plan: "Sniper Bot Foutcode Afhandeling Gids"
 *
 * The error handler categorizes MEXC API errors into:
 * - FATAL (Code): Bugs in the code that require developer intervention
 * - FATAL (Data): Invalid data (e.g., Assessment Zone tokens) that should be blacklisted
 * - FATAL (User): User configuration issues (e.g., insufficient balance)
 * - TEMPORARY: Transient issues that can be retried (rate limits, WAF, 5XX)
 * - UNKNOWN: Unknown errors that need investigation
 *
 * For each error type, the handler provides specific actions for the bot to take.
 */

import { createSimpleLogger } from "@/src/lib/unified-logger";

const logger = createSimpleLogger("MexcErrorHandler");

export type ErrorAction =
  | "STOP_AND_ALERT" // Fatal code bug - stop bot, alert developer
  | "BLACKLIST_SYMBOL" // Fatal data issue - blacklist this symbol
  | "STOP_AND_NOTIFY_USER" // Fatal user issue - notify user
  | "RETRY_WITH_BACKOFF" // Temporary issue - retry with exponential backoff
  | "CHECK_ORDER_STATUS" // Unknown state - verify order status before retrying
  | "IGNORE"; // Non-critical error

export interface ErrorHandlingResult {
  action: ErrorAction;
  category: "FATAL_CODE" | "FATAL_DATA" | "FATAL_USER" | "TEMPORARY" | "UNKNOWN";
  message: string;
  retryable: boolean;
  retryDelayMs?: number;
  maxRetries?: number;
  metadata?: Record<string, any>;
}

/**
 * Parse MEXC API error response
 */
export function parseMexcError(error: any): {
  httpCode: number | null;
  mexcCode: number | null;
  message: string;
} {
  // Try to extract error details from various formats
  if (typeof error === "object" && error !== null) {
    // Format 1: { code: 10007, msg: "bad symbol" }
    if ("code" in error && "msg" in error) {
      return {
        httpCode: null,
        mexcCode: parseInt(error.code) || null,
        message: error.msg || "Unknown error",
      };
    }

    // Format 2: { status: 400, data: { code: 10007, msg: "..." } }
    if ("status" in error && "data" in error && typeof error.data === "object") {
      return {
        httpCode: error.status,
        mexcCode: parseInt(error.data?.code) || null,
        message: error.data?.msg || error.data?.message || "Unknown error",
      };
    }

    // Format 3: HTTP Error object
    if (error instanceof Error) {
      // Try to parse "HTTP 400: {...}" format
      const match = error.message.match(/HTTP (\d+):/);
      if (match) {
        const httpCode = parseInt(match[1]);
        try {
          const jsonMatch = error.message.match(/:\s*(\{.*\})/);
          if (jsonMatch) {
            const errorData = JSON.parse(jsonMatch[1]);
            return {
              httpCode,
              mexcCode: parseInt(errorData.code) || null,
              message: errorData.msg || errorData.message || error.message,
            };
          }
        } catch (_) {
          // JSON parse failed
        }
        return {
          httpCode,
          mexcCode: null,
          message: error.message,
        };
      }
      return {
        httpCode: null,
        mexcCode: null,
        message: error.message,
      };
    }
  }

  return {
    httpCode: null,
    mexcCode: null,
    message: String(error),
  };
}

/**
 * Handle MEXC API error and determine the appropriate action
 *
 * This is the core error handling state machine (Table 2 from the optimization plan).
 */
export function handleMexcError(error: any, context?: { symbol?: string; orderId?: string }): ErrorHandlingResult {
  const parsed = parseMexcError(error);
  const { httpCode, mexcCode, message } = parsed;

  logger.error("MEXC API Error", {
    httpCode,
    mexcCode,
    message,
    context,
  });

  // HTTP 400: Client errors
  if (httpCode === 400 || (mexcCode && mexcCode >= 10000 && mexcCode < 20000)) {
    // Error 10007: "bad symbol" - Assessment Zone or invalid symbol
    if (mexcCode === 10007 || message.toLowerCase().includes("bad symbol")) {
      return {
        action: "BLACKLIST_SYMBOL",
        category: "FATAL_DATA",
        message: "Symbol is not API-tradable (Assessment Zone or does not exist)",
        retryable: false,
        metadata: {
          reason: "Assessment Zone or invalid symbol",
          mexcCode: 10007,
          symbol: context?.symbol,
        },
      };
    }

    // Error 10101: "Insufficient balance"
    if (mexcCode === 10101 || message.toLowerCase().includes("insufficient balance")) {
      return {
        action: "STOP_AND_NOTIFY_USER",
        category: "FATAL_USER",
        message: "Insufficient balance to place order",
        retryable: false,
        metadata: {
          mexcCode: 10101,
          symbol: context?.symbol,
        },
      };
    }

    // Error 30002: "The minimum transaction volume cannot be less than..."
    if (mexcCode === 30002 || message.toLowerCase().includes("minimum transaction volume")) {
      return {
        action: "STOP_AND_ALERT",
        category: "FATAL_CODE",
        message: "Precision validation failed - bug in PrecisionUtil class",
        retryable: false,
        metadata: {
          reason: "Notional value or quantity below minimum",
          mexcCode: 30002,
          symbol: context?.symbol,
          fix: "Check PrecisionUtil logic in Slice 2.1",
        },
      };
    }

    // Error 602 or 700002: "Signature verification failed"
    if (
      mexcCode === 602 ||
      mexcCode === 700002 ||
      message.toLowerCase().includes("signature") ||
      message.toLowerCase().includes("verification failed")
    ) {
      return {
        action: "STOP_AND_ALERT",
        category: "FATAL_CODE",
        message: "HMAC-SHA256 signature verification failed - bug in authentication logic",
        retryable: false,
        metadata: {
          reason: "Invalid signature",
          mexcCode: mexcCode || 602,
          symbol: context?.symbol,
          fix: "Check HMAC signature logic in Slice 3.2",
        },
      };
    }

    // Generic 400 error
    return {
      action: "STOP_AND_ALERT",
      category: "FATAL_CODE",
      message: `Client error: ${message}`,
      retryable: false,
      metadata: {
        httpCode: 400,
        mexcCode,
        message,
      },
    };
  }

  // HTTP 403: WAF Limit (Web Application Firewall)
  if (httpCode === 403) {
    return {
      action: "RETRY_WITH_BACKOFF",
      category: "TEMPORARY",
      message: "WAF limit - too many requests too fast",
      retryable: true,
      retryDelayMs: 10000, // 10 seconds
      maxRetries: 3,
      metadata: {
        httpCode: 403,
        reason: "Web Application Firewall rate limit",
      },
    };
  }

  // HTTP 429: Rate Limit
  if (httpCode === 429) {
    return {
      action: "RETRY_WITH_BACKOFF",
      category: "TEMPORARY",
      message: "Rate limit exceeded",
      retryable: true,
      retryDelayMs: 60000, // 60 seconds
      maxRetries: 3,
      metadata: {
        httpCode: 429,
        reason: "API rate limit",
      },
    };
  }

  // HTTP 5XX: Server errors
  if (httpCode && httpCode >= 500) {
    return {
      action: "CHECK_ORDER_STATUS",
      category: "UNKNOWN",
      message: "MEXC server error - order status unknown",
      retryable: false,
      metadata: {
        httpCode,
        message,
        warning: "DO NOT retry POST - check order status first",
        orderId: context?.orderId,
      },
    };
  }

  // Unknown error
  return {
    action: "STOP_AND_ALERT",
    category: "UNKNOWN",
    message: `Unknown error: ${message}`,
    retryable: false,
    metadata: {
      httpCode,
      mexcCode,
      message,
      warning: "Unhandled error type - investigate",
    },
  };
}

/**
 * Execute error handling action with exponential backoff for retries
 */
export async function executeErrorAction(
  result: ErrorHandlingResult,
  retryFn: () => Promise<any>,
  currentAttempt: number = 1,
): Promise<any> {
  if (!result.retryable || !result.retryDelayMs) {
    throw new Error(`Non-retryable error: ${result.message}`);
  }

  const maxRetries = result.maxRetries || 3;

  if (currentAttempt > maxRetries) {
    throw new Error(`Max retries (${maxRetries}) exceeded: ${result.message}`);
  }

  // Exponential backoff: delay * 2^(attempt - 1)
  const delay = result.retryDelayMs * Math.pow(2, currentAttempt - 1);

  logger.warn(`Retrying after ${delay}ms (attempt ${currentAttempt}/${maxRetries})`, {
    category: result.category,
    message: result.message,
  });

  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    return await retryFn();
  } catch (error) {
    // Handle the new error
    const newResult = handleMexcError(error);

    if (newResult.retryable) {
      return executeErrorAction(newResult, retryFn, currentAttempt + 1);
    }

    throw error;
  }
}

/**
 * Format error for logging/alerting
 */
export function formatErrorForAlert(result: ErrorHandlingResult): string {
  let alert = `🚨 MEXC Error: ${result.category}\n\n`;
  alert += `Message: ${result.message}\n`;
  alert += `Action: ${result.action}\n`;
  alert += `Retryable: ${result.retryable}\n\n`;

  if (result.metadata) {
    alert += `Metadata:\n`;
    for (const [key, value] of Object.entries(result.metadata)) {
      alert += `  ${key}: ${JSON.stringify(value)}\n`;
    }
  }

  return alert;
}
