import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, ensureUserInDatabase } from "@/src/lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        // Error exchanging code for session - error logging handled by error handler middleware
        return NextResponse.redirect(new URL("/auth/error?message=callback_error", request.url));
      }

      // After successful session exchange, ensure user exists in our DB
      await ensureUserInDatabase();
    } catch (_error) {
      // Error in auth callback - error logging handled by error handler middleware
      return NextResponse.redirect(new URL("/auth/error?message=callback_error", request.url));
    }
  }

  // URL to redirect to after sign in process completes
  const redirectUrl = requestUrl.searchParams.get("redirect_to") || "/dashboard";
  return NextResponse.redirect(new URL(redirectUrl, request.url));
}
