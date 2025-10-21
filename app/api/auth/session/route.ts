import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient, getSession } from "@/src/lib/supabase-auth";
import { db } from "@/src/db";
import { user as authUser } from "@/src/db/schemas/auth";
import { eq } from "drizzle-orm";

export async function GET(_request: NextRequest) {
  try {
    const session = await getSession();

    if (!session.isAuthenticated || !session.user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    // Ensure user exists in DB for callers that fetch session immediately after login (same technique as user-preferences)
    try {
      const existing = await db
        .select()
        .from(authUser)
        .where(eq(authUser.id, session.user.id))
        .limit(1);
      if (existing.length === 0) {
        try {
          const supabase = createSupabaseAdminClient();
          const { data: userData, error } = await supabase.auth.admin.getUserById(session.user.id);

          if (!error && userData?.user) {
            const realUserData = {
              id: userData.user.id,
              email: userData.user.email || session.user.email,
              name:
                userData.user.user_metadata?.name ||
                userData.user.user_metadata?.full_name ||
                session.user.name ||
                session.user.email,
              emailVerified: userData.user.email_confirmed_at ? true : false,
              createdAt: new Date(userData.user.created_at),
              updatedAt: new Date(userData.user.updated_at),
            };
            await db
              .insert(authUser)
              .values(realUserData)
              .onConflictDoUpdate({
                target: authUser.id,
                set: {
                  email: realUserData.email,
                  name: realUserData.name,
                  emailVerified: realUserData.emailVerified,
                  updatedAt: new Date(),
                },
              });
          } else {
            await db
              .insert(authUser)
              .values({
                id: session.user.id,
                email: session.user.email,
                name: session.user.name || session.user.email,
                emailVerified: !!session.user.emailVerified,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: authUser.id,
                set: {
                  email: session.user.email,
                  name: session.user.name || session.user.email,
                  emailVerified: !!session.user.emailVerified,
                  updatedAt: new Date(),
                },
              });
          }
        } catch (_adminErr) {
          await db
            .insert(authUser)
            .values({
              id: session.user.id,
              email: session.user.email,
              name: session.user.name || session.user.email,
              emailVerified: !!session.user.emailVerified,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: authUser.id,
              set: {
                email: session.user.email,
                name: session.user.name || session.user.email,
                emailVerified: !!session.user.emailVerified,
                updatedAt: new Date(),
              },
            });
        }
      }
    } catch (syncError) {
      console.error("Session user sync error:", { error: syncError });
      // Do not fail the session endpoint on sync issues
    }

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
