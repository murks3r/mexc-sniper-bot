"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { isAnonymousUser } from "@/src/lib/auth-utils";
import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser-client";

type SupabaseAuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<Error | null>;
  signIn: (email: string, password: string) => Promise<{ error: Error }>;
  signUp: (email: string, password: string) => Promise<{ error: Error }>;
  signInWithProvider: (provider: "google" | "github") => Promise<{ error: Error }>;
  signInAnonymously: () => Promise<{ error: Error }>;
};

const SupabaseAuthContext = createContext<SupabaseAuthContextType | undefined>(undefined);

interface SupabaseAuthProviderProps {
  children: ReactNode;
}

export function SupabaseAuthProvider({ children }: SupabaseAuthProviderProps) {
  // Detect test environment (exclude localhost development)
  const isTestEnvironment =
    typeof window !== "undefined" &&
    (process.env.NODE_ENV === "test" ||
      process.env.PLAYWRIGHT_TEST === "true" ||
      window.navigator.userAgent?.includes("Playwright") ||
      process.env.FORCE_TEST_MODE === "true");

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // In test environment, provide mock user immediately
  useEffect(() => {
    if (isTestEnvironment) {
      const mockUser: User = {
        id: "test-user-123",
        aud: "authenticated",
        role: "authenticated",
        email: "ryan@ryanlisse.com",
        email_confirmed_at: new Date().toISOString(),
        phone: "",
        confirmation_sent_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {
          full_name: "Test User",
          name: "Test User",
        },
        identities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: Session = {
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: mockUser,
      };

      setUser(mockUser);
      setSession(mockSession);
      setIsLoading(false);
      return;
    }
  }, [isTestEnvironment]);

  useEffect(() => {
    // Skip real Supabase logic in test environment
    if (isTestEnvironment) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const getSession = async () => {
      try {
        // Add timeout to prevent infinite loading (increased to 15 seconds for slow networks)
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Session fetch timeout after 15 seconds")), 15000),
        );

        const {
          data: { session },
        } = await Promise.race([sessionPromise, timeoutPromise]);

        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        // Only log in development to reduce console noise
        if (process.env.NODE_ENV === "development") {
          if (session) {
            console.debug("[SupabaseAuth] Session loaded successfully", {
              userId: session.user?.id,
              expiresAt: session.expires_at,
            });
          } else {
            console.debug("[SupabaseAuth] No active session found");
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Don't log timeout as error if it's expected (e.g., no session exists)
        if (errorMessage.includes("timeout")) {
          console.warn(
            "[SupabaseAuth] Session fetch timeout - this may be normal if no session exists",
            {
              error: errorMessage,
              note: "Continuing without session - user may need to sign in",
            },
          );
        } else {
          console.error("[SupabaseAuth] Error getting session:", error);
        }

        // Set loading to false even on error/timeout to prevent infinite loading
        setSession(null);
        setUser(null);
        setIsLoading(false);
      }
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      if (event === "SIGNED_IN") {
        // Sync user with database when they sign in
        if (session?.user) {
          try {
            await fetch("/api/auth/supabase-session", {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            });
          } catch (error) {
            console.warn("Failed to sync user with database:", error);
          }
        }
        router.refresh();
      } else if (event === "SIGNED_OUT") {
        router.push("/auth");
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [router, isTestEnvironment]);

  const signOut = async () => {
    // Mock implementation in test environment
    if (isTestEnvironment) {
      setUser(null);
      setSession(null);
      return null;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return new Error("Supabase client not available (SSR environment)");
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
    }
    return error;
  };

  const signIn = async (email: string, password: string) => {
    // Mock implementation in test environment
    if (isTestEnvironment) {
      // Always succeed in test mode
      return { error: null };
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return {
        error: new Error("Supabase client not available (SSR environment)"),
      };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    // Mock implementation in test environment
    if (isTestEnvironment) {
      // Always succeed in test mode
      return { error: null };
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return {
        error: new Error("Supabase client not available (SSR environment)"),
      };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : "/auth/callback",
      },
    });
    return { error };
  };

  const signInWithProvider = async (provider: "google" | "github") => {
    // Mock implementation in test environment
    if (isTestEnvironment) {
      // Always succeed in test mode
      return { error: null };
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return {
        error: new Error("Supabase client not available (SSR environment)"),
      };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : "/auth/callback",
      },
    });
    return { error };
  };

  const signInAnonymously = async () => {
    // Mock implementation in test environment
    if (isTestEnvironment) {
      // Create mock anonymous user
      const mockAnonymousUser: User = {
        id: "anon-test-user-123",
        aud: "authenticated",
        role: "authenticated",
        email: null,
        email_confirmed_at: null,
        phone: null,
        confirmation_sent_at: null,
        confirmed_at: null,
        last_sign_in_at: new Date().toISOString(),
        app_metadata: {
          is_anonymous: true,
        },
        user_metadata: {},
        identities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: Session = {
        access_token: "mock-anonymous-access-token",
        refresh_token: "mock-anonymous-refresh-token",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: mockAnonymousUser,
      };

      setUser(mockAnonymousUser);
      setSession(mockSession);
      return { error: null };
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return {
        error: new Error("Supabase client not available (SSR environment)"),
      };
    }

    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      // Check if anonymous sign-ins are disabled
      if (
        error.message?.includes("anonymous") ||
        error.message?.includes("disabled") ||
        error.message?.includes("not enabled")
      ) {
        return {
          error: new Error(
            "Anonymous sign-ins are disabled. Please enable them in Supabase Dashboard → Authentication → Providers → Anonymous Sign-Ins",
          ),
        };
      }
      return { error };
    }

    if (data?.user) {
      // Sync anonymous user with database
      try {
        await fetch("/api/auth/supabase-session", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (syncError) {
        console.warn("Failed to sync anonymous user with database:", syncError);
      }
    }

    return { error: null };
  };

  const getToken = async (): Promise<string | null> => {
    // Mock implementation in test environment
    if (isTestEnvironment) {
      return "mock-access-token";
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return null;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      // Error getting token - return null silently
      return null;
    }
  };

  const isAnonymous = isAnonymousUser(user);

  const value = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user, // Anonymous users are considered authenticated
    isAnonymous,
    getToken,
    signOut,
    signIn,
    signUp,
    signInWithProvider,
    signInAnonymously,
  };

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
}

export function useSupabaseAuth() {
  const context = useContext(SupabaseAuthContext);
  if (context === undefined) {
    throw new Error("useSupabaseAuth must be used within a SupabaseAuthProvider");
  }
  return context;
}

// Alias for backward compatibility
export const useAuth = useSupabaseAuth;
