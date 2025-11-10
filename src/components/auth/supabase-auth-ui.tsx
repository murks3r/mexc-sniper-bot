"use client";

import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import type { User } from "@supabase/supabase-js";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { memo, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser-client";
import {
  bypassRateLimitInDev,
  type RateLimitInfo,
  SupabaseRateLimitHandler,
} from "@/src/lib/supabase-rate-limit-handler";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { RateLimitNotice } from "./rate-limit-notice";
import { useAuth } from "./supabase-auth-provider";

export const SupabaseAuthUI = memo(function SupabaseAuthUI() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  // Use session from provider to avoid duplicate session checks
  const {
    user: contextUser,
    isLoading: contextLoading,
    signInAnonymously,
    isAnonymous,
  } = useAuth();
  const [user, setUser] = useState<User | null>(contextUser);
  const [isLoading, setIsLoading] = useState(contextLoading);
  const [mounted, setMounted] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  const [lastEmail, _setLastEmail] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningInAnonymously, setIsSigningInAnonymously] = useState(false);

  // Detect test environment to disable OAuth providers
  const isTestEnvironment =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      process.env.NODE_ENV === "test" ||
      process.env.PLAYWRIGHT_TEST === "true");

  // Fix hydration by ensuring consistent rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync with context user to avoid duplicate session checks
  useEffect(() => {
    if (contextUser !== undefined) {
      setUser(contextUser);
      setIsLoading(contextLoading);
    }
  }, [contextUser, contextLoading]);

  // Only listen for auth changes, don't fetch session again (provider handles that)
  useEffect(() => {
    if (!supabase || !mounted) return;

    // Clear any existing errors when starting fresh
    setAuthError(null);
    setRateLimitInfo(null);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);

      if (event === "SIGNED_IN" && session) {
        router.push("/dashboard");
        setRateLimitInfo(null); // Clear any rate limit notices on success
        setAuthError(null); // Clear any auth errors on success
      }

      // Handle auth errors that might indicate rate limiting
      if (event === "TOKEN_REFRESHED" && !session) {
        // Token refresh failed, might be rate limited
        try {
          const { error } = await supabase.auth.getSession();
          if (error && SupabaseRateLimitHandler.isRateLimitError(error)) {
            const rateLimitAnalysis = SupabaseRateLimitHandler.analyzeRateLimitError(error);
            setRateLimitInfo(rateLimitAnalysis);
          }
        } catch (err) {
          console.error("Error checking session after token refresh:", err);
        }
      }
    });

    // Listen for auth errors globally
    const handleAuthError = (error: unknown) => {
      const rateLimitAnalysis = SupabaseRateLimitHandler.analyzeRateLimitError(error);
      if (rateLimitAnalysis.isRateLimited) {
        setRateLimitInfo(rateLimitAnalysis);
        setIsLoading(false);
      }
    };

    // Add global error listener for auth-related errors
    if (typeof window !== "undefined") {
      const handleGlobalError = (event: ErrorEvent | PromiseRejectionEvent) => {
        const error = (event as PromiseRejectionEvent).reason || (event as ErrorEvent).error;
        if (
          (error && (error instanceof Error ? error.message : String(error)).includes("rate")) ||
          (error instanceof Error ? error.message : String(error)).includes("limit") ||
          (error instanceof Error ? error.message : String(error)).includes("too many")
        ) {
          handleAuthError(error);
        }
      };

      window.addEventListener("unhandledrejection", handleGlobalError as EventListener);
      window.addEventListener("error", handleGlobalError);

      // Also listen for fetch errors that might be rate limits
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        try {
          const response = await originalFetch(...args);
          if (response.status === 429) {
            const error = new Error("Rate limit exceeded");
            handleAuthError(error);
          }
          return response;
        } catch (error) {
          if (error && SupabaseRateLimitHandler.isRateLimitError(error)) {
            handleAuthError(error);
          }
          throw error;
        }
      };

      // Cleanup function
      return () => {
        window.removeEventListener("unhandledrejection", handleGlobalError);
        window.removeEventListener("error", handleGlobalError);
        window.fetch = originalFetch;
      };
    }

    return () => subscription.unsubscribe();
  }, [supabase, router, mounted]);

  // Redirect if already authenticated
  useEffect(() => {
    if (mounted && user && !isLoading) {
      router.push("/dashboard");
    }
  }, [mounted, user, isLoading, router]);

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/auth");
  };

  const handleRetry = () => {
    setRateLimitInfo(null);
    setAuthError(null);
    setIsLoading(true);
    // Reload the page to reset auth state
    window.location.reload();
  };

  const handleBypassEmail = async (email: string) => {
    const success = await bypassRateLimitInDev(email);
    if (success) {
      setRateLimitInfo(null);
      setAuthError(null);
      // Wait a moment then try to refresh auth state
      setTimeout(() => {
        setIsLoading(true);
        window.location.reload();
      }, 1000);
    }
  };

  // Extract email from input fields for bypass functionality
  const extractEmailFromForm = (): string => {
    if (lastEmail) return lastEmail;

    // Try to get email from form inputs or global tracking
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const windowWithEmail = window as typeof window & { lastAuthEmail?: string };
    return emailInput?.value || windowWithEmail.lastAuthEmail || "";
  };

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  // Don't render if Supabase client is not available (SSR)
  if (!supabase) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Authentication not available in SSR environment
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (user) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Welcome back!</CardTitle>
          <CardDescription className="text-muted-foreground">
            {isAnonymous ? "Signed in as Guest" : `Signed in as ${user.email || "User"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAnonymous && (
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                You're signed in as a guest. Your data will be lost if you sign out or clear your
                browser data. Consider upgrading to a permanent account.
              </AlertDescription>
            </Alert>
          )}
          <Button onClick={handleSignOut} variant="outline" className="w-full">
            Sign Out
          </Button>
          <Button onClick={() => router.push("/dashboard")} className="w-full">
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show rate limit notice if rate limited
  if (rateLimitInfo?.isRateLimited) {
    return (
      <div className="space-y-4">
        <RateLimitNotice
          rateLimitInfo={rateLimitInfo}
          onRetry={handleRetry}
          onBypassEmail={handleBypassEmail}
          userEmail={extractEmailFromForm()}
        />

        {/* Show simplified auth form below rate limit notice */}
        <Card className="bg-card border-border shadow-lg opacity-50">
          <CardHeader>
            <CardTitle className="text-foreground">Authentication Temporarily Limited</CardTitle>
            <CardDescription className="text-muted-foreground">
              Please wait or use the bypass options above
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center text-muted-foreground">
              Authentication form is temporarily disabled due to rate limits
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card className="bg-card border-border shadow-lg">
      <CardHeader>
        <CardTitle className="text-foreground">Welcome to MEXC Sniper Bot</CardTitle>
        <CardDescription className="text-muted-foreground">
          Sign in to your account or create a new one
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {authError && (
          <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              {authError}
            </AlertDescription>
          </Alert>
        )}

        <Auth
          supabaseClient={supabase as unknown as Parameters<typeof Auth>[0]["supabaseClient"]}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: "hsl(var(--primary))",
                  brandAccent: "hsl(var(--primary))",
                  brandButtonText: "hsl(var(--primary-foreground))",
                  defaultButtonBackground: "hsl(var(--secondary))",
                  defaultButtonBackgroundHover: "hsl(var(--secondary)/0.8)",
                  defaultButtonBorder: "hsl(var(--border))",
                  defaultButtonText: "hsl(var(--secondary-foreground))",
                  dividerBackground: "hsl(var(--border))",
                  inputBackground: "hsl(var(--background))",
                  inputBorder: "hsl(var(--border))",
                  inputBorderHover: "hsl(var(--border))",
                  inputBorderFocus: "hsl(var(--ring))",
                  inputText: "hsl(var(--foreground))",
                  inputLabelText: "hsl(var(--foreground))",
                  inputPlaceholder: "hsl(var(--muted-foreground))",
                  messageText: "hsl(var(--foreground))",
                  messageTextDanger: "hsl(var(--destructive))",
                  anchorTextColor: "hsl(var(--primary))",
                  anchorTextHoverColor: "hsl(var(--primary)/0.8)",
                },
                space: {
                  spaceSmall: "4px",
                  spaceMedium: "8px",
                  spaceLarge: "16px",
                  labelBottomMargin: "8px",
                  anchorBottomMargin: "4px",
                  emailInputSpacing: "4px",
                  socialAuthSpacing: "4px",
                  buttonPadding: "10px 15px",
                  inputPadding: "10px 15px",
                },
                fontSizes: {
                  baseBodySize: "14px",
                  baseInputSize: "14px",
                  baseLabelSize: "14px",
                  baseButtonSize: "14px",
                },
                borderWidths: {
                  buttonBorderWidth: "1px",
                  inputBorderWidth: "1px",
                },
                radii: {
                  borderRadiusButton: "6px",
                  buttonBorderRadius: "6px",
                  inputBorderRadius: "6px",
                },
              },
            },
            className: {
              anchor: "text-primary hover:text-primary/80",
              button: "bg-primary text-primary-foreground hover:bg-primary/90",
              container: "flex flex-col space-y-4",
              divider: "border-border",
              input:
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              label:
                "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
              loader: "animate-spin",
              message: "text-sm",
            },
          }}
          providers={isTestEnvironment ? [] : ["google", "github"]}
          redirectTo={
            typeof window !== "undefined" ? `${window.location.origin}/dashboard` : "/dashboard"
          }
          onlyThirdPartyProviders={false}
          magicLink={true}
          view="sign_in"
          showLinks={true}
          localization={{
            variables: {
              sign_in: {
                email_label: "Email address",
                password_label: "Password",
                email_input_placeholder: "Your email address",
                password_input_placeholder: "Your password",
                button_label: "Sign In",
                loading_button_label: "Signing in...",
                social_provider_text: "Sign in with {{provider}}",
                link_text: "Don't have an account? Sign up",
              },
              sign_up: {
                email_label: "Email address",
                password_label: "Create a password",
                email_input_placeholder: "Your email address",
                password_input_placeholder: "Create a password",
                button_label: "Sign Up",
                loading_button_label: "Signing up...",
                social_provider_text: "Sign up with {{provider}}",
                link_text: "Already have an account? Sign in",
                confirmation_text: "Check your email for the confirmation link",
              },
              magic_link: {
                email_input_label: "Email address",
                email_input_placeholder: "Your email address",
                button_label: "Send magic link",
                loading_button_label: "Sending magic link...",
                link_text: "Send a magic link email",
                confirmation_text: "Check your email for the magic link",
              },
              forgotten_password: {
                email_label: "Email address",
                password_label: "Your password",
                email_input_placeholder: "Your email address",
                button_label: "Send reset instructions",
                loading_button_label: "Sending reset instructions...",
                link_text: "Forgot your password?",
                confirmation_text: "Check your email for the password reset link",
              },
            },
          }}
        />

        {/* Add JavaScript to track email input for bypass functionality */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Track email input for bypass functionality
              setTimeout(() => {
                const emailInput = document.querySelector('input[type="email"]');
                if (emailInput) {
                  emailInput.addEventListener('input', function(e) {
                    window.lastAuthEmail = e.target.value;
                  });
                }
              }, 100);
            `,
          }}
        />

        <Separator className="my-4" />

        <div className="space-y-3">
          <Button
            onClick={async () => {
              setIsSigningInAnonymously(true);
              setAuthError(null);
              try {
                const { error } = await signInAnonymously();
                if (error) {
                  setAuthError(error.message || "Failed to sign in anonymously");
                  setIsSigningInAnonymously(false);
                } else {
                  // Success - will redirect via auth state change
                  router.push("/dashboard");
                }
              } catch (err) {
                setAuthError(err instanceof Error ? err.message : "An unexpected error occurred");
                setIsSigningInAnonymously(false);
              }
            }}
            variant="outline"
            className="w-full"
            disabled={isSigningInAnonymously}
          >
            {isSigningInAnonymously ? "Signing in..." : "Continue as Guest"}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Sign in anonymously to try the platform. You can upgrade to a permanent account later.
            Note: Your data will be lost if you sign out or clear browser data.
          </p>
        </div>
      </CardContent>
    </Card>
  );
});
