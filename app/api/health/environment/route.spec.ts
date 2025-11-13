import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecryptedCredentials } from "@/src/services/api/user-credentials-service";
import { GET } from "./route";

// Mock user credentials service - use factory function
vi.mock("@/src/services/api/user-credentials-service", () => {
  const mockedGetUserCredentials = vi.fn();
  return {
    getUserCredentials: mockedGetUserCredentials,
    __mockGetUserCredentials: mockedGetUserCredentials,
  };
});

describe("GET /api/health/environment", () => {
  let mockedGetUserCredentials: ReturnType<typeof vi.fn>;

  const originalEnv = {
    MEXC_API_KEY: process.env.MEXC_API_KEY,
    MEXC_SECRET_KEY: process.env.MEXC_SECRET_KEY,
    AUTO_SNIPING_HEALTH_USER_ID: process.env.AUTO_SNIPING_HEALTH_USER_ID,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Get mock from mocked module
    const credModule = await import("@/src/services/api/user-credentials-service");
    mockedGetUserCredentials =
      (credModule as any).__mockGetUserCredentials ||
      (credModule.getUserCredentials as ReturnType<typeof vi.fn>);

    delete process.env.MEXC_API_KEY;
    delete process.env.MEXC_SECRET_KEY;
    process.env.AUTO_SNIPING_HEALTH_USER_ID = "system";
  });

  afterEach(() => {
    process.env.MEXC_API_KEY = originalEnv.MEXC_API_KEY;
    process.env.MEXC_SECRET_KEY = originalEnv.MEXC_SECRET_KEY;
    if (originalEnv.AUTO_SNIPING_HEALTH_USER_ID) {
      process.env.AUTO_SNIPING_HEALTH_USER_ID = originalEnv.AUTO_SNIPING_HEALTH_USER_ID;
    } else {
      delete process.env.AUTO_SNIPING_HEALTH_USER_ID;
    }
  });

  it("treats stored database credentials as valid even when environment variables are missing", async () => {
    const mockCredentials: DecryptedCredentials = {
      apiKey: "db-key",
      secretKey: "db-secret",
      provider: "mexc",
      isActive: true,
    };

    if (
      mockedGetUserCredentials &&
      typeof mockedGetUserCredentials.mockResolvedValue === "function"
    ) {
      mockedGetUserCredentials.mockResolvedValue(mockCredentials);
    }

    const response = await GET({} as NextRequest);
    const body = await response.json();

    expect(response.status).toBe(200);
    if (
      mockedGetUserCredentials &&
      typeof mockedGetUserCredentials.toHaveBeenCalledWith === "function"
    ) {
      expect(mockedGetUserCredentials).toHaveBeenCalledWith("system", "mexc");
    }
    expect(body.success).toBe(true);
    expect(body.data.validation.isValid).toBe(true);
    expect(body.data.validation.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "database",
          status: "valid",
          configured: true,
        }),
      ]),
    );
  });
});
