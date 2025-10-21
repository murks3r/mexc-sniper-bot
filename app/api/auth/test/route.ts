/**
 * Authentication Test Endpoint
 * 
 * Tests if the current user is properly authenticated with Supabase.
 * Helps debug authentication issues with the dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAuth } from "@/src/lib/supabase-auth";
import { debugRequestCookies, getSessionFromRequest, requireAuthFromRequest } from "@/src/lib/supabase-auth-server";

export async function GET(request: NextRequest) {
  try {
    // Debug cookie information
    const cookieDebug = debugRequestCookies(request);
    
    // Test both old and new session retrieval methods
    const oldSession = await getSession();
    const newSession = await getSessionFromRequest(request);
    
    const result: any = {
      timestamp: new Date().toISOString(),
      cookieDebug,
      oldSessionCheck: {
        hasSession: !!oldSession,
        isAuthenticated: oldSession.isAuthenticated,
        hasUser: !!oldSession.user,
        userId: oldSession.user?.id,
        userEmail: oldSession.user?.email,
        method: "Legacy getSession()"
      },
      newSessionCheck: {
        hasSession: !!newSession,
        isAuthenticated: newSession.isAuthenticated,
        hasUser: !!newSession.user,
        userId: newSession.user?.id,
        userEmail: newSession.user?.email,
        method: "Request-aware getSessionFromRequest()"
      },
      headers: {
        cookie: request.headers.get('cookie') ? 'Present' : 'Missing',
        authorization: request.headers.get('authorization') ? 'Present' : 'Missing',
        userAgent: request.headers.get('user-agent'),
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      }
    };

    // Test authentication with both methods
    const sessionToUse = newSession.isAuthenticated ? newSession : oldSession;
    
    if (sessionToUse.isAuthenticated && sessionToUse.user) {
      try {
        // Try new request-aware method first
        const authUser = await requireAuthFromRequest(request);
        result.authCheck = {
          success: true,
          userId: authUser.id,
          email: authUser.email,
          method: "Request-aware requireAuthFromRequest()",
          message: "✅ Authentication successful"
        };
      } catch (newAuthError) {
        // Fall back to old method
        try {
          const authUser = await requireAuth();
          result.authCheck = {
            success: true,
            userId: authUser.id,
            email: authUser.email,
            method: "Legacy requireAuth()",
            message: "✅ Authentication successful (fallback)"
          };
        } catch (oldAuthError) {
          result.authCheck = {
            success: false,
            newMethodError: newAuthError instanceof Error ? newAuthError.message : String(newAuthError),
            oldMethodError: oldAuthError instanceof Error ? oldAuthError.message : String(oldAuthError),
            message: "❌ Both auth methods failed"
          };
        }
      }
    } else {
      result.authCheck = {
        success: false,
        message: "❌ No valid session found with either method",
        recommendation: "User needs to sign in or session cookies are not being sent properly"
      };
    }

    // Determine overall status - prefer new method but accept either
    const isFullyAuthenticated = result.authCheck.success;
    const bestMethod = newSession.isAuthenticated ? "new" : oldSession.isAuthenticated ? "old" : "none";
    
    return NextResponse.json({
      success: isFullyAuthenticated,
      message: isFullyAuthenticated 
        ? `✅ User is fully authenticated via ${bestMethod} method and can use protected endpoints` 
        : "❌ Authentication issue detected",
      data: result,
      fix: isFullyAuthenticated ? null : {
        detectedIssue: cookieDebug.hasCookieHeader 
          ? "Session cookies present but not being read properly" 
          : "No session cookies found",
        solution: cookieDebug.hasCookieHeader 
          ? "Server-side session detection issue - using new request-aware method should fix this"
          : "User needs to sign in first"
      },
      recommendations: isFullyAuthenticated ? [
        "Authentication is working properly",
        "Start Sniping button should work from dashboard"
      ] : [
        "User should sign in via /auth page",
        "If already signed in, the new request-aware auth method should fix the issue",
        "Check browser developer tools for session cookies",
        "Try refreshing the page to restore session"
      ]
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      message: "Authentication test failed",
      error: error instanceof Error ? error.message : String(error),
      recommendations: [
        "Check Supabase environment variables",
        "Verify Supabase service is accessible",
        "Check server logs for detailed errors"
      ]
    }, { status: 500 });
  }
} 