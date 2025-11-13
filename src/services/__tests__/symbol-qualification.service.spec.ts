import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mexcSymbols } from "@/src/db/schema";
import { cacheTradingRules } from "@/src/services/symbol-qualification.service";

// Mock database - use factory function to avoid hoisting issues
vi.mock("@/src/db", () => {
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockSet = vi.fn().mockReturnThis();
  const mockWhere = vi.fn().mockReturnThis();

  return {
    db: {
      insert: mockInsert,
      update: mockUpdate,
    },
    // Export mocks for use in tests
    __mockInsert: mockInsert,
    __mockUpdate: mockUpdate,
    __mockSet: mockSet,
    __mockWhere: mockWhere,
  };
});
vi.mock("@/src/services/api/mexc-unified-exports", () => ({
  getRecommendedMexcService: vi.fn(),
}));

// Import db after mocking to get the mocked version
const { db } = await import("@/src/db");

describe("SymbolQualificationService", () => {
  let mockInsert: ReturnType<typeof vi.fn>;
  let mockUpdate: ReturnType<typeof vi.fn>;
  let mockSet: ReturnType<typeof vi.fn>;
  let mockWhere: ReturnType<typeof vi.fn>;
  let mockOnConflictDoUpdate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    // Get mocks from mocked module
    const dbModule = await import("@/src/db");
    mockInsert = (dbModule as any).__mockInsert || (db.insert as ReturnType<typeof vi.fn>);
    mockUpdate = (dbModule as any).__mockUpdate || (db.update as ReturnType<typeof vi.fn>);
    mockSet = (dbModule as any).__mockSet || vi.fn().mockReturnThis();
    mockWhere = (dbModule as any).__mockWhere || vi.fn().mockReturnThis();
    mockOnConflictDoUpdate = vi.fn().mockImplementation((config: unknown) => ({
      set: config,
    }));

    if (mockUpdate && typeof mockUpdate.mockReturnValue === "function") {
      mockUpdate.mockReturnValue({
        set: mockSet,
        where: mockWhere,
      });
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("cacheTradingRules", () => {
    it("updates lastQualifiedAt when re-qualifying an existing symbol", async () => {
      const now = new Date("2025-01-01T12:00:00Z");
      vi.useFakeTimers({ now });

      const payload = {
        symbol: "TESTUSDT",
        status: "TRADING",
        isApiTradable: true,
        isSpotTradingAllowed: true,
        isMarginTradingAllowed: false,
        baseAsset: "TEST",
        quoteAsset: "USDT",
        baseAssetPrecision: 4,
        quotePrecision: 4,
        quoteAssetPrecision: 4,
        baseSizePrecision: "0.0001",
        quoteAmountPrecision: "5",
        quoteAmountPrecisionMarket: "5",
        orderTypes: '["LIMIT","MARKET"]',
        exchangeInfoFetchedAt: now,
      };

      // Mock insert to throw a unique constraint violation (simulating existing symbol)
      const uniqueConstraintError = new Error("Unique constraint violation") as unknown as {
        code: string;
      };
      uniqueConstraintError.code = "23505";

      // Set up mock chain: insert().values() throws error
      const mockValuesFn = vi.fn().mockRejectedValueOnce(uniqueConstraintError);
      mockInsert.mockReturnValueOnce({
        values: mockValuesFn,
        onConflictDoUpdate: mockOnConflictDoUpdate,
      });

      // Set up update chain: update().set().where()
      const mockWhereFn = vi.fn().mockReturnThis();
      const mockSetFn = vi.fn().mockReturnValue({ where: mockWhereFn });
      mockUpdate.mockReturnValueOnce({
        set: mockSetFn,
        where: mockWhereFn,
      });

      try {
        await cacheTradingRules(payload);

        // Verify insert was attempted with lastQualifiedAt
        expect(db.insert).toHaveBeenCalledWith(mexcSymbols);

        // Verify update was called after conflict
        expect(mockUpdate).toHaveBeenCalledWith(mexcSymbols);
        expect(mockSetFn).toHaveBeenCalledWith({
          ...payload,
          lastQualifiedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });
        expect(mockWhereFn).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
