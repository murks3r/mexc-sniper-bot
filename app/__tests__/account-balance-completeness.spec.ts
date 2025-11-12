/**
 * Tests for Account Balance API Completeness
 *
 * Verifies that all assets are returned with USDT valuations, including zero balances.
 */

import { describe, expect, it, vi } from "vitest";

// Mock environment variables
vi.hoisted(() => {
  process.env.MEXC_API_KEY = "test-api-key";
  process.env.MEXC_SECRET_KEY = "test-secret-key";
});

// Mock authentication - use hoisted to ensure it's available before route import
const mockRequireAuth = vi.hoisted(() => vi.fn().mockResolvedValue({ 
  id: "test-user-id",
  email: "test@example.com", 
  name: "Test User",
  emailVerified: true
}));
vi.mock("@/src/lib/supabase-auth-server", () => ({
  requireAuthFromRequest: mockRequireAuth,
}));

// Mock MEXC service
const mockGetAccountBalances = vi.hoisted(() => vi.fn());
vi.mock("@/src/services/api/unified-mexc-service-factory", () => ({
  getUnifiedMexcService: vi.fn().mockResolvedValue({
    getAccountBalances: mockGetAccountBalances,
  }),
}));

// Mock other dependencies
vi.mock("@/src/lib/database-circuit-breaker", () => ({
  executeWithCircuitBreaker: vi.fn((fn) => fn()),
}));

vi.mock("@/src/lib/database-query-cache-middleware", () => ({
  withDatabaseQueryCache: vi.fn((fn) => fn),
}));

vi.mock("@/src/lib/database-rate-limiter", () => ({
  executeWithRateLimit: vi.fn((fn) => fn()),
}));

vi.mock("@/src/lib/enhanced-validation-middleware", () => ({
  validateExternalApiResponse: vi.fn(() => ({ success: true })),
}));

// Import after mocking
import { GET } from "../api/account/balance/route";

describe("Account Balance API Completeness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return all assets including zero balances", async () => {
    const mockBalances = {
      success: true,
      data: {
        balances: [
          {
            asset: "USDT",
            free: "100.5",
            locked: "50.25",
            usdtValue: 150.75,
            total: 150.75,
          },
          {
            asset: "BTC",
            free: "0.001",
            locked: "0",
            usdtValue: 45.5,
            total: 0.001,
          },
          {
            asset: "ETH",
            free: "0",
            locked: "0",
            usdtValue: 0,
            total: 0,
          },
          {
            asset: "BNB",
            free: "0.5",
            locked: "0.1",
            usdtValue: 250.3,
            total: 0.6,
          },
        ],
        totalUsdtValue: 446.55,
        lastUpdated: new Date().toISOString(),
      },
      timestamp: Date.now(),
    };

    mockGetAccountBalances.mockResolvedValue(mockBalances);

    const request = new Request("http://localhost:3000/api/account/balance?userId=test-user-id", {
      method: "GET",
    });

    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.balances).toBeDefined();
    expect(Array.isArray(data.data.balances)).toBe(true);

    // Should include all assets, even with zero balances
    const assetNames = data.data.balances.map((b: any) => b.asset);
    expect(assetNames).toContain("USDT");
    expect(assetNames).toContain("BTC");
    expect(assetNames).toContain("ETH"); // Zero balance should still be included
    expect(assetNames).toContain("BNB");

    // All balances should have usdtValue property
    data.data.balances.forEach((balance: any) => {
      expect(balance).toHaveProperty("usdtValue");
      expect(typeof balance.usdtValue).toBe("number");
      expect(balance.usdtValue).toBeGreaterThanOrEqual(0);
    });
  });

  it("should calculate USDT values for all assets", async () => {
    const mockBalances = {
      success: true,
      data: {
        balances: [
          {
            asset: "USDT",
            free: "100",
            locked: "0",
            usdtValue: 100,
            total: 100,
          },
          {
            asset: "BTC",
            free: "0.001",
            locked: "0",
            usdtValue: 45.5,
            total: 0.001,
          },
        ],
        totalUsdtValue: 145.5,
        lastUpdated: new Date().toISOString(),
      },
      timestamp: Date.now(),
    };

    mockGetAccountBalances.mockResolvedValue(mockBalances);

    const request = new Request("http://localhost:3000/api/account/balance?userId=test-user-id", {
      method: "GET",
    });

    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify USDT values are calculated
    const usdtBalance = data.data.balances.find((b: any) => b.asset === "USDT");
    expect(usdtBalance).toBeDefined();
    expect(usdtBalance.usdtValue).toBe(100);

    const btcBalance = data.data.balances.find((b: any) => b.asset === "BTC");
    expect(btcBalance).toBeDefined();
    expect(btcBalance.usdtValue).toBeGreaterThan(0);
  });

  it("should include total portfolio value", async () => {
    const mockBalances = {
      success: true,
      data: {
        balances: [
          {
            asset: "USDT",
            free: "100",
            locked: "50",
            usdtValue: 150,
            total: 150,
          },
          {
            asset: "BTC",
            free: "0.001",
            locked: "0",
            usdtValue: 45.5,
            total: 0.001,
          },
        ],
        totalUsdtValue: 195.5,
        lastUpdated: new Date().toISOString(),
      },
      timestamp: Date.now(),
    };

    mockGetAccountBalances.mockResolvedValue(mockBalances);

    const request = new Request("http://localhost:3000/api/account/balance?userId=test-user-id", {
      method: "GET",
    });

    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.totalUsdtValue).toBeDefined();
    expect(typeof data.data.totalUsdtValue).toBe("number");
    expect(data.data.totalUsdtValue).toBeGreaterThanOrEqual(0);
  });

  it("should report request duration using captured start time", async () => {
    const mockBalances = {
      success: true,
      data: {
        balances: [
          {
            asset: "USDT",
            free: "100",
            locked: "0",
            usdtValue: 100,
            total: 100,
          },
        ],
        totalUsdtValue: 100,
        lastUpdated: new Date().toISOString(),
      },
      timestamp: 1700000000000,
    };

    mockGetAccountBalances.mockResolvedValue(mockBalances);

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockImplementationOnce(() => 1_000);
    nowSpy.mockImplementation(() => 1_450);

    const request = new Request("http://localhost:3000/api/account/balance?userId=test-user-id", {
      method: "GET",
    });

    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metadata).toBeDefined();
    expect(data.metadata.requestDuration).toBe("450ms");

    nowSpy.mockRestore();
  });
});

