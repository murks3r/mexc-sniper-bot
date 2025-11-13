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

import { AccountBalanceSchema } from "@/src/schemas/external-api-validation-schemas";
import { getUnifiedMexcService } from "@/src/services/api/unified-mexc-service-factory";
import type { UnifiedMexcClient } from "@/src/services/api/mexc-client-factory";

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
    // Missing MEXC credentials in environment
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
    const client = await getUnifiedMexcService({ userId: userId || "" });
    // MEXC client created
    return { client };
  } catch (serviceError) {
    // Failed to create MEXC service
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

async function initializeBalanceRequest(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  // Validate userId format if provided
  const userIdValidation = await validateUserId(userId);
  if (userIdValidation) {
    return { error: userIdValidation };
  }

  const hasUserCredentials = !!userId;
  const credentialsType = hasUserCredentials ? "user-specific" : "environment-fallback";

  return { userId, hasUserCredentials, credentialsType };
}

async function setupMexcClient(
  userId: string | null,
  hasUserCredentials: boolean,
  credentialsType: string,
) {
  // Check if credentials are available before proceeding
  const credentialsValidation = await validateCredentials(hasUserCredentials, credentialsType);
  if (credentialsValidation) {
    return { error: credentialsValidation };
  }

  // Get MEXC account balances using appropriate credentials
  const clientResult = await createMexcClient(userId, hasUserCredentials, credentialsType);
  if (!("client" in clientResult)) {
    return { error: clientResult };
  }

  return { client: clientResult.client };
}

async function fetchBalanceData(mexcClient: UnifiedMexcClient) {
  // Add timeout to prevent hanging requests
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Request timeout: MEXC API call took too long")), 15000);
  });

  // Enhanced MEXC API call with proper error handling and monitoring
  const rawResponse = await executeWithRateLimit(async () => {
    return executeWithCircuitBreaker(async () => {
      const balanceResponse = (await Promise.race([
        mexcClient.getAccountBalances(),
        timeoutPromise,
      ])) as Awaited<ReturnType<typeof mexcClient.getAccountBalances>>;

      return balanceResponse;
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
    throw new Error(
      `MEXC API response validation failed: ${JSON.stringify(validationResult.error)}`,
    );
  }

  return rawResponse as z.infer<typeof responseSchema>;
}

function handleMexcError(mexcError: unknown, hasUserCredentials: boolean, credentialsType: string) {
  const errorMessage = mexcError instanceof Error ? mexcError.message : "Unknown MEXC API error";

  // Handle specific MEXC errors with appropriate status codes
  let statusCode = 500;
  let errorCode = "MEXC_API_ERROR";

  const errorMappings = [
    {
      patterns: ["Signature for this request is not valid", "signature", "700002"],
      status: 401,
      code: "MEXC_SIGNATURE_ERROR",
    },
    {
      patterns: ["Api key info invalid", "10072", "unauthorized"],
      status: 401,
      code: "MEXC_AUTH_ERROR",
    },
    {
      patterns: ["rate limit", "too many requests"],
      status: 429,
      code: "MEXC_RATE_LIMIT",
    },
    {
      patterns: ["timeout"],
      status: 504,
      code: "REQUEST_TIMEOUT",
    },
  ];

  for (const mapping of errorMappings) {
    if (mapping.patterns.some((pattern) => errorMessage.includes(pattern))) {
      statusCode = mapping.status;
      errorCode = mapping.code;
      break;
    }
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

function createSuccessResponse(
  balanceData: {
    balances: z.infer<typeof AccountBalanceSchema>[];
    totalUsdtValue: number;
    lastUpdated: string;
  },
  hasUserCredentials: boolean,
  credentialsType: string,
  startTime: number,
) {
  return NextResponse.json({
    success: true,
    data: {
      ...balanceData,
      hasUserCredentials,
      credentialsType,
    },
    metadata: {
      requestDuration: `${Date.now() - startTime}ms`,
      balanceCount: balanceData.balances.length,
      credentialSource: hasUserCredentials ? "user-database" : "environment",
      apiVersion: "v1",
      timestamp: new Date().toISOString(),
    },
  });
}

function createBalanceErrorResponse(
  balanceResponse: { error?: string; success?: boolean },
  hasUserCredentials: boolean,
  credentialsType: string,
) {
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

async function balanceHandler(request: NextRequest): Promise<NextResponse> {
  try {
    // Initialize request parameters
    const initResult = await initializeBalanceRequest(request);
    if ("error" in initResult) {
      return NextResponse.json(initResult.error.data, { status: initResult.error.status });
    }

    const { userId, hasUserCredentials, credentialsType } = initResult;

    // Setup MEXC client
    const clientResult = await setupMexcClient(userId, hasUserCredentials, credentialsType);
    if ("error" in clientResult) {
      return NextResponse.json(clientResult.error.data, { status: clientResult.error.status });
    }

    const mexcClient = clientResult.client;
    const startTime = Date.now();

    // Fetch balance data
    let balanceResponse: Awaited<ReturnType<typeof fetchBalanceData>>;
    try {
      balanceResponse = await fetchBalanceData(mexcClient);
    } catch (mexcError) {
      return handleMexcError(mexcError, hasUserCredentials, credentialsType);
    }

    // Handle balance response
    if (!balanceResponse.success) {
      return createBalanceErrorResponse(balanceResponse, hasUserCredentials, credentialsType);
    }

    // Success case
    return createSuccessResponse(
      balanceResponse.data,
      hasUserCredentials,
      credentialsType,
      startTime,
    );
  } catch (error) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const hasUserCredentials = !!userId;
    const credentialsType = hasUserCredentials ? "user-specific" : "environment-fallback";

    const errorResponse = createErrorResponse(error, hasUserCredentials, credentialsType);
    return NextResponse.json(errorResponse.data, { status: errorResponse.status });
  }
}

// Export the handler wrapped with database query caching
export const GET = withDatabaseQueryCache(balanceHandler, {
  endpoint: "/api/account/balance",
  cacheTtlSeconds: 60, // 1 minute cache
  enableCompression: true,
  enableStaleWhileRevalidate: false, // Financial data needs to be fresh
});
