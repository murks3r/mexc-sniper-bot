"use client";

import type { Session as ClerkSession, User as ClerkUser } from "@clerk/nextjs";
import { useClerk, useSession, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { syncClerkUserWithDatabase } from "@/src/lib/clerk-supabase-client";

type ClerkAuthContextType = {
  user: ClerkUser | null;
  session: ClerkSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const ClerkAuthContext = createContext<ClerkAuthContextType | undefined>(undefined);

interface ClerkAuthProviderProps {
  children: ReactNode;
}

export function ClerkAuthProvider({ children }: ClerkAuthProviderProps) {
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const clerk = useClerk();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;

    setIsLoading(false);

    // Sync user with database when authenticated
    if (user && session) {
      syncClerkUserWithDatabase(user).catch((error) => {
        console.warn("Failed to sync user with database:", error);
      });
    }
  }, [user, session, isLoaded]);

  const signOut = async () => {
    await clerk.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  const getToken = async (): Promise<string | null> => {
    if (!session) return null;

    try {
      return await session.getToken({ template: "supabase" });
    } catch (error) {
      console.error("Error getting Clerk token:", error);
      return null;
    }
  };

  // For backward compatibility - check if user is anonymous
  // Clerk doesn't support anonymous users by default
  const isAnonymous = false;

  const value = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user,
    isAnonymous,
    getToken,
    signOut,
  };

  return <ClerkAuthContext.Provider value={value}>{children}</ClerkAuthContext.Provider>;
}

export function useClerkAuth() {
  const context = useContext(ClerkAuthContext);
  if (context === undefined) {
    throw new Error("useClerkAuth must be used within a ClerkAuthProvider");
  }
  return context;
}

// Backward compatibility aliases
export const useSupabaseAuth = useClerkAuth;
export const useAuth = useClerkAuth;
export const SupabaseAuthProvider = ClerkAuthProvider;
export const SupabaseAuthContext = ClerkAuthContext;

// Re-export the original Clerk hooks for direct use
export { useClerk, useSession, useUser } from "@clerk/nextjs";
