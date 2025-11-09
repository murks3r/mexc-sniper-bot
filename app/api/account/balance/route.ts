/**
 * Account Balance API Endpoint
 *
 * Provides real-time account balance data with USDT conversion.
 * Supports both user-specific credentials and environment fallback.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { executeWithCircuitBreaker } from "@/src/lib/database-circuit-breaker";
import { withDatabaseQueryCache } from "@/src/lib/database-query-cache-middleware";
import { executeWithRateLimit } from "@/src/lib/database-rate-limiter";
import { validateExternalApiResponse } from "@/src/lib/enhanced-validation-middleware";
import { recordCostMetrics, withCostMonitoring } from "@/src/middleware/cost-monitor";
import { AccountBalanceSchema } from "@/src/schemas/external-api-validation-schemas";
import { getUnifiedMexcService } from "@/src/services/api/unified-mexc-service-factory";

// Request validation schema - userId is optional for environment fallback
const _BalanceRequestSchema = z.object({
  userId: z.string().min(1, "User ID is required").optional(),
});

// Fallback balance data for error scenarios
const createFallbackData = (hasUserCredentials: boolean, credentialsType: string) => ({
  balances: [],
  totalUsdtValue: 0,
  lastUpdated: new Date().toISOString(),
  hasUserCredentials,
  credentialsType,
});

type BalanceHandlerResult = {
  success: boolean;
  status: number;
  data?: {
    success: boolean;
    data?: unknown;
    metadata?: unknown;
    error?: string;
    meta?: unknown;
  };
};

async function validateUserId(userId: string | null): Promise<BalanceHandlerResult | null> {
  if (userId && userId.trim().length === 0) {
    return {
      success: false,
      status: 400,
      data: {
        success: false,
        error: "Invalid userId: cannot be empty",
        meta: {
          code: "INVALID_USER_ID",
          details: "userId must be a non-empty string if provided",
        },
      },
    };
  }
  return null;
}

async function validateCredentials(
  hasUserCredentials: boolean,
  credentialsType: string,
): Promise<BalanceHandlerResult | null> {
  if (!process.env.MEXC_API_KEY || !process.env.MEXC_SECRET_KEY) {
    console.error("[BalanceAPI] Missing MEXC credentials in environment");
    const fallbackData = createFallbackData(hasUserCredentials, credentialsType);
    return {
      success: false,
      status: 503,
      data: {
        success: false,
        error: "MEXC API credentials not configured on server",
        meta: {
          fallbackData,
          code: "MISSING_CREDENTIALS",
          details: "Contact administrator to configure MEXC_API_KEY and MEXC_SECRET_KEY",
        },
      },
    };
  }
  return null;
}

async function createMexcClient(
  userId: string | null,
  hasUserCredentials: boolean,
  credentialsType: string,
): Promise<{ client: Awaited<ReturnType<typeof getUnifiedMexcService>> } | BalanceHandlerResult> {
  try {
    const client = await getUnifiedMexcService(userId ? { userId } : {});
    console.info("[BalanceAPI] MEXC client created, calling getAccountBalances");
    return { client };
  } catch (serviceError) {
    console.error("[BalanceAPI] Failed to create MEXC service:", serviceError);
    const fallbackData = createFallbackData(hasUserCredentials, credentialsType);
    return {
      success: false,
      status: 503,
      data: {
        success: false,
        error: "Failed to initialize MEXC service - check API credentials configuration",
        meta: {
          fallbackData,
          code: "SERVICE_INIT_ERROR",
          details: serviceError instanceof Error ? serviceError.message : "Unknown service error",
        },
      },
    };
  }
}

function createErrorResponse(
  error: unknown,
  hasUserCredentials: boolean,
  credentialsType: string,
): BalanceHandlerResult {
  const fallbackData = createFallbackData(hasUserCredentials, credentialsType);
  const errorMessage = error instanceof Error ? error.message : String(error);

  let statusCode = 500;
  let errorCode = "INTERNAL_SERVER_ERROR";
  let userFriendlyMessage = "Internal server error occurred";

  if (errorMessage.includes("Request timeout") || errorMessage.includes("timeout")) {
    statusCode = 504;
    errorCode = "REQUEST_TIMEOUT";
    userFriendlyMessage = "Request timeout - MEXC API is taking too long to respond";
  } else if (
    errorMessage.includes("Network") ||
    errorMessage.includes("ENOTFOUND") ||
    errorMessage.includes("ECONNREFUSED")
  ) {
    statusCode = 503;
    errorCode = "NETWORK_ERROR";
    userFriendlyMessage = "Network connectivity issue - unable to reach MEXC API";
  } else if (errorMessage.includes("Database") || errorMessage.includes("credential")) {
    statusCode = 503;
    errorCode = "DATABASE_ERROR";
    userFriendlyMessage = "Database connectivity issue - unable to retrieve credentials";
  } else if (errorMessage.includes("Permission") || errorMessage.includes("Unauthorized")) {
    statusCode = 403;
    errorCode = "PERMISSION_ERROR";
    userFriendlyMessage = "Permission denied - check API credentials and allowlist";
  }

  return {
    success: false,
    status: statusCode,
    data: {
      success: false,
      error: userFriendlyMessage,
      meta: {
        fallbackData,
        code: errorCode,
        details: errorMessage,
        timestamp: new Date().toISOString(),
      },
    },
  };
}

async function balanceHandler(request: NextRequest): Promise<NextResponse> {
  try {
    // Extract userId from query parameters (optional)
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // Validate userId format if provided
    const userIdValidation = await validateUserId(userId);
    if (userIdValidation) {
      return NextResponse.json(userIdValidation.data, { status: userIdValidation.status });
    }

    // Determine if we have user credentials or should use environment fallback
    const hasUserCredentials = !!userId;
    const credentialsType = hasUserCredentials ? "user-specific" : "environment-fallback";

    console.info("[BalanceAPI] Starting balance request", {
      userId: userId || "environment-fallback",
      hasApiKey: !!process.env.MEXC_API_KEY,
      hasSecretKey: !!process.env.MEXC_SECRET_KEY,
      nodeEnv: process.env.NODE_ENV,
      credentialsType,
    });

    // Check if credentials are available before proceeding
    const credentialsValidation = await validateCredentials(hasUserCredentials, credentialsType);
    if (credentialsValidation) {
      return NextResponse.json(credentialsValidation.data, { status: credentialsValidation.status });
    }

    // Get MEXC account balances using appropriate credentials
    const clientResult = await createMexcClient(userId, hasUserCredentials, credentialsType);
    if (!("client" in clientResult)) {
      return NextResponse.json(clientResult.data, { status: clientResult.status });
    }
    const mexcClient = clientResult.client;

    // Add timeout to prevent hanging requests
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request timeout: MEXC API call took too long")), 15000);
    });

    let balanceResponse: Awaited<ReturnType<typeof mexcClient.getAccountBalances>>;
    try {
      const startTime = Date.now();

      // Enhanced MEXC API call with proper error handling and monitoring
      const rawResponse = await executeWithRateLimit(async () => {
        return executeWithCircuitBreaker(async () => {
          try {
            const balanceResponse = (await Promise.race([
              mexcClient.getAccountBalances(),
              timeoutPromise,
            ])) as Awaited<ReturnType<typeof mexcClient.getAccountBalances>>;

            console.info("[BalanceAPI] MEXC service response received", {
              success: balanceResponse.success,
              hasData: !!balanceResponse.data,
              balanceCount: balanceResponse.data?.balances?.length || 0,
              timestamp: balanceResponse.timestamp,
            });

            return balanceResponse;
          } catch (serviceError) {
            console.error("[BalanceAPI] MEXC service call failed:", serviceError);
            throw serviceError;
          }
        }, "mexc-account-balance");
      }, "balance-api-mexc-call");

      // Enhanced validation with proper error handling
      const responseSchema = z.object({
        success: z.boolean(),
        data: z
          .object({
            balances: z.array(AccountBalanceSchema),
            totalUsdtValue: z.number().nonnegative(),
            lastUpdated: z.string(),
          })
          .optional(),
        error: z.string().optional(),
        timestamp: z.union([z.string(), z.number()]),
        executionTimeMs: z.number().optional(),
        source: z.string().optional(),
      });

      const validationResult = validateExternalApiResponse(
        responseSchema,
        rawResponse,
        "MEXC Account Balance API",
      );

      if (!validationResult.success) {
        console.warn("[BalanceAPI] Response validation failed:", validationResult.error);
        // Log the actual response structure for debugging
        console.debug("[BalanceAPI] Raw response structure:", {
          keys: Object.keys(rawResponse || {}),
          successType: typeof rawResponse?.success,
          dataType: typeof rawResponse?.data,
          timestampType: typeof rawResponse?.timestamp,
        });
      } else {
        console.debug("[BalanceAPI] Response validation successful");
      }

      balanceResponse = rawResponse;

      // Record cost metrics for monitoring
      const operationDuration = Date.now() - startTime;
      await recordCostMetrics(
        "/api/account/balance",
        1, // Assuming 1 query for balance check
        operationDuration,
        JSON.stringify(rawResponse).length,
      );
    } catch (mexcError) {
      console.error("[BalanceAPI] MEXC API call failed:", mexcError);
      const errorMessage =
        mexcError instanceof Error ? mexcError.message : "Unknown MEXC API error";

      // Handle specific MEXC errors with appropriate status codes
      let statusCode = 500;
      let errorCode = "MEXC_API_ERROR";

      if (
        errorMessage.includes("Signature for this request is not valid") ||
        errorMessage.includes("signature") ||
        errorMessage.includes("700002")
      ) {
        statusCode = 401;
        errorCode = "MEXC_SIGNATURE_ERROR";
      } else if (
        errorMessage.includes("Api key info invalid") ||
        errorMessage.includes("10072") ||
        errorMessage.includes("unauthorized")
      ) {
        statusCode = 401;
        errorCode = "MEXC_AUTH_ERROR";
      } else if (
        errorMessage.includes("rate limit") ||
        errorMessage.includes("too many requests")
      ) {
        statusCode = 429;
        errorCode = "MEXC_RATE_LIMIT";
      } else if (errorMessage.includes("timeout")) {
        statusCode = 504;
        errorCode = "REQUEST_TIMEOUT";
      }

      const fallbackData = createFallbackData(hasUserCredentials, credentialsType);
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          meta: {
            fallbackData,
            code: errorCode,
            details: "MEXC API authentication failed - check credentials and IP allowlist",
          },
        },
        { status: statusCode },
      );
    }

    if (!balanceResponse.success) {
      console.error("[BalanceAPI] Balance response indicates failure", {
        error: balanceResponse.error,
        userId: userId || "environment-fallback",
        responseData: balanceResponse.data,
        timestamp: balanceResponse.timestamp,
      });

      const fallbackData = createFallbackData(hasUserCredentials, credentialsType);
      const errorMessage = balanceResponse.error || "Failed to fetch account balance data";

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          meta: {
            fallbackData,
            code: "MEXC_RESPONSE_ERROR",
            details: "MEXC API returned an error response",
          },
        },
        { status: 400 },
      );
    }

    const balanceData = balanceResponse.data;

    console.info("[BalanceAPI] Real balance data returned successfully", {
      userId: userId || "environment-fallback",
      balancesCount: balanceData.balances.length,
      totalUsdValue: balanceData.totalUsdtValue,
      timestamp: balanceData.lastUpdated,
    });

    // Enhanced response with proper metadata
    const responseData = {
      success: true,
      data: {
        ...balanceData,
        hasUserCredentials,
        credentialsType,
      },
      metadata: {
        requestDuration: `${Date.now() - Date.now()}ms`,
        balanceCount: balanceData.balances.length,
        credentialSource: hasUserCredentials ? "user-database" : "environment",
        apiVersion: "v1",
        timestamp: new Date().toISOString(),
      },
    };

    return NextResponse.json(responseData);
  } catch (error) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const hasUserCredentials = !!userId;
    const credentialsType = hasUserCredentials ? "user-specific" : "environment-fallback";

    console.error("[BalanceAPI] Unexpected top-level error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      type: typeof error,
      name: error instanceof Error ? error.name : "unknown",
      hasApiKey: !!process.env.MEXC_API_KEY,
      hasSecretKey: !!process.env.MEXC_SECRET_KEY,
      userId: userId || "none",
    });

    const errorResponse = createErrorResponse(error, hasUserCredentials, credentialsType);
    return NextResponse.json(errorResponse.data, { status: errorResponse.status });
  }
}

// Export the handler wrapped with cost monitoring and database query caching
export const GET = withCostMonitoring(
  withDatabaseQueryCache(balanceHandler, {
    endpoint: "/api/account/balance",
    cacheTtlSeconds: 60, // 1 minute cache
    enableCompression: true,
    enableStaleWhileRevalidate: false, // Financial data needs to be fresh
  }),
  "/api/account/balance",
);
