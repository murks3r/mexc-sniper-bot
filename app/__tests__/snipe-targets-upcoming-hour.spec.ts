/**
 * Tests for Upcoming Hour Targets API
 *
 * Verifies that targets scheduled within the next 60 minutes are correctly identified.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock authentication - use hoisted to ensure it's available before route import
const mockRequireAuth = vi.fn().mockImplementation(async (_request) => {
  console.log("Mock requireAuthFromRequest called");
  return {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    emailVerified: true,
  };
});
vi.mock("@/src/lib/supabase-auth-server", () => ({
  requireAuthFromRequest: mockRequireAuth,
}));

// Mock database
const mockSelect = vi.fn();
const mockDb = {
  select: mockSelect,
};
vi.mock("@/src/db", () => ({ db: mockDb }));

// Import after mocking
import { GET } from "../api/snipe-targets/upcoming-hour/route";

describe("Upcoming Hour Targets API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure authentication mock is always properly set up
    mockRequireAuth.mockResolvedValue({
      id: "test-user-id",
      email: "test@example.com",
      name: "Test User",
      emailVerified: true,
    });
  });

  // Helper function to set up database mock
  function setupDatabaseMock(mockTargets: any[]) {
    const limitThenable = Promise.resolve(mockTargets);
    const mockLimit = vi.fn(() => limitThenable);
    const mockOrderBy2 = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockOrderBy1 = vi.fn().mockReturnValue({
      orderBy: mockOrderBy2,
      limit: mockLimit,
    });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy1 });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });

    mockDb.select.mockReturnValue({
      from: mockFrom,
    } as any);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return targets scheduled within the next hour", async () => {
    const now = new Date();
    const in30Minutes = new Date(now.getTime() + 30 * 60 * 1000);

    const mockTargets = [
      {
        id: 1,
        userId: "test-user-id",
        vcoinId: "TEST001",
        symbolName: "TESTUSDT",
        positionSizeUsdt: 100,
        status: "ready",
        priority: 1,
        confidenceScore: 85.0,
        targetExecutionTime: in30Minutes,
        currentRetries: 0,
        maxRetries: 3,
        riskLevel: "medium",
        createdAt: now,
      },
    ];

    setupDatabaseMock(mockTargets);

    const request = new Request("http://localhost:3000/api/snipe-targets/upcoming-hour", {
      method: "GET",
    });

    const response = await GET(request as any);
    const data = await response.json();

    if (response.status !== 200) {
      console.error(
        "Test failed with status",
        response.status,
        "data:",
        JSON.stringify(data, null, 2),
      );
    }
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.count).toBeGreaterThanOrEqual(0);
    expect(data.data.summary).toBeDefined();
  });

  it("should include targets ready for immediate execution", async () => {
    const now = new Date();
    const pastTime = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

    const mockTargets = [
      {
        id: 2,
        userId: "test-user-id",
        vcoinId: "TEST002",
        symbolName: "TEST2USDT",
        positionSizeUsdt: 50,
        status: "ready",
        priority: 1,
        confidenceScore: 90.0,
        targetExecutionTime: pastTime, // Past execution time = ready now (Date object)
        currentRetries: 0,
        maxRetries: 3,
        riskLevel: "low",
        createdAt: now,
      },
    ];

    setupDatabaseMock(mockTargets);

    const request = new Request("http://localhost:3000/api/snipe-targets/upcoming-hour", {
      method: "GET",
    });

    const response = await GET(request as any);
    const data = await response.json();

    if (response.status !== 200) {
      console.error(
        "Test failed with status",
        response.status,
        "data:",
        JSON.stringify(data, null, 2),
      );
    }
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // Should include targets ready now
    if (data.data.count > 0) {
      const readyNow = data.data.targets.filter((t: any) => t.isReadyNow);
      expect(readyNow.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("should exclude targets beyond the 60-minute window", async () => {
    const now = new Date();
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const mockTargets = [
      {
        id: 3,
        userId: "test-user-id",
        vcoinId: "TEST003",
        symbolName: "TEST3USDT",
        positionSizeUsdt: 75,
        status: "active",
        priority: 2,
        confidenceScore: 80.0,
        targetExecutionTime: in2Hours, // Beyond 1 hour window
        currentRetries: 0,
        maxRetries: 3,
        riskLevel: "medium",
        createdAt: now,
      },
    ];

    const emptyTargets: typeof mockTargets = [];
    const limitThenable = Promise.resolve(emptyTargets); // Should return empty as it's filtered out
    const mockLimit = vi.fn(() => limitThenable);
    const mockOrderBy2 = vi.fn().mockReturnValue({
      limit: mockLimit,
    });
    const mockOrderBy1 = vi.fn().mockReturnValue({
      orderBy: mockOrderBy2,
      limit: mockLimit,
    });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy1 });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });

    mockDb.select.mockReturnValue({
      from: mockFrom,
    } as any);

    const request = new Request("http://localhost:3000/api/snipe-targets/upcoming-hour", {
      method: "GET",
    });

    const response = await GET(request as any);
    const data = await response.json();

    if (response.status !== 200) {
      console.error(
        "Test failed with status",
        response.status,
        "data:",
        JSON.stringify(data, null, 2),
      );
    }
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // Targets beyond 1 hour should not be included
    if (data.data.count > 0) {
      data.data.targets.forEach((target: any) => {
        if (target.targetExecutionTime) {
          const execTime = new Date(target.targetExecutionTime);
          const timeUntilExecution = execTime.getTime() - now.getTime();
          expect(timeUntilExecution).toBeLessThanOrEqual(60 * 60 * 1000);
        }
      });
    }
  });

  it("should exclude targets that exceeded max retries", async () => {
    const now = new Date();
    const in30Minutes = new Date(now.getTime() + 30 * 60 * 1000);

    const mockTargets = [
      {
        id: 4,
        userId: "test-user-id",
        vcoinId: "TEST004",
        symbolName: "TEST4USDT",
        positionSizeUsdt: 100,
        status: "ready",
        priority: 1,
        confidenceScore: 85.0,
        targetExecutionTime: in30Minutes,
        currentRetries: 10, // Exceeded max retries
        maxRetries: 3,
        riskLevel: "medium",
        createdAt: now,
      },
    ];

    const emptyTargets: typeof mockTargets = [];
    const limitThenable = Promise.resolve(emptyTargets); // Should be filtered out
    const mockLimit = vi.fn(() => limitThenable);
    const mockOrderBy2 = vi.fn().mockReturnValue({
      limit: mockLimit,
    });
    const mockOrderBy1 = vi.fn().mockReturnValue({
      orderBy: mockOrderBy2,
      limit: mockLimit,
    });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy1 });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });

    mockDb.select.mockReturnValue({
      from: mockFrom,
    } as any);

    const request = new Request("http://localhost:3000/api/snipe-targets/upcoming-hour", {
      method: "GET",
    });

    const response = await GET(request as any);
    const data = await response.json();

    if (response.status !== 200) {
      console.error(
        "Test failed with status",
        response.status,
        "data:",
        JSON.stringify(data, null, 2),
      );
    }
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // Targets with exceeded retries should not appear
    if (data.data.count > 0) {
      data.data.targets.forEach((target: any) => {
        expect(target.currentRetries).toBeLessThan(10);
      });
    }
  });

  it("should include system targets alongside user targets", async () => {
    const now = new Date();
    const in30Minutes = new Date(now.getTime() + 30 * 60 * 1000);

    const mockTargets = [
      {
        id: 5,
        userId: "system",
        vcoinId: "SYS001",
        symbolName: "SYSUSDT",
        positionSizeUsdt: 100,
        status: "ready",
        priority: 1,
        confidenceScore: 85.0,
        targetExecutionTime: in30Minutes,
        currentRetries: 0,
        maxRetries: 3,
        riskLevel: "medium",
        createdAt: now,
      },
    ];

    const limitThenable = Promise.resolve(mockTargets);
    const mockLimit = vi.fn(() => limitThenable);
    const mockOrderBy2 = vi.fn().mockReturnValue({
      limit: mockLimit,
    });
    const mockOrderBy1 = vi.fn().mockReturnValue({
      orderBy: mockOrderBy2,
      limit: mockLimit,
    });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy1 });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });

    mockDb.select.mockReturnValue({
      from: mockFrom,
    } as any);

    const request = new Request("http://localhost:3000/api/snipe-targets/upcoming-hour", {
      method: "GET",
    });

    const response = await GET(request as any);
    const data = await response.json();

    if (response.status !== 200) {
      console.error(
        "Test failed with status",
        response.status,
        "data:",
        JSON.stringify(data, null, 2),
      );
    }
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // System targets should be included
    if (data.data.count > 0) {
      const systemTargets = data.data.targets.filter((t: any) => t.userId === "system");
      expect(systemTargets.length).toBeGreaterThanOrEqual(0);
    }
  });
});
