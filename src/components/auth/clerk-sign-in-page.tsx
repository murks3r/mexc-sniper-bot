"use client";

import { SignIn } from "@clerk/nextjs";
import { ArrowLeft, Zap } from "lucide-react";
import Link from "next/link";

export function ClerkSignInPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">MEXC Sniper</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            AI-powered cryptocurrency trading platform
          </p>
        </div>

        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "bg-slate-800 border-slate-700",
              headerTitle: "text-white",
              headerSubtitle: "text-slate-300",
              socialButtonsBlockButton: "bg-slate-700 hover:bg-slate-600 text-white",
              formFieldLabel: "text-slate-300",
              formFieldInput: "bg-slate-700 border-slate-600 text-white",
              footerActionText: "text-slate-300",
              footerActionLink: "text-primary hover:text-primary/80",
              formButtonPrimary: "bg-primary hover:bg-primary/90 text-white",
            },
          }}
        />

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
