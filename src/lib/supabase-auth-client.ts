"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseAvailable } from "./supabase-browser-client";
import {
  bypassRateLimitInDev,
  type RateLimitInfo,
  type RetryConfig,
  SupabaseRateLimitHandler,
  withRateLimitHandling,
} from "./supabase-rate-limit-handler";

interface AuthUser {
  id: string;
  email: string;
  name?: string;
  username?: string;
  picture?: string;
  emailVerified?: boolean;
}

interface AuthSession {
  user?: AuthUser;
  isAuthenticated: boolean;
  accessToken?: string;
}

interface AuthError extends Error {
  rateLimitInfo?: RateLimitInfo;
}

interface AuthOptions {
  retryConfig?: Partial<RetryConfig>;
  enableRateLimitHandling?: boolean;
  bypassInDevelopment?: boolean;
  onRateLimit?: (rateLimitInfo: RateLimitInfo) => void;
  onRetry?: (attempt: number, delay: number) => void;
}

/**
 * Custom hook for Supabase authentication
 */
export const useAuth = () => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      setIsPending(true);
      setError(null);

      // Check if Supabase is available
      if (!isSupabaseAvailable()) {
        console.info("[Auth] Supabase not configured, using anonymous session");
        setSession({ isAuthenticated: false });
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setSession({ isAuthenticated: false });
        return;
      }

      // Add timeout to prevent hanging
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Session fetch timeout")), 5000),
      );

      const {
        data: { session: supabaseSession },
        error: sessionError,
      } = (await Promise.race([sessionPromise, timeoutPromise])) as any;

      if (sessionError) {
        // Log network errors but don't treat them as fatal
        if (
          sessionError.message.includes("fetch failed") ||
          sessionError.message.includes("timeout")
        ) {
          console.info("[Auth] Network error during session fetch, using anonymous session");
          setSession({ isAuthenticated: false });
          return;
        }
        throw new Error(sessionError.message);
      }

      if (supabaseSession?.user) {
        const user = supabaseSession.user;
        const authUser: AuthUser = {
          id: user.id,
          email: user.email ?? "",
          name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User",
          username: user.user_metadata?.username,
          picture: user.user_metadata?.picture || user.user_metadata?.avatar_url,
          emailVerified: !!user.email_confirmed_at,
        };

        setSession({
          user: authUser,
          isAuthenticated: true,
          accessToken: supabaseSession.access_token,
        });
      } else {
        setSession({
          isAuthenticated: false,
        });
      }
    } catch (err) {
      const error = err as AuthError;

      // Network errors shouldn't be treated as auth errors
      if (
        error.message.includes("timeout") ||
        error.message.includes("fetch failed") ||
        error.message.includes("network")
      ) {
        console.info("[Auth] Network error, falling back to anonymous session");
        setSession({ isAuthenticated: false });
        setError(null); // Clear the error since this is expected
      } else {
        console.warn("[Auth] Authentication error:", error.message);
        setError(error);
        setSession({ isAuthenticated: false });
      }
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();

    // Only set up auth listener if Supabase is available
    if (!isSupabaseAvailable()) {
      return () => {};
    }

    // Listen for auth changes
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSession({ isAuthenticated: false });
      setIsPending(false);
      return () => {};
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, _session) => {
      try {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          await fetchSession();
        } else if (event === "SIGNED_OUT") {
          setSession({
            isAuthenticated: false,
          });
          setIsPending(false);
        }
      } catch (error) {
        // Suppress token refresh errors - they're expected when offline/unconfigured
        if (
          error instanceof Error &&
          (error.message.includes("refresh") || error.message.includes("fetch failed"))
        ) {
          console.debug("[Auth] Token refresh failed (expected if offline)");
        } else {
          console.warn("[Auth] Auth state change error:", error);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchSession]);

  const getToken = useCallback(async () => {
    if (!isSupabaseAvailable()) {
      return null;
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
    } catch (error) {
      console.debug("[Auth] Error getting token:", error);
      return null;
    }
  }, []);

  return {
    user: session?.user || null,
    isLoading: isPending,
    isAuthenticated: session?.isAuthenticated || false,
    isAnonymous: !session?.isAuthenticated && !isPending,
    session,
    error,
    refetch: fetchSession,
    getToken,
    isSupabaseConfigured: isSupabaseAvailable(),
  };
};

/**
 * Enhanced sign in with email and password with rate limit handling
 */
export const signInWithEmail = async (
  email: string,
  password: string,
  options: AuthOptions = {},
) => {
  if (!isSupabaseAvailable()) {
    throw new Error("Authentication not available - Supabase not configured");
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const enableRateLimitHandling = options.enableRateLimitHandling !== false;

  const operation = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const authError = new Error(error.message) as AuthError;

      // Analyze rate limit info
      const rateLimitInfo = SupabaseRateLimitHandler.analyzeRateLimitError(error);
      if (rateLimitInfo.isRateLimited) {
        authError.rateLimitInfo = rateLimitInfo;
      }

      throw authError;
    }

    return data;
  };

  if (enableRateLimitHandling) {
    return withRateLimitHandling(operation, {
      config: options.retryConfig,
      onRateLimit: options.onRateLimit,
      onRetry: options.onRetry,
      onFailure: async (error) => {
        // Try bypass in development if enabled
        if (options.bypassInDevelopment && error.rateLimitInfo) {
          const bypassSuccess = await bypassRateLimitInDev(email);
          if (bypassSuccess) {
            // Retry the operation after bypass
            return operation();
          }
        }
      },
    });
  }

  return operation();
};

/**
 * Enhanced sign up with email and password with rate limit handling
 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  userOptions?: {
    name?: string;
    username?: string;
  },
  authOptions: AuthOptions = {},
) => {
  if (!isSupabaseAvailable()) {
    throw new Error("Authentication not available - Supabase not configured");
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const enableRateLimitHandling = authOptions.enableRateLimitHandling !== false;

  const operation = async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: userOptions?.name,
          username: userOptions?.username,
        },
      },
    });

    if (error) {
      const authError = new Error(error.message) as AuthError;

      // Analyze rate limit info
      const rateLimitInfo = SupabaseRateLimitHandler.analyzeRateLimitError(error);
      if (rateLimitInfo.isRateLimited) {
        authError.rateLimitInfo = rateLimitInfo;
      }

      throw authError;
    }

    return data;
  };

  if (enableRateLimitHandling) {
    return withRateLimitHandling(operation, {
      config: authOptions.retryConfig,
      onRateLimit: authOptions.onRateLimit,
      onRetry: authOptions.onRetry,
      onFailure: async (error) => {
        // Try bypass in development if enabled
        if (authOptions.bypassInDevelopment && error.rateLimitInfo) {
          const bypassSuccess = await bypassRateLimitInDev(email);
          if (bypassSuccess) {
            // Retry the operation after bypass
            return operation();
          }
        }
      },
    });
  }

  return operation();
};

/**
 * Sign out current user
 */
export const signOut = async () => {
  if (!isSupabaseAvailable()) {
    console.info("[Auth] Supabase not configured, skipping sign out");
    return { error: null };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { error: null };
  }

  try {
    return await supabase.auth.signOut();
  } catch (error) {
    console.warn("[Auth] Error during sign out:", error);
    return { error };
  }
};

/**
 * Enhanced sign in with OAuth providers with rate limit handling
 */
export const signInWithOAuth = async (
  provider: "google" | "github" | "discord",
  authOptions: AuthOptions = {},
) => {
  if (!isSupabaseAvailable()) {
    throw new Error("Authentication not available - Supabase not configured");
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const enableRateLimitHandling = authOptions.enableRateLimitHandling !== false;

  const operation = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      const authError = new Error(error.message) as AuthError;

      // Analyze rate limit info
      const rateLimitInfo = SupabaseRateLimitHandler.analyzeRateLimitError(error);
      if (rateLimitInfo.isRateLimited) {
        authError.rateLimitInfo = rateLimitInfo;
      }

      throw authError;
    }

    return data;
  };

  if (enableRateLimitHandling) {
    return withRateLimitHandling(operation, {
      config: authOptions.retryConfig,
      onRateLimit: authOptions.onRateLimit,
      onRetry: authOptions.onRetry,
    });
  }

  return operation();
};

/**
 * Enhanced reset password with rate limit handling
 */
export const resetPassword = async (email: string, authOptions: AuthOptions = {}) => {
  if (!isSupabaseAvailable()) {
    throw new Error("Authentication not available - Supabase not configured");
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const enableRateLimitHandling = authOptions.enableRateLimitHandling !== false;

  const operation = async () => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      const authError = new Error(error.message) as AuthError;

      // Analyze rate limit info
      const rateLimitInfo = SupabaseRateLimitHandler.analyzeRateLimitError(error);
      if (rateLimitInfo.isRateLimited) {
        authError.rateLimitInfo = rateLimitInfo;
      }

      throw authError;
    }

    return data;
  };

  if (enableRateLimitHandling) {
    return withRateLimitHandling(operation, {
      config: authOptions.retryConfig,
      onRateLimit: authOptions.onRateLimit,
      onRetry: authOptions.onRetry,
      onFailure: async (error) => {
        // Try bypass in development if enabled
        if (authOptions.bypassInDevelopment && error.rateLimitInfo) {
          const bypassSuccess = await bypassRateLimitInDev(email);
          if (bypassSuccess) {
            // Retry the operation after bypass
            return operation();
          }
        }
      },
    });
  }

  return operation();
};

/**
 * Enhanced update password with rate limit handling
 */
export const updatePassword = async (newPassword: string, authOptions: AuthOptions = {}) => {
  if (!isSupabaseAvailable()) {
    throw new Error("Authentication not available - Supabase not configured");
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const enableRateLimitHandling = authOptions.enableRateLimitHandling !== false;

  const operation = async () => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      const authError = new Error(error.message) as AuthError;

      // Analyze rate limit info
      const rateLimitInfo = SupabaseRateLimitHandler.analyzeRateLimitError(error);
      if (rateLimitInfo.isRateLimited) {
        authError.rateLimitInfo = rateLimitInfo;
      }

      throw authError;
    }

    return data;
  };

  if (enableRateLimitHandling) {
    return withRateLimitHandling(operation, {
      config: authOptions.retryConfig,
      onRateLimit: authOptions.onRateLimit,
      onRetry: authOptions.onRetry,
    });
  }

  return operation();
};

/**
 * Enhanced update user profile with rate limit handling
 */
export const updateProfile = async (
  updates: {
    name?: string;
    username?: string;
    picture?: string;
  },
  authOptions: AuthOptions = {},
) => {
  if (!isSupabaseAvailable()) {
    throw new Error("Authentication not available - Supabase not configured");
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const enableRateLimitHandling = authOptions.enableRateLimitHandling !== false;

  const operation = async () => {
    const { data, error } = await supabase.auth.updateUser({
      data: {
        full_name: updates.name,
        username: updates.username,
        picture: updates.picture,
      },
    });

    if (error) {
      const authError = new Error(error.message) as AuthError;

      // Analyze rate limit info
      const rateLimitInfo = SupabaseRateLimitHandler.analyzeRateLimitError(error);
      if (rateLimitInfo.isRateLimited) {
        authError.rateLimitInfo = rateLimitInfo;
      }

      throw authError;
    }

    return data;
  };

  if (enableRateLimitHandling) {
    return withRateLimitHandling(operation, {
      config: authOptions.retryConfig,
      onRateLimit: authOptions.onRateLimit,
      onRetry: authOptions.onRetry,
    });
  }

  return operation();
};

/**
 * Enhanced auth hook with rate limit monitoring
 */
export const useAuthWithRateLimit = () => {
  const auth = useAuth();
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitInfo | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const authWithRateLimit = useCallback(
    (operation: string) => ({
      onRateLimit: (rateLimitInfo: RateLimitInfo) => {
        setRateLimitStatus(rateLimitInfo);
        console.warn(`Rate limit detected for ${operation}:`, rateLimitInfo);
      },
      onRetry: (attempt: number, delay: number) => {
        setIsRetrying(true);
        console.info(`Retrying ${operation} (attempt ${attempt}) after ${delay}ms`);
      },
      onSuccess: () => {
        setRateLimitStatus(null);
        setIsRetrying(false);
      },
      onFailure: () => {
        setIsRetrying(false);
      },
    }),
    [],
  );

  return {
    ...auth,
    rateLimitStatus,
    isRetrying,
    authWithRateLimit,
    metrics: SupabaseRateLimitHandler.getMetrics(),
    circuitBreakerState: SupabaseRateLimitHandler.getCircuitBreakerState(),
  };
};

/**
 * Get rate limit status for monitoring dashboards
 */
export const useRateLimitStatus = () => {
  const [status, setStatus] = useState(() => SupabaseRateLimitHandler.getMetrics());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(SupabaseRateLimitHandler.getMetrics());
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return status;
};

// Export for compatibility with existing code
export {
  signInWithEmail as signIn,
  signUpWithEmail as signUp,
  signInWithEmail as login,
  signUpWithEmail as register,
};

// Export rate limit utilities
export {
  SupabaseRateLimitHandler,
  withRateLimitHandling,
  bypassRateLimitInDev,
  type RateLimitInfo,
  type AuthOptions,
  type AuthError,
};
