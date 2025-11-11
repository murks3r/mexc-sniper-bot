/**
 * Environment Health Check API Route (Minimized)
 *
 * Simplified environment validation after services cleanup.
 * Returns basic environment status.
 */

import type { NextRequest } from "next/server";
import { apiResponse } from "@/src/lib/api-response";
import { getUserCredentials } from "@/src/services/api/user-credentials-service";

const HEALTH_CHECK_USER_ID = (process.env.AUTO_SNIPING_HEALTH_USER_ID || "system").trim();

/**
 * GET /api/health/environment
 * Minimal environment variable health check
 */
export async function GET(_request: NextRequest) {
  const startTime = Date.now();

  try {
    // Minimal environment validation - check critical vars only
    const requiredVars = ["MEXC_API_KEY", "MEXC_SECRET_KEY"];
    const missing = requiredVars.filter((v) => !process.env[v]);

    const databaseCredentialResult: {
      source: "database";
      provider: "mexc";
      userId: string | null;
      configured: boolean;
      status: "valid" | "missing" | "error" | "skipped";
      lastUsed?: string;
      error?: string;
    } = {
      source: "database",
      provider: "mexc",
      userId: HEALTH_CHECK_USER_ID || null,
      configured: false,
      status: HEALTH_CHECK_USER_ID ? "missing" : "skipped",
    };

    if (HEALTH_CHECK_USER_ID) {
      try {
        const credentials = await getUserCredentials(HEALTH_CHECK_USER_ID, "mexc");
        if (credentials?.apiKey && credentials?.secretKey) {
          databaseCredentialResult.configured = true;
          databaseCredentialResult.status = "valid";
          if (credentials.lastUsed instanceof Date) {
            databaseCredentialResult.lastUsed = credentials.lastUsed.toISOString();
          }
        }
      } catch (error) {
        databaseCredentialResult.status = "error";
        databaseCredentialResult.error =
          error instanceof Error ? error.message : "Unknown credential retrieval error";
      }
    }

    const hasEnvironmentCredentials = missing.length === 0;
    const hasDatabaseCredentials = databaseCredentialResult.configured;
    const hasAnyCredentials = hasEnvironmentCredentials || hasDatabaseCredentials;
    const hasCredentialError =
      databaseCredentialResult.status === "error" && !hasEnvironmentCredentials;

    const environmentResults = requiredVars.map((varName) => ({
      variable: varName,
      configured: !!process.env[varName],
      status: process.env[varName] ? "valid" : "missing",
    }));

    const validationResults: Array<Record<string, unknown>> = [
      ...environmentResults,
      databaseCredentialResult,
    ];

    const recommendations: string[] = [];

    if (missing.length > 0) {
      recommendations.push(`Set missing variables: ${missing.join(", ")}`);
    }

    if (!hasDatabaseCredentials && !hasEnvironmentCredentials) {
      recommendations.push(
        "No active MEXC credentials detected. Save credentials via the API credentials manager or set MEXC_API_KEY/MEXC_SECRET_KEY environment variables.",
      );
    }

    if (databaseCredentialResult.status === "error" && databaseCredentialResult.error) {
      recommendations.push(
        `Database credential retrieval failed: ${databaseCredentialResult.error}`,
      );
    }

    const validation = {
      isValid: hasAnyCredentials && !hasCredentialError,
      status: hasCredentialError ? "error" : hasAnyCredentials ? "valid" : "warning",
      summary: {
        total: requiredVars.length,
        configured: requiredVars.length - missing.length,
        missing: missing.length,
        invalid: 0,
        credentialSources: {
          database: databaseCredentialResult.status,
          environment: hasEnvironmentCredentials
            ? "valid"
            : missing.length > 0
              ? "missing"
              : "unknown",
        },
      },
      results: validationResults,
      recommendations,
      credentialSources: {
        active: hasDatabaseCredentials
          ? "database"
          : hasEnvironmentCredentials
            ? "environment"
            : "none",
        database: databaseCredentialResult,
        environment: {
          configured: hasEnvironmentCredentials,
          missing,
          status: hasEnvironmentCredentials ? "valid" : "missing",
        },
      },
    };

    const responseTime = Date.now() - startTime;

    return apiResponse(
      {
        success: true,
        status: "healthy",
        data: {
          environment: process.env.NODE_ENV || "development",
          validation: validation as Record<string, unknown>,
          timestamp: new Date().toISOString(),
          responseTime,
        },
      },
      200,
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;
    // Error logging handled by error handler middleware

    return apiResponse(
      {
        success: false,
        status: "error",
        error: "Environment check failed",
        details: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
        meta: {
          responseTime,
        },
      },
      500,
    );
  }
}
