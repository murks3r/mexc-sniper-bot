/**
 * Unit tests for AWS SSM Parameter Store Vault
 *
 * @module vault.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – must be set up before importing the module under test
// ---------------------------------------------------------------------------

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-ssm", () => {
  return {
    SSMClient: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    GetParametersByPathCommand: vi.fn().mockImplementation((params) => params),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ssmParam(name: string, value: string) {
  return { Name: name, Value: value, Type: "SecureString" };
}

// ---------------------------------------------------------------------------
// Tests: loadConfig
// ---------------------------------------------------------------------------

describe("vault – loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockSend.mockReset();
    // Clean env vars that our tests touch
    for (const key of [
      "MEXC_API_KEY", "MEXC_SECRET_KEY", "MEXC_BASE_URL",
      "OPENAI_API_KEY",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY",
      "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
      "DATABASE_URL", "CUSTOM_SOME_NEW_PARAM",
    ]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("should inject all mapped SSM parameters into process.env", async () => {
    // Dynamic import so mocks are applied
    const { loadConfig } = await import("../vault");

    mockSend.mockResolvedValueOnce({
      Parameters: [
        ssmParam("/app/mexc-sniper-bot/api-key", "mx-key-123"),
        ssmParam("/app/mexc-sniper-bot/secret-key", "mx-secret-456"),
        ssmParam("/app/mexc-sniper-bot/base-url", "https://api.mexc.com"),
        ssmParam("/app/mexc-sniper-bot/openai/api-key", "sk-openai-789"),
        ssmParam("/app/mexc-sniper-bot/clerk/publishable-key", "pk_test_abc"),
        ssmParam("/app/mexc-sniper-bot/clerk/secret-key", "sk_test_def"),
        ssmParam("/app/mexc-sniper-bot/supabase/url", "https://xyz.supabase.co"),
        ssmParam("/app/mexc-sniper-bot/supabase/anon-key", "anon-key-123"),
        ssmParam("/app/mexc-sniper-bot/supabase/service-role-key", "srv-role-key"),
      ],
      NextToken: undefined,
    });

    await loadConfig();

    expect(process.env.MEXC_API_KEY).toBe("mx-key-123");
    expect(process.env.MEXC_SECRET_KEY).toBe("mx-secret-456");
    expect(process.env.MEXC_BASE_URL).toBe("https://api.mexc.com");
    expect(process.env.OPENAI_API_KEY).toBe("sk-openai-789");
    expect(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe("pk_test_abc");
    expect(process.env.CLERK_SECRET_KEY).toBe("sk_test_def");
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://xyz.supabase.co");
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("anon-key-123");
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe("srv-role-key");
  });

  it("should NOT overwrite existing env vars by default", async () => {
    const { loadConfig } = await import("../vault");
    process.env.MEXC_API_KEY = "existing-key";

    mockSend.mockResolvedValueOnce({
      Parameters: [ssmParam("/app/mexc-sniper-bot/api-key", "new-key-from-ssm")],
      NextToken: undefined,
    });

    await loadConfig();

    expect(process.env.MEXC_API_KEY).toBe("existing-key");
  });

  it("should overwrite existing env vars when overwrite=true", async () => {
    const { loadConfig } = await import("../vault");
    process.env.MEXC_API_KEY = "existing-key";

    mockSend.mockResolvedValueOnce({
      Parameters: [ssmParam("/app/mexc-sniper-bot/api-key", "new-key-from-ssm")],
      NextToken: undefined,
    });

    await loadConfig(true);

    expect(process.env.MEXC_API_KEY).toBe("new-key-from-ssm");
  });

  it("should handle SSM pagination (multiple pages)", async () => {
    const { loadConfig } = await import("../vault");

    // Page 1
    mockSend.mockResolvedValueOnce({
      Parameters: [ssmParam("/app/mexc-sniper-bot/api-key", "key-p1")],
      NextToken: "page-2-token",
    });
    // Page 2
    mockSend.mockResolvedValueOnce({
      Parameters: [ssmParam("/app/mexc-sniper-bot/secret-key", "secret-p2")],
      NextToken: undefined,
    });

    await loadConfig();

    expect(process.env.MEXC_API_KEY).toBe("key-p1");
    expect(process.env.MEXC_SECRET_KEY).toBe("secret-p2");
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("should auto-derive env key for unmapped parameters", async () => {
    const { loadConfig } = await import("../vault");

    mockSend.mockResolvedValueOnce({
      Parameters: [
        ssmParam("/app/mexc-sniper-bot/custom/some-new-param", "custom-value"),
      ],
      NextToken: undefined,
    });

    await loadConfig();

    // custom/some-new-param → CUSTOM_SOME_NEW_PARAM
    expect(process.env.CUSTOM_SOME_NEW_PARAM).toBe("custom-value");
  });

  it("should warn when no parameters are found", async () => {
    const { loadConfig } = await import("../vault");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockSend.mockResolvedValueOnce({
      Parameters: [],
      NextToken: undefined,
    });

    await loadConfig();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Keine SSM-Parameter"),
    );
    warnSpy.mockRestore();
  });

  it("should skip parameters with missing Name or Value", async () => {
    const { loadConfig } = await import("../vault");

    mockSend.mockResolvedValueOnce({
      Parameters: [
        { Name: "/app/mexc-sniper-bot/api-key", Value: undefined },
        { Name: undefined, Value: "some-value" },
        ssmParam("/app/mexc-sniper-bot/secret-key", "valid-secret"),
      ],
      NextToken: undefined,
    });

    await loadConfig();

    expect(process.env.MEXC_SECRET_KEY).toBe("valid-secret");
    expect(process.env.MEXC_API_KEY).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: isSsmEnabled
// ---------------------------------------------------------------------------

describe("vault – isSsmEnabled", () => {
  const originalEnv = { ...process.env };

  function setNodeEnv(value: string) {
    Object.defineProperty(process.env, "NODE_ENV", {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    process.env.SSM_CONFIG_ENABLED = originalEnv.SSM_CONFIG_ENABLED;
    setNodeEnv(originalEnv.NODE_ENV ?? "test");
  });

  it('returns true when SSM_CONFIG_ENABLED="true"', async () => {
    const { isSsmEnabled } = await import("../vault");
    process.env.SSM_CONFIG_ENABLED = "true";
    expect(isSsmEnabled()).toBe(true);
  });

  it('returns false when SSM_CONFIG_ENABLED="false"', async () => {
    const { isSsmEnabled } = await import("../vault");
    process.env.SSM_CONFIG_ENABLED = "false";
    expect(isSsmEnabled()).toBe(false);
  });

  it("auto-enables in production", async () => {
    const { isSsmEnabled } = await import("../vault");
    delete process.env.SSM_CONFIG_ENABLED;
    setNodeEnv("production");
    expect(isSsmEnabled()).toBe(true);
  });

  it("auto-enables in staging", async () => {
    const { isSsmEnabled } = await import("../vault");
    delete process.env.SSM_CONFIG_ENABLED;
    setNodeEnv("staging");
    expect(isSsmEnabled()).toBe(true);
  });

  it("is disabled in development by default", async () => {
    const { isSsmEnabled } = await import("../vault");
    delete process.env.SSM_CONFIG_ENABLED;
    setNodeEnv("development");
    expect(isSsmEnabled()).toBe(false);
  });

  it("is disabled in test by default", async () => {
    const { isSsmEnabled } = await import("../vault");
    delete process.env.SSM_CONFIG_ENABLED;
    setNodeEnv("test");
    expect(isSsmEnabled()).toBe(false);
  });
});
