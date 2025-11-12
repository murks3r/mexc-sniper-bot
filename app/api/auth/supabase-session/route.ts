import { type NextRequest, NextResponse } from "next/server";
import { getSession, getUser } from "@/src/lib/supabase-auth";

export async function GET(_request: NextRequest) {
  try {
    // Use getUser() to authenticate with Supabase Auth server (more secure than getSession())
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    // Get session for access token (needed for client-side operations)
    const session = await getSession();

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        image: user.picture,
        emailVerified: user.emailVerified,
      },
      session: {
        id: user.id,
        userId: user.id,
        accessToken: session.accessToken,
      },
    });
  } catch (_error) {
    // Supabase session API error - error logging handled by error handler middleware
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
