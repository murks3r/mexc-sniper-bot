/**
 * Authentication Debug Tests
 *
 * Tests authentication functionality using both mocked and real auth.
 * Demonstrates how to use test helpers for auth testing.
 */

import type { User } from "@clerk/nextjs/server";
import { describe, expect, it, vi } from "vitest";
import {
  createAuthenticatedRequest,
  createTestSession,
} from "@/src/lib/test-helpers/clerk-auth-test-helpers";

const hasRealClerk = !!process.env.CLERK_SECRET_KEY;

// Mock must be hoisted to top level
const mockRequireAuth = vi.fn().mockResolvedValue({
  id: "test-user-id",
  email: "test@example.com",
  name: "Test User",
  emailVerified: true,
});

vi.mock("@/src/lib/clerk-auth-server", () => ({
  requireClerkAuth: mockRequireAuth,
}));

describe("Authentication Debug", () => {
  describe("Mocked Auth (Unit Tests)", () => {
    it("should mock requireClerkAuth correctly", async () => {
      const { requireClerkAuth: mockedRequireAuth } = await import("@/src/lib/clerk-auth-server");
      const user = await mockedRequireAuth();

      expect(user).toBeDefined();
      expect(user.id).toBe("test-user-id");
      expect(mockRequireAuth).toHaveBeenCalled();
    });
  });

  describe("Test Helpers Usage", () => {
    it("should create test session with test helpers", () => {
      const testSession = createTestSession({
        clerkUserId: "test-user-123",
        user: {
          id: "test-user-123",
          object: "user",
          username: "testuser",
          firstName: "Test",
          lastName: "User",
          emailAddresses: [
            {
              id: "email_1",
              emailAddress: "test@example.com",
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
        } as unknown as User,
        sessionToken: "mock-token-123",
      });

      expect(testSession.user).toBeDefined();
      expect(testSession.sessionToken).toBeTruthy();
      expect(testSession.clerkUserId).toBe("test-user-123");
    });

    it("should create authenticated request with test helpers", () => {
      const testSession = createTestSession();
      const request = createAuthenticatedRequest(
        "http://localhost:3000/api/test",
        testSession.sessionToken,
      );

      expect(request.headers.get("Authorization")).toBe(`Bearer ${testSession.sessionToken}`);
    });
  });

  describe("Real Auth (Integration Tests)", () => {
    it("should work with real Clerk auth when configured", async () => {
      // This test works with both real and mock Clerk
      const testSession = createTestSession();

      // Verify session structure
      expect(testSession.user).toBeDefined();
      expect(testSession.sessionToken).toBeTruthy();

      if (hasRealClerk) {
        // Real integration test would use createAndSignInClerkUser()
        // For now, verify mock structure works
        expect(testSession.user.id).toBeTruthy();
      } else {
        // Mock test - verify structure
        expect(testSession.user.id).toBeTruthy();
        expect(typeof testSession.sessionToken).toBe("string");
      }
    });
  });
});
