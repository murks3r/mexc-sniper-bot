export const dynamic = "force-dynamic";

/**
 * Authentication Test Endpoint
 *
 * Provides insight into Clerk authentication state for debugging.
 */

type AuthTestResult = {
  timestamp: string;
  headers: {
    cookie: string;
    authorization: string;
    userAgent: string | null;
  };
  clerk: {
    hasSession: boolean;
    userId: string | null;
    sessionId: string | null;
    sessionClaims: Record<string, unknown> | null;
    user: {
      id: string;
      email: string;
      name: string;
      username: string | null;
      verified: boolean;
    } | null;
  };
  environment: {
    nodeEnv: string | undefined;
    hasClerkPublishableKey: boolean;
    hasClerkSecretKey: boolean;
  };
  authCheck?: {
    success: boolean;
    method: string;
    userId?: string;
    email?: string;
    message: string;
    error?: string;
  };
};

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const authHeaders = {
      cookie: cookieHeader ? "Present" : "Missing",
      authorization: request.headers.has("authorization") ? "Present" : "Missing",
      userAgent: request.headers.get("user-agent"),
    };

    const clerkAuth = await auth();
    const hasSession = Boolean(clerkAuth.userId);
    const userInfo = clerkAuth.user
      ? {
          id: clerkAuth.user.id,
          email: clerkAuth.user.primaryEmailAddress?.emailAddress ?? "",
          name: `${clerkAuth.user.firstName ?? ""} ${clerkAuth.user.lastName ?? ""}`.trim(),
          username: clerkAuth.user.username,
          verified: (clerkAuth.user.emailAddresses ?? []).some(
            (email) => email.verification?.status === "verified",
          ),
        }
      : null;

    const result: AuthTestResult = {
      timestamp: new Date().toISOString(),
      headers: authHeaders,
      clerk: {
        hasSession,
        userId: clerkAuth.userId,
        sessionId: clerkAuth.sessionId,
        sessionClaims: clerkAuth.session?.claims,
        user: userInfo,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasClerkPublishableKey: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        hasClerkSecretKey: !!process.env.CLERK_SECRET_KEY,
      },
    };

    try {
      const authenticatedUser = await requireClerkAuth();
      result.authCheck = {
        success: true,
        method: "requireClerkAuth",
        userId: authenticatedUser.id,
        email: authenticatedUser.email,
        message: "✅ Clerk authentication succeeded",
      };
    } catch (authError) {
      result.authCheck = {
        success: false,
        method: "requireClerkAuth",
        message: "❌ Clerk authentication failed",
        error: authError instanceof Error ? authError.message : String(authError),
      };
    }

    const isFullyAuthenticated = Boolean(result.authCheck?.success);

    return NextResponse.json({
      success: isFullyAuthenticated,
      message: isFullyAuthenticated
        ? "✅ Clerk session is valid and protected routes should work"
        : "❌ Clerk session missing or invalid",
      data: result,
      fix: isFullyAuthenticated
        ? null
        : {
            detectedIssue: cookieHeader
              ? "Clerk session cookies present but auth guards failing"
              : "No Clerk session cookies found",
            solution: cookieHeader
              ? "Ensure Clerk middleware (`auth()`) is loading session data before calling protected endpoints"
              : "Sign in via the Clerk-powered auth page and retry",
          },
      recommendations: isFullyAuthenticated
        ? [
            "Authentication is healthy",
            "Start Sniping should be available",
            "Clerk tokens are being forwarded correctly",
          ]
        : [
            "Visit /auth or /sign-in to sign in with Clerk",
            "Confirm Clerk publishable key and secret key are configured",
            "If issues persist, check browser DevTools for missing Clerk cookies",
          ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Authentication test failed",
        error: error instanceof Error ? error.message : String(error),
        recommendations: [
          "Confirm Clerk environment variables exist",
          "Ensure Clerk session cookies are accessible",
          "Check server console for detailed errors",
        ],
      },
      { status: 500 },
    );
  }
}
