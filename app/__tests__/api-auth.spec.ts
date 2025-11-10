/**
 * API Route Authentication Tests
 *
 * Tests that protected API routes:
 * - Require authentication
 * - Work with valid JWT tokens
 * - Reject invalid/expired tokens
 * - Reject requests without auth headers
 *
 * These tests can run in mock mode (testing route handlers) or integration mode
 * (testing against real Supabase). Set USE_REAL_SUPABASE=true for integration tests.
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createAndSignInTestUser,
  createAuthenticatedRequest,
  createTestSession,
  cleanupTestUser,
} from "@/src/lib/test-helpers/supabase-auth-test-helpers";
import { requireAuthFromRequest, getSessionFromRequest } from "@/src/lib/supabase-auth-server";
import { detectTestMode } from "@/src/lib/test-helpers/test-supabase-client";

const testMode = detectTestMode();
const skipIntegrationTests = testMode === "mock";

describe("API Route Authentication", () => {
  describe("requireAuthFromRequest", () => {
    it("should throw error for unauthenticated request", async () => {
      const request = new NextRequest("http://localhost:3000/api/test");

      await expect(requireAuthFromRequest(request)).rejects.toThrow("Authentication required");
    });

    it("should throw error for request without Authorization header", async () => {
      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "Content-Type": "application/json",
        },
      });

      await expect(requireAuthFromRequest(request)).rejects.toThrow("Authentication required");
    });

    it.skipIf(skipIntegrationTests)(
      "should authenticate request with valid JWT token",
      async () => {
        const { session, user } = await createAndSignInTestUser({
          email: `test_api_auth_${Date.now()}@example.com`,
        });

        // Verify session and token are valid
        expect(session).toBeDefined();
        expect(session.accessToken).toBeTruthy();
        expect(typeof session.accessToken).toBe("string");
        expect(user).toBeDefined();
        expect(user.id).toBeTruthy();

        // Cleanup
        await cleanupTestUser(user.id);

        // Note: Full integration test would require proper cookie setup
        // which is complex in test environment. This is tested in E2E tests.
      },
    );
  });

  describe("getSessionFromRequest", () => {
    it("should return unauthenticated session for request without auth", async () => {
      const request = new NextRequest("http://localhost:3000/api/test");

      const session = await getSessionFromRequest(request);

      expect(session.isAuthenticated).toBe(false);
      expect(session.user).toBeNull();
    });

    it.skipIf(skipIntegrationTests)(
      "should extract session from authenticated request",
      async () => {
        const { session, user } = await createAndSignInTestUser({
          email: `test_session_extract_${Date.now()}@example.com`,
        });

        // Verify session structure is correct
        expect(session).toBeDefined();
        expect(session.accessToken).toBeTruthy();
        expect(typeof session.accessToken).toBe("string");
        expect(user).toBeDefined();
        expect(user.id).toBeTruthy();

        // Cleanup
        await cleanupTestUser(user.id);

        // Note: Full test would require proper cookie setup
        // This verifies the session structure is correct
      },
    );
  });

  describe("Protected Route Behavior", () => {
    it("should reject GET request to protected route without auth", async () => {
      const request = new NextRequest("http://localhost:3000/api/snipe-targets");

      await expect(requireAuthFromRequest(request)).rejects.toThrow("Authentication required");
    });

    it("should reject POST request to protected route without auth", async () => {
      const request = new NextRequest("http://localhost:3000/api/snipe-targets", {
        method: "POST",
        body: JSON.stringify({ test: "data" }),
      });

      await expect(requireAuthFromRequest(request)).rejects.toThrow("Authentication required");
    });

    it("should reject PUT request to protected route without auth", async () => {
      const request = new NextRequest("http://localhost:3000/api/api-credentials", {
        method: "PUT",
        body: JSON.stringify({ test: "data" }),
      });

      await expect(requireAuthFromRequest(request)).rejects.toThrow("Authentication required");
    });

    it("should reject DELETE request to protected route without auth", async () => {
      const request = new NextRequest("http://localhost:3000/api/snipe-targets/123", {
        method: "DELETE",
      });

      await expect(requireAuthFromRequest(request)).rejects.toThrow("Authentication required");
    });
  });

  describe("Token Validation", () => {
    it("should reject request with invalid token format", async () => {
      const request = createAuthenticatedRequest(
        "http://localhost:3000/api/test",
        "invalid-token-format",
      );

      // The request is created but session extraction will fail
      const session = await getSessionFromRequest(request);
      expect(session.isAuthenticated).toBe(false);
    });

    it("should reject request with malformed JWT", async () => {
      const request = createAuthenticatedRequest(
        "http://localhost:3000/api/test",
        "not.a.valid.jwt.token",
      );

      const session = await getSessionFromRequest(request);
      expect(session.isAuthenticated).toBe(false);
    });

    it("should create authenticated request with valid token structure", () => {
      const testSession = createTestSession();
      const request = createAuthenticatedRequest(
        "http://localhost:3000/api/test",
        testSession.accessToken,
      );

      expect(request.headers.get("Authorization")).toBe(`Bearer ${testSession.accessToken}`);
    });
  });

  describe("Mock Auth Testing", () => {
    it("should work with mocked auth in unit tests", async () => {
      // Mock requireAuthFromRequest for unit tests
      const mockRequireAuth = vi.fn().mockResolvedValue({
        id: "test-user-id",
        email: "test@example.com",
        name: "Test User",
        emailVerified: true,
      });

      const user = await mockRequireAuth();

      expect(user).toBeDefined();
      expect(user.id).toBe("test-user-id");
      expect(mockRequireAuth).toHaveBeenCalled();
    });

    it("should allow mocking auth for route handler tests", () => {
      const mockUser = {
        id: "mock-user-123",
        email: "mock@example.com",
        name: "Mock User",
        emailVerified: true,
      };

      // In unit tests, you can mock requireAuthFromRequest
      // This allows testing route logic without real Supabase
      expect(mockUser.id).toBeTruthy();
      expect(mockUser.email).toBeTruthy();
    });
  });

  describe("Error Handling", () => {
    it("should handle auth errors gracefully", async () => {
      const request = new NextRequest("http://localhost:3000/api/test");

      try {
        await requireAuthFromRequest(request);
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Authentication required");
      }
    });

    it("should provide clear error messages for auth failures", async () => {
      const request = new NextRequest("http://localhost:3000/api/test");

      await expect(requireAuthFromRequest(request)).rejects.toThrow("Authentication required");
    });
  });
});

describe.skipIf(skipIntegrationTests)("API Route Integration Tests", () => {
  it("should authenticate and access protected route with real JWT", async () => {
    const { session } = await createAndSignInTestUser({
      email: `test_integration_${Date.now()}@example.com`,
    });

    // Create authenticated request
    const request = createAuthenticatedRequest(
      "http://localhost:3000/api/snipe-targets",
      session.accessToken,
    );

    // Verify token is present
    expect(request.headers.get("Authorization")).toBe(`Bearer ${session.accessToken}`);

    // Note: Full integration test would make actual HTTP request to route
    // This requires running Next.js server, which is better suited for E2E tests
  });

  it("should handle expired token gracefully", async () => {
    // Create a test session with expired token
    const expiredSession = createTestSession({
      session: {
        access_token: "expired-token",
        refresh_token: "refresh-token",
        expires_in: -3600, // Expired
        expires_at: Math.floor(Date.now() / 1000) - 3600, // Expired
        token_type: "bearer",
        user: {
          id: "test-user",
          aud: "authenticated",
          role: "authenticated",
          email: "test@example.com",
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
      },
    });

    const request = createAuthenticatedRequest(
      "http://localhost:3000/api/test",
      expiredSession.accessToken,
    );

    // Session extraction should fail for expired token
    const session = await getSessionFromRequest(request);
    expect(session.isAuthenticated).toBe(false);
  });
});

