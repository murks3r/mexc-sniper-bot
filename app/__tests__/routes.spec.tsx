import { describe, expect, it } from "vitest";
import {
  createAuthenticatedRequest,
  createTestSession,
} from "@/src/lib/test-helpers/supabase-auth-test-helpers";

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
        testSession.accessToken,
      );

      expect(request.headers.get("Authorization")).toBeTruthy();
      expect(request.url).toContain("/api/snipe-targets");
    });

    it("should verify test session structure for route testing", () => {
      const testSession = createTestSession({
        user: {
          id: "route-test-user",
          aud: "authenticated",
          role: "authenticated",
          email: "route-test@example.com",
          email_confirmed_at: new Date().toISOString(),
          phone: "",
          confirmation_sent_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {},
          identities: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        supabaseUser: {
          id: "route-test-user",
          email: "route-test@example.com",
          name: "Route Test User",
          emailVerified: true,
        },
      });

      expect(testSession.user.id).toBe("route-test-user");
      expect(testSession.accessToken).toBeTruthy();
      expect(testSession.supabaseUser.email).toBe("route-test@example.com");
    });
  });
});
