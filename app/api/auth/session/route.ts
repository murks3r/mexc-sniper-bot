import { type NextRequest, NextResponse } from "next/server";
import { ensureUserInDatabase, getSession } from "@/src/lib/supabase-auth";

export async function GET(_request: NextRequest) {
  try {
    const session = await getSession();

    if (!session.isAuthenticated || !session.user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    // Ensure user exists in DB for callers that fetch session immediately after login
    await ensureUserInDatabase();

    return NextResponse.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name || session.user.email,
        username: session.user.username,
        image: session.user.picture,
      },
      session: {
        id: session.user.id,
        userId: session.user.id,
        accessToken: session.accessToken,
      },
    });
  } catch (error) {
    console.error("Session API error:", { error: error });
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
