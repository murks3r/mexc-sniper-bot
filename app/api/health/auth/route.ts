import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Validates URL format and protocol
 */
function validateUrlFormat(url: string | undefined, allowedProtocols: string[]): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return allowedProtocols.includes(parsedUrl.protocol.slice(0, -1)); // Remove trailing ':'
  } catch {
    return false;
  }
}

/**
 * Health check endpoint for Clerk + Supabase auth configuration
 *
 * Validates:
 * - Required environment variables for Clerk and Supabase sync helpers
 * - Clerk SDK accessibility via `auth()`
 * - URL formatting for Supabase backend
 *
 * Used by CI/CD pipelines and monitoring systems
 */
export async function GET() {
  try {
    const requiredEnvs = [
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
    ];

    const missing = requiredEnvs.filter((env) => process.env[env] === undefined);

    let clerkStatus: {
      sdkAccessible: boolean;
      sessionId: string | null;
      userId: string | null;
      sessionClaims: Record<string, unknown> | null;
      error?: string;
    } | null = null;

    try {
      const session = await auth();
      clerkStatus = {
        sdkAccessible: true,
        sessionId: session.sessionId ?? null,
        userId: session.userId ?? null,
        sessionClaims: null, // session.claims not available in SessionAuthWithRedirect
      };
    } catch (clerkError) {
      clerkStatus = {
        sdkAccessible: false,
        sessionId: null,
        userId: null,
        sessionClaims: null,
        error: clerkError instanceof Error ? clerkError.message : "Unknown Clerk SDK error",
      };
    }

    const databaseUrl = process.env.DATABASE_URL || "";
    const databaseUrlFormat =
      databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://");

    const configValidation = {
      supabase_url_format: validateUrlFormat(process.env.NEXT_PUBLIC_SUPABASE_URL, ["https"]),
      database_url_format: databaseUrlFormat,
      anon_key_format: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0,
      ),
      service_role_key_format: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.length > 0,
      ),
      clerk_publishable_key: Boolean(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0,
      ),
      clerk_secret_key: Boolean(
        process.env.CLERK_SECRET_KEY && process.env.CLERK_SECRET_KEY.length > 0,
      ),
    };

    const allConfigValid = Object.values(configValidation).every(Boolean);

    let overallStatus: "healthy" | "warning" | "unhealthy";
    let message: string;

    if (missing.length > 0 || !clerkStatus?.sdkAccessible || !allConfigValid) {
      overallStatus = "unhealthy";
      message = "Authentication system has critical issues";
    } else if (clerkStatus?.sdkAccessible) {
      overallStatus = "healthy";
      message = "Authentication system is fully configured";
    } else {
      overallStatus = "warning";
      message = "Authentication system partially functional";
    }

    let supabaseDomain = null;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        supabaseDomain = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
      } catch {
        supabaseDomain = "invalid-url";
      }
    }

    const deploymentInfo = {
      environment: process.env.NODE_ENV || "development",
      is_vercel: Boolean(process.env.VERCEL),
      is_production: process.env.NODE_ENV === "production",
      supabase_domain: supabaseDomain,
      database_provider: "supabase",
    };

    return NextResponse.json({
      status: overallStatus,
      message,
      auth_configured: missing.length === 0 && clerkStatus?.sdkAccessible,
      missing_env_vars: missing,
      environment_variables: {
        total_required: requiredEnvs.length,
        configured: requiredEnvs.length - missing.length,
        missing_count: missing.length,
      },
      clerk_status: clerkStatus,
      configuration_validation: configValidation,
      deployment_info: deploymentInfo,
      timestamp: new Date().toISOString(),
      version: "2.0.0",
    });
  } catch (error) {
    const errorObj = error as Error | { message?: string };
    return NextResponse.json(
      {
        status: "error",
        error: "Auth health check failed",
        details: errorObj?.message || "Unknown error occurred",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      Allow: "GET, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
