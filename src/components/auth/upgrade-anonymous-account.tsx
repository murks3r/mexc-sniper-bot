"use client";

import { AlertTriangle, CheckCircle, Mail } from "lucide-react";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser-client";
import { canUpgradeAnonymousUser } from "@/src/lib/auth-utils";
import { useAuth } from "./supabase-auth-provider";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useToast } from "../ui/use-toast";

interface UpgradeAnonymousAccountProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function UpgradeAnonymousAccount({
  onSuccess,
  onCancel,
}: UpgradeAnonymousAccountProps) {
  const { user, isAnonymous } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "password">("email");

  if (!isAnonymous || !canUpgradeAnonymousUser(user)) {
    return null;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      // Update user with email (this will send verification email)
      const { error: updateError } = await supabase.auth.updateUser({
        email,
      });

      if (updateError) {
        // Check if email belongs to existing user
        if (updateError.message.includes("already registered")) {
          setError(
            "This email is already registered. Please sign in to that account instead.",
          );
          setIsLoading(false);
          return;
        }
        throw updateError;
      }

      // Move to password step
      setStep("password");
      setIsLoading(false);
      toast({
        title: "Verification email sent",
        description: "Please check your email and click the verification link before setting a password.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update email");
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      // Check if email is verified first
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser?.email_confirmed_at) {
        setError("Please verify your email first by clicking the link in the verification email.");
        setIsLoading(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "Account upgraded successfully",
        description: "Your anonymous account has been converted to a permanent account.",
      });

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upgrade to Permanent Account</CardTitle>
        <CardDescription>
          Convert your guest account to a permanent account to keep your data safe
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            As a guest user, your data will be lost if you sign out or clear your browser data.
            Upgrade to a permanent account to keep your trading history and settings.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === "email" ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                We'll send a verification email to confirm your address
              </p>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? "Sending..." : "Continue"}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Please verify your email first by clicking the link in the verification email we
                sent to {email}
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a secure password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("email")}>
                Back
              </Button>
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? "Upgrading..." : "Upgrade Account"}
              </Button>
            </div>
          </form>
        )}

        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            You can also link your account using{" "}
            <Button variant="link" className="h-auto p-0 text-xs" asChild>
              <a href="/auth">OAuth providers</a>
            </Button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

