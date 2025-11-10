/**
 * Authentication Debug Tests
 *
 * Tests authentication functionality using both mocked and real auth.
 * Demonstrates how to use test helpers for auth testing.
 */

import { describe, expect, it, vi } from "vitest";
import { requireAuthFromRequest } from "@/src/lib/supabase-auth-server";
import { createTestSession, createAuthenticatedRequest } from "@/src/lib/test-helpers/supabase-auth-test-helpers";
import { detectTestMode } from "@/src/lib/test-helpers/test-supabase-client";

const testMode = detectTestMode();
const skipIntegrationTests = testMode === "mock";

describe("Authentication Debug", () => {
  describe("Mocked Auth (Unit Tests)", () => {
    // Mock authentication - use hoisted to ensure it's available before route import
    const mockRequireAuth = vi.hoisted(() =>
      vi.fn().mockResolvedValue({
        id: "test-user-id",
        email: "test@example.com",
        name: "Test User",
        emailVerified: true,
      }),
    );

    vi.mock("@/src/lib/supabase-auth-server", () => ({
      requireAuthFromRequest: mockRequireAuth,
    }));

    it("should mock requireAuthFromRequest correctly", async () => {
      const mockRequest = new Request("http://localhost:3000/test");

      const user = await requireAuthFromRequest(mockRequest as any);

      expect(user).toBeDefined();
      expect(user.id).toBe("test-user-id");
      expect(mockRequireAuth).toHaveBeenCalledWith(mockRequest);
    });
  });

  describe("Test Helpers Usage", () => {
    it("should create test session with test helpers", () => {
      const testSession = createTestSession({
        supabaseUser: {
          id: "test-user-123",
          email: "test@example.com",
          name: "Test User",
          emailVerified: true,
        },
      });

      expect(testSession.user).toBeDefined();
      expect(testSession.accessToken).toBeTruthy();
      expect(testSession.supabaseUser.id).toBe("test-user-123");
    });

    it("should create authenticated request with test helpers", () => {
      const testSession = createTestSession();
      const request = createAuthenticatedRequest(
        "http://localhost:3000/api/test",
        testSession.accessToken,
      );

      expect(request.headers.get("Authorization")).toBe(`Bearer ${testSession.accessToken}`);
    });
  });

  describe.skipIf(skipIntegrationTests)("Real Auth (Integration Tests)", () => {
    it("should work with real Supabase auth when configured", async () => {
      // This test demonstrates how to use real auth in integration tests
      // It requires USE_REAL_SUPABASE=true and proper Supabase credentials
      const testSession = createTestSession();

      // Verify session structure
      expect(testSession.session).toBeDefined();
      expect(testSession.user).toBeDefined();
      expect(testSession.accessToken).toBeTruthy();

      // Note: For full integration test, use createAndSignInTestUser()
      // from supabase-auth-test-helpers
    });
  });
});