import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getSession, createSupabaseAdminClient } from "@/src/lib/supabase-auth";
import { db } from "@/src/db";
import { user as authUser } from "@/src/db/schemas/auth";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Error exchanging code for session:", error);
        return NextResponse.redirect(
          new URL("/auth/error?message=callback_error", request.url)
        );
      }

      // After successful session exchange, ensure user exists in our DB using the same pattern as user-preferences route
      try {
        const session = await getSession();
        if (session.isAuthenticated && session.user) {
          const existing = await db
            .select()
            .from(authUser)
            .where(eq(authUser.id, session.user.id))
            .limit(1);

          if (existing.length === 0) {
            // Production-like flow: fetch from Supabase Admin to populate canonical fields
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
                // Fallback to session-derived fields
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
              // Final fallback: session-derived insert
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
        }
      } catch (syncError) {
        console.error("Error syncing user after auth callback:", syncError);
        // Continue redirect even if sync fails; subsequent protected calls will retry sync
      }
    } catch (error) {
      console.error("Error in auth callback:", error);
      return NextResponse.redirect(
        new URL("/auth/error?message=callback_error", request.url)
      );
    }
  }

  // URL to redirect to after sign in process completes
  const redirectUrl =
    requestUrl.searchParams.get("redirect_to") || "/dashboard";
  return NextResponse.redirect(new URL(redirectUrl, request.url));
}
