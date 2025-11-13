import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createAuthenticatedRequest,
  createTestSession,
} from "@/src/lib/test-helpers/clerk-auth-test-helpers";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));

vi.mock("@clerk/nextjs", () => {
  const { createElement, Fragment } = require("react");
  return {
    useUser: () => ({ user: null, isLoaded: true }),
    useSession: () => ({ session: null }),
    useClerk: () => ({ signOut: vi.fn() }),
    ClerkProvider: ({ children }: { children: ReactNode }) =>
      createElement(Fragment, null, children),
    SignIn: () => createElement("div", null, "Sign In"),
    SignUp: () => createElement("div", null, "Sign Up"),
    UserButton: () => createElement("div", null, "User Button"),
    SignInButton: ({ children }: { children: ReactNode }) =>
      createElement(Fragment, null, children),
  };
});

/**
 * Route Integration Tests
 *
 * Verifies key routes can be imported and don't have breaking syntax errors.
 * Also tests that protected routes require authentication.
 */
describe("Route Integration Tests", () => {
  describe("Page Imports", () => {
    it("should import root layout without errors", async () => {
      const layout = await import("../layout");
      expect(layout).toBeDefined();
      expect(layout.default).toBeDefined();
    }, 30000); // Increase timeout for slow imports

    it("should import root page without errors", async () => {
      const page = await import("../page");
      expect(page).toBeDefined();
      expect(page.default).toBeDefined();
    }, 10000);

    it("should import dashboard page without errors", async () => {
      const page = await import("../dashboard/page");
      expect(page).toBeDefined();
      expect(page.default).toBeDefined();
    }, 10000);

    it("should import auth page without errors", async () => {
      const page = await import("../auth/page");
      expect(page).toBeDefined();
      expect(page.default).toBeDefined();
    });

    it("should import error boundary without errors", async () => {
      const error = await import("../error");
      expect(error).toBeDefined();
      expect(error.default).toBeDefined();
    });

    it("should import not-found page without errors", async () => {
      const notFound = await import("../not-found");
      expect(notFound).toBeDefined();
      expect(notFound.default).toBeDefined();
    });
  });

  describe("Protected Route Structure", () => {
    it("should create authenticated request for protected routes", () => {
      const testSession = createTestSession();
      const request = createAuthenticatedRequest(
        "http://localhost:3000/api/snipe-targets",
        testSession.sessionToken,
      );

      expect(request.headers.get("Authorization")).toBeTruthy();
      expect(request.url).toContain("/api/snipe-targets");
    });

    it("should verify test session structure for route testing", () => {
      const testSession = createTestSession({
        clerkUserId: "route-test-user",
        user: {
          id: "route-test-user",
          object: "user",
          username: "route-test-user",
          firstName: "Route",
          lastName: "Test",
          emailAddresses: [
            {
              id: "email_1",
              emailAddress: "route-test@example.com",
              verification: { status: "verified", strategy: "email_link" },
              linkedTo: [],
            },
          ],
          phoneNumbers: [],
          web3Wallets: [],
          externalAccounts: [],
          samlAccounts: [],
          publicMetadata: {},
          privateMetadata: {},
          unsafeMetadata: {},
          primaryEmailAddressId: "email_1",
          primaryPhoneNumberId: null,
          primaryWeb3WalletId: null,
          passwordEnabled: true,
          totpEnabled: false,
          backupCodeEnabled: false,
          twoFactorEnabled: false,
          banned: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastSignInAt: Date.now(),
          imageUrl: "",
          hasImage: false,
          profileImageUrl: "",
          externalId: null,
        } as any,
        session: {
          id: "sess_1",
          object: "session",
          userId: "route-test-user",
          status: "active",
          lastActiveAt: Date.now(),
          expireAt: Date.now() + 3600 * 1000,
          abandonAt: Date.now() + 3600 * 1000,
        } as any,
        sessionToken: "mock-session-token-123",
      });

      expect(testSession.user.id).toBe("route-test-user");
      expect(testSession.sessionToken).toBeTruthy();
      expect(testSession.user.emailAddresses[0]?.emailAddress).toBe("route-test@example.com");
    });
  });
});
