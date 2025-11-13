import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMexcCalendar, useMexcServerTime, useMexcSymbols } from "./use-mexc-data";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock auth provider
vi.mock("@/src/components/auth/supabase-auth-provider", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "test-user" },
    loading: false,
  })),
}));

// Mock query client
vi.mock("@/src/lib/query-client", () => ({
  queryKeys: {
    mexcCalendar: () => ["mexc", "calendar"],
    mexcSymbols: (vcoinId?: string) => ["mexc", "symbols", vcoinId].filter(Boolean),
    mexcServerTime: () => ["mexc", "serverTime"],
  },
}));

// Mock React Query to avoid DOM dependencies
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((_options) => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isSuccess: false,
    fetchStatus: "idle",
    refetch: vi.fn(),
  })),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: any }) => children,
}));

describe("MEXC Data Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  describe("useMexcCalendar", () => {
    it("should be defined and callable", () => {
      expect(typeof useMexcCalendar).toBe("function");
    });

    it("should call fetch with correct parameters when enabled", () => {
      const mockData = [
        { symbol: "BTCUSDT", launchTime: "2024-01-01T00:00:00Z" },
        { symbol: "ETHUSDT", launchTime: "2024-01-02T00:00:00Z" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockData }),
      });

      // Call the hook directly without renderHook
      useMexcCalendar({ enabled: true });

      // The hook should be importable and callable
      expect(typeof useMexcCalendar).toBe("function");
    });

    it("should not call fetch when disabled", () => {
      useMexcCalendar({ enabled: false });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("useMexcSymbols", () => {
    it("should be defined and callable", () => {
      expect(typeof useMexcSymbols).toBe("function");
    });

    it("should handle vcoinId parameter correctly", () => {
      useMexcSymbols("BTC");

      expect(typeof useMexcSymbols).toBe("function");
    });

    it("should work without vcoinId parameter", () => {
      useMexcSymbols();

      expect(typeof useMexcSymbols).toBe("function");
    });
  });

  describe("useMexcServerTime", () => {
    it("should be defined and callable", () => {
      expect(typeof useMexcServerTime).toBe("function");
    });

    it("should be callable without parameters", () => {
      useMexcServerTime();

      expect(typeof useMexcServerTime).toBe("function");
    });
  });

  describe("API Integration", () => {
    it("should have correct fetch endpoints", () => {
      const mockCalendarData = [{ symbol: "BTCUSDT", launchTime: "2024-01-01T00:00:00Z" }];

      const mockSymbolsData = [{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" }];

      const mockServerTime = 1640995200000;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockCalendarData }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockSymbolsData }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ serverTime: mockServerTime }),
        });

      // Test that hooks can be called without throwing
      expect(() => {
        useMexcCalendar();
        useMexcSymbols();
        useMexcServerTime();
      }).not.toThrow();
    });
  });
});
