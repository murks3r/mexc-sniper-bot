import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase-auth";

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.signOut();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (_error) {
    // Sign out error - error logging handled by error handler middleware
    return NextResponse.json({ error: "Failed to sign out" }, { status: 500 });
  }
}
