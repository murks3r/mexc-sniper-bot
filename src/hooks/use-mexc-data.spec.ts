import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMexcCalendar, useMexcSymbols, useMexcServerTime } from "./use-mexc-data";

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

// Create a test wrapper component
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useMexcCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch calendar data successfully", async () => {
    const mockData = [
      { symbol: "BTCUSDT", launchTime: "2024-01-01T00:00:00Z" },
      { symbol: "ETHUSDT", launchTime: "2024-01-02T00:00:00Z" },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockData }),
    });

    const { result } = renderHook(() => useMexcCalendar(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith("/api/mexc/calendar", {
      credentials: "include",
    });
  });

  it("should handle API errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const { result } = renderHook(() => useMexcCalendar(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("HTTP 500: Internal Server Error");
  });

  it("should handle API response errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        error: "API rate limit exceeded"
      }),
    });

    const { result } = renderHook(() => useMexcCalendar(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("API rate limit exceeded");
  });

  it("should respect enabled option", async () => {
    const { result } = renderHook(() => useMexcCalendar({ enabled: false }), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("useMexcSymbols", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch all symbols when no vcoinId provided", async () => {
    const mockData = [
      { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" },
      { symbol: "ETHUSDT", baseAsset: "ETH", quoteAsset: "USDT" },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockData }),
    });

    const { result } = renderHook(() => useMexcSymbols(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith("/api/mexc/symbols", {
      credentials: "include",
    });
  });

  it("should fetch symbols for specific vcoinId", async () => {
    const mockData = [
      { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockData }),
    });

    const { result } = renderHook(() => useMexcSymbols("BTC"), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith("/api/mexc/symbols?vcoinId=BTC", {
      credentials: "include",
    });
  });
});

describe("useMexcServerTime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch server time successfully", async () => {
    const mockData = { serverTime: 1640995200000 };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockData }),
    });

    const { result } = renderHook(() => useMexcServerTime(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith("/api/mexc/server-time", {
      credentials: "include",
    });
  });
});
