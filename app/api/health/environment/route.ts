/**
 * Environment Health Check API Route (Minimized)
 *
 * Simplified environment validation after services cleanup.
 * Returns basic environment status.
 */

import type { NextRequest } from "next/server";
import { apiResponse } from "@/src/lib/api-response";

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

    const validation = {
      isValid: missing.length === 0,
      status: missing.length === 0 ? "valid" : "warning",
      summary: {
        total: requiredVars.length,
        configured: requiredVars.length - missing.length,
        missing: missing.length,
        invalid: 0,
      },
      results: requiredVars.map((varName) => ({
        variable: varName,
        configured: !!process.env[varName],
        status: process.env[varName] ? "valid" : "missing",
      })),
      recommendations: missing.length > 0 ? [`Set missing variables: ${missing.join(", ")}`] : [],
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
