/**
 * Connectivity Health Check API
 *
 * Provides lightweight connectivity monitoring with fast response times
 * for real-time health monitoring and dashboard updates.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/supabase-auth";
import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";
import { getUserCredentials } from "@/src/services/api/user-credentials-service";

export const dynamic = "force-dynamic";

interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    network: {
      status: "pass" | "fail";
      latency?: number;
      error?: string;
    };
    authentication: {
      status: "pass" | "fail" | "skip";
      hasCredentials: boolean;
      source?: "database" | "environment" | "none";
      error?: string;
    };
    api: {
      status: "pass" | "fail" | "skip";
      latency?: number;
      error?: string;
    };
  };
  metadata: {
    retryCount: number;
    overallLatency: number;
    healthScore: number;
  };
}

interface CredentialInfo {
  userCredentials: any;
  hasCredentials: boolean;
  credentialSource: "database" | "environment" | "none";
  userId: string | null;
}

async function getUserCredentialInfo(): Promise<CredentialInfo> {
  // Get user credentials
  let user: Awaited<ReturnType<typeof requireAuth>> | null = null;
  let userId: string | null = null;
  try {
    user = await requireAuth();
    userId = user?.id ?? null;
  } catch (_error) {
    // Continue without user for anonymous health check
    user = null;
    userId = null;
  }

  let userCredentials = null;
  let hasCredentials = false;
  let credentialSource: "database" | "environment" | "none" = "none";

  // Check for user credentials
  if (userId) {
    try {
      userCredentials = await getUserCredentials(userId, "mexc");
      hasCredentials = !!userCredentials;
      if (hasCredentials) {
        credentialSource = "database";
      }
    } catch (_error) {
      // Failed to retrieve user credentials - error logging handled by error handler middleware
    }
  }

  return { userCredentials, hasCredentials, credentialSource, userId };
}

async function checkEnvironmentCredentials(): Promise<{
  envCredentials: any;
  hasEnvCredentials: boolean;
}> {
  // Check for environment credentials if no user credentials
  const envApiKey = process.env.MEXC_API_KEY;
  const envSecretKey = process.env.MEXC_SECRET_KEY;
  const hasEnvCredentials = !!(envApiKey && envSecretKey);

  let envCredentials = null;
  if (hasEnvCredentials) {
    envCredentials = { apiKey: envApiKey, secretKey: envSecretKey };
  }

  return { envCredentials, hasEnvCredentials };
}

function createHealthResponse(): HealthCheckResponse {
  return {
    status: "unhealthy",
    timestamp: new Date().toISOString(),
    checks: {
      network: { status: "fail" },
      authentication: { status: "skip", hasCredentials: false },
      api: { status: "skip" },
    },
    metadata: {
      retryCount: 0,
      overallLatency: 0,
      healthScore: 0,
    },
  };
}

async function performNetworkTest(credentials: any): Promise<{
  success: boolean;
  latency: number;
  error?: string;
  retryCount: number;
}> {
  const maxRetries = 2;
  let networkSuccess = false;
  let networkLatency = 0;
  let lastNetworkError: string | undefined;
  let retryCount = 0;

  for (let attempt = 0; attempt < maxRetries && !networkSuccess; attempt++) {
    const attemptStart = Date.now();
    retryCount = attempt;

    try {
      const mexcService = getRecommendedMexcService(credentials || undefined);
      const connectivityResult = await mexcService.testConnectivity();

      networkLatency = Date.now() - attemptStart;

      if (typeof connectivityResult === "boolean") {
        networkSuccess = connectivityResult;
      } else {
        networkSuccess = connectivityResult?.success === true;
      }

      if (networkSuccess) {
        break;
      } else {
        lastNetworkError = connectivityResult?.error || "Network test failed";
      }
    } catch (error) {
      networkLatency = Date.now() - attemptStart;
      lastNetworkError = error instanceof Error ? error.message : "Unknown error";

      // Wait before retry (except on last attempt)
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  return {
    success: networkSuccess,
    latency: networkLatency,
    error: lastNetworkError,
    retryCount,
  };
}

async function performApiTest(credentials: any): Promise<{
  success: boolean;
  latency: number;
  error?: string;
}> {
  const apiStart = Date.now();

  try {
    const mexcService = getRecommendedMexcService(credentials || undefined);
    const accountResult = await mexcService.getAccountBalances();

    const apiLatency = Date.now() - apiStart;

    if (accountResult.success) {
      return { success: true, latency: apiLatency };
    } else {
      return {
        success: false,
        latency: apiLatency,
        error: accountResult.error || "API test failed",
      };
    }
  } catch (error) {
    const apiLatency = Date.now() - apiStart;
    return {
      success: false,
      latency: apiLatency,
      error: error instanceof Error ? error.message : "Unknown API error",
    };
  }
}

function calculateHealthScore(
  response: HealthCheckResponse,
  hasCredentials: boolean,
  retryCount: number,
  overallLatency: number,
): { status: "healthy" | "degraded" | "unhealthy"; healthScore: number } {
  let healthScore = 100;
  let _passedChecks = 0;
  let _totalChecks = 0;

  // Network check
  _totalChecks++;
  if (response.checks.network.status === "pass") {
    _passedChecks++;
  } else {
    healthScore -= 50;
  }

  // Authentication check
  _totalChecks++;
  if (response.checks.authentication.status === "pass" && hasCredentials) {
    _passedChecks++;
  } else if (!hasCredentials) {
    healthScore -= 20; // Less penalty for no credentials
  } else {
    healthScore -= 30;
  }

  // API check (only if we have credentials)
  if (hasCredentials) {
    _totalChecks++;
    if (response.checks.api.status === "pass") {
      _passedChecks++;
    } else {
      healthScore -= 30;
    }
  }

  // Penalty for retries and high latency
  if (retryCount > 0) {
    healthScore -= retryCount * 10;
  }
  if (overallLatency > 5000) {
    healthScore -= 20;
  } else if (overallLatency > 2000) {
    healthScore -= 10;
  }

  healthScore = Math.max(0, Math.min(100, healthScore));

  // Determine overall status
  let status: "healthy" | "degraded" | "unhealthy" = "unhealthy";
  if (healthScore >= 80 && response.checks.network.status === "pass") {
    status = "healthy";
  } else if (healthScore >= 50 || response.checks.network.status === "pass") {
    status = "degraded";
  }

  return { status, healthScore };
}

function createJsonResponse(
  response: HealthCheckResponse,
  status: "healthy" | "degraded" | "unhealthy",
) {
  return NextResponse.json(response, {
    status: status === "healthy" ? 200 : status === "degraded" ? 206 : 503,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET() {
  const startTime = Date.now();
  const response = createHealthResponse();

  try {
    const credentialInfo = await getUserCredentialInfo();
    const envInfo = await checkEnvironmentCredentials();

    // Determine final credentials and source
    let finalCredentials = credentialInfo.userCredentials;
    let hasCredentials = credentialInfo.hasCredentials;
    let credentialSource = credentialInfo.credentialSource;

    if (!hasCredentials && envInfo.hasEnvCredentials) {
      hasCredentials = true;
      credentialSource = "environment";
      finalCredentials = envInfo.envCredentials;
    }

    response.checks.authentication = {
      status: hasCredentials ? "pass" : "skip",
      hasCredentials,
      source: credentialSource,
    };

    // Perform network connectivity test
    const networkResult = await performNetworkTest(finalCredentials);

    response.checks.network = networkResult.success
      ? { status: "pass", latency: networkResult.latency }
      : { status: "fail", latency: networkResult.latency, error: networkResult.error };

    // Perform API test if we have credentials and network is working
    if (networkResult.success && hasCredentials) {
      const apiResult = await performApiTest(finalCredentials);

      response.checks.api = apiResult.success
        ? { status: "pass", latency: apiResult.latency }
        : { status: "fail", latency: apiResult.latency, error: apiResult.error };
    }

    // Calculate overall status and health score
    const overallLatency = Date.now() - startTime;
    const { status, healthScore } = calculateHealthScore(
      response,
      hasCredentials,
      networkResult.retryCount,
      overallLatency,
    );

    response.status = status;
    response.metadata = {
      retryCount: networkResult.retryCount,
      overallLatency,
      healthScore,
    };

    return createJsonResponse(response, status);
  } catch (error) {
    const overallLatency = Date.now() - startTime;
    response.status = "unhealthy";
    response.metadata = {
      retryCount: 0,
      overallLatency,
      healthScore: 0,
    };
    response.checks.network.error = error instanceof Error ? error.message : "Unknown error";

    return createJsonResponse(response, "unhealthy");
  }
}

// Support for HEAD requests for basic connectivity testing
export async function HEAD() {
  try {
    const mexcService = getRecommendedMexcService();
    const result = await mexcService.testConnectivity();

    const isConnected = typeof result === "boolean" ? result : result?.success === true;

    return new NextResponse(null, {
      status: isConnected ? 200 : 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Health-Status": isConnected ? "healthy" : "unhealthy",
      },
    });
  } catch (error) {
    return new NextResponse(null, {
      status: 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Health-Status": "unhealthy",
        "X-Error": error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}
