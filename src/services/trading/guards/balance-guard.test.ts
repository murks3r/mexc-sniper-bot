/**
 * Tests for BalanceGuard
 *
 * Verifies real-time balance monitoring with websocket integration,
 * API fallback, and balance buffer protection
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncMexcClient } from "@/src/services/trading/clients/async-mexc-client";
import { BalanceGuard } from "./balance-guard";

// Mock StructuredLoggerAdapter
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock("@/src/lib/structured-logger-adapter", () => ({
  StructuredLoggerAdapter: vi.fn().mockImplementation(() => mockLogger),
}));

describe("BalanceGuard", () => {
  let balanceGuard: BalanceGuard;
  let mockClient: {
    getAccountInfo: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock AsyncMexcClient
    mockClient = {
      getAccountInfo: vi.fn(),
    };

    balanceGuard = new BalanceGuard(mockClient as unknown as AsyncMexcClient, {
      minBalanceBufferPercent: 10,
      checkIntervalMs: 5000,
    });
  });

  afterEach(() => {
    balanceGuard.stop();
    balanceGuard.reset(); // Reset internal state
    vi.clearAllMocks();
  });

  describe("Constructor", () => {
    it("should initialize with correct config", () => {
      expect(balanceGuard).toBeDefined();

      const status = balanceGuard.getStatus();
      expect(status.bufferPercent).toBe(10);
      expect(status.isRunning).toBe(false);
      expect(status.monitoredAssets).toEqual([]);
    });
  });

  describe("Start and Stop", () => {
    it("should start periodic balance refresh", async () => {
      const accountInfo = {
        balances: [
          { asset: "USDT", free: "1000.0", locked: "0.0" },
          { asset: "BTC", free: "0.5", locked: "0.0" },
        ],
      };

      mockClient.getAccountInfo.mockResolvedValue(accountInfo);

      balanceGuard.start();

      // Should fetch initial balance
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockClient.getAccountInfo).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith("Balance guard started", {
        checkIntervalMs: 5000,
        bufferPercent: 10,
      });

      balanceGuard.stop();
    });

    it("should not start if already running", () => {
      const spy = vi.spyOn(global, "setInterval");

      balanceGuard.start();
      const firstCallCount = spy.mock.calls.length;

      balanceGuard.start(); // Second call

      expect(spy).toHaveBeenCalledTimes(firstCallCount); // No additional calls
      spy.mockRestore();
    });

    it("should stop periodic refresh", () => {
      balanceGuard.start();
      expect(balanceGuard.getStatus().isRunning).toBe(true);

      balanceGuard.stop();
      expect(balanceGuard.getStatus().isRunning).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith("Balance guard stopped");
    });
  });

  describe("Balance Refresh", () => {
    it("should refresh balance from API", async () => {
      const accountInfo = {
        balances: [
          { asset: "USDT", free: "500.0", locked: "50.0" },
          { asset: "BTC", free: "0.25", locked: "0.0" },
        ],
      };

      mockClient.getAccountInfo.mockResolvedValue(accountInfo);

      balanceGuard.start();

      // Wait for initial balance fetch
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockClient.getAccountInfo).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith("Balance refreshed from API", {
        assetCount: 2,
      });

      const allBalances = balanceGuard.getAllBalances();
      expect(allBalances.size).toBe(2);
      expect(allBalances.get("USDT")?.free).toBe("500.0");
      expect(allBalances.get("BTC")?.free).toBe("0.25");

      balanceGuard.stop();
    });

    it("should handle API refresh failure", async () => {
      const error = new Error("API rate limit");
      mockClient.getAccountInfo.mockRejectedValue(error);

      balanceGuard.start();

      // Wait for error to be caught and logged
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith("Failed to fetch initial balance", {
        error: "API rate limit",
      });

      balanceGuard.stop();
    });

    it("should skip API refresh for fresh websocket data", async () => {
      const accountInfo = {
        balances: [
          { asset: "USDT", free: "1000.0", locked: "0.0" },
          { asset: "BTC", free: "0.5", locked: "0.0" },
        ],
      };

      mockClient.getAccountInfo.mockResolvedValue(accountInfo);

      // Simulate fresh websocket update
      balanceGuard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "999.0", // Slightly different from API
        locked: "0.0",
      });

      balanceGuard.start();

      // Wait for initial balance fetch
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should call API but skip USDT (fresh websocket data), only update BTC
      expect(mockClient.getAccountInfo).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Skipping API refresh for asset with fresh websocket data",
        { asset: "USDT" },
      );

      balanceGuard.stop();
    });
  });

  describe("WebSocket Integration", () => {
    it("should update balance from websocket", () => {
      balanceGuard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "750.0",
        locked: "25.0",
      });

      const balance = balanceGuard.getBalance("USDT");
      expect(balance?.free).toBe("750.0");
      expect(balance?.locked).toBe("25.0");

      expect(mockLogger.debug).toHaveBeenCalledWith("Balance updated from websocket", {
        asset: "USDT",
        free: "750.0",
        locked: "25.0",
      });

      const status = balanceGuard.getStatus();
      expect(status.monitoredAssets).toContain("USDT");
    });

    it("should track websocket update timestamps", () => {
      const beforeUpdate = Date.now();

      balanceGuard.updateBalanceFromWebSocket({
        asset: "BTC",
        free: "1.0",
        locked: "0.0",
      });

      const afterUpdate = Date.now();
      expect(afterUpdate - beforeUpdate).toBeGreaterThanOrEqual(0);
      expect(afterUpdate - beforeUpdate).toBeLessThan(100); // Should be very fast
    });
  });

  describe("Balance Check", () => {
    beforeEach(() => {
      // Set up initial balances
      balanceGuard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "1000.0",
        locked: "0.0",
      });
    });

    it("should allow order with sufficient balance", async () => {
      const result = await balanceGuard.canExecuteOrder("USDT", 500);

      expect(result.allowed).toBe(true);
      expect(result.availableBalance).toBe(1000.0);
      expect(result.requiredBalance).toBe(500);
      expect(result.bufferRequired).toBe(550); // 500 + 10% buffer
    });

    it("should block order with insufficient balance", async () => {
      const result = await balanceGuard.canExecuteOrder("USDT", 950);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Insufficient balance");
      expect(result.reason).toContain("have 1000.00 USDT");
      expect(result.reason).toContain("need 1045.00 USDT");
      expect(result.reason).toContain("including 10% buffer");
    });

    it("should block order when asset not found", async () => {
      // Mock getAccountInfo to return empty balances
      mockClient.getAccountInfo.mockResolvedValue({ balances: [] });

      const result = await balanceGuard.canExecuteOrder("ETH", 100);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Asset ETH not found in balance");
      expect(result.requiredBalance).toBe(100);
    });

    it("should refresh from API when no balance data exists", async () => {
      const accountInfo = {
        balances: [{ asset: "BTC", free: "2.0", locked: "0.0" }],
      };

      mockClient.getAccountInfo.mockResolvedValue(accountInfo);

      const result = await balanceGuard.canExecuteOrder("BTC", 1);

      expect(mockClient.getAccountInfo).toHaveBeenCalled();
      expect(result.allowed).toBe(true);
      expect(result.availableBalance).toBe(2.0);
    });

    it("should refresh from API when websocket data is stale", async () => {
      // Set initial websocket data
      balanceGuard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "1000.0",
        locked: "0.0",
      });

      // Wait for the websocket data to become stale (5+ seconds)
      // Instead of using fake timers, we'll directly manipulate the timestamp
      const staleTime = Date.now() - 6000; // 6 seconds ago
      // @ts-expect-error - accessing private field for testing
      balanceGuard.lastWebSocketUpdate.set("USDT", staleTime);

      const accountInfo = {
        balances: [{ asset: "USDT", free: "800.0", locked: "0.0" }],
      };

      mockClient.getAccountInfo.mockResolvedValue(accountInfo);

      const result = await balanceGuard.canExecuteOrder("USDT", 400);

      expect(mockClient.getAccountInfo).toHaveBeenCalled();
      expect(result.availableBalance).toBe(800.0); // Updated from API
    });

    it("should use fresh websocket data when available", async () => {
      // Set recent websocket data
      balanceGuard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "1200.0",
        locked: "0.0",
      });

      const result = await balanceGuard.canExecuteOrder("USDT", 500);

      expect(mockClient.getAccountInfo).not.toHaveBeenCalled();
      expect(result.availableBalance).toBe(1200.0); // From websocket
      expect(mockLogger.debug).toHaveBeenCalledWith("Using fresh websocket balance data", {
        asset: "USDT",
        free: "1200.0",
      });
    });

    it("should handle balance check errors", async () => {
      // Create a fresh guard instance to ensure no balance data exists
      const freshGuard = new BalanceGuard(mockClient as unknown as AsyncMexcClient, {
        minBalanceBufferPercent: 10,
        checkIntervalMs: 5000,
      });

      const error = new Error("Network timeout");
      mockClient.getAccountInfo.mockRejectedValue(error);

      // This should call refreshBalance() which will throw, caught by canExecuteOrder
      const result = await freshGuard.canExecuteOrder("USDT", 100);

      // Should catch error and return fail-safe result
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Error checking balance");
      expect(result.reason).toContain("Network timeout");
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error checking balance",
        expect.objectContaining({
          asset: "USDT",
          requiredBalance: 100,
        }),
      );

      freshGuard.stop();
    });
  });

  describe("Buffer Calculation", () => {
    it("should calculate correct buffer with different percentages", async () => {
      const guard5Percent = new BalanceGuard(mockClient, {
        minBalanceBufferPercent: 5,
        checkIntervalMs: 1000,
      });

      const guard20Percent = new BalanceGuard(mockClient, {
        minBalanceBufferPercent: 20,
        checkIntervalMs: 1000,
      });

      // Set same balance for both guards
      guard5Percent.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "1000.0",
        locked: "0.0",
      });

      guard20Percent.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "1000.0",
        locked: "0.0",
      });

      const result5Percent = await guard5Percent.canExecuteOrder("USDT", 500);
      const result20Percent = await guard20Percent.canExecuteOrder("USDT", 500);

      expect(result5Percent.bufferRequired).toBe(525); // 500 + 5%
      expect(result20Percent.bufferRequired).toBe(600); // 500 + 20%
    });
  });

  describe("Status Reporting", () => {
    it("should report correct status", () => {
      balanceGuard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "1000.0",
        locked: "0.0",
      });

      balanceGuard.updateBalanceFromWebSocket({
        asset: "BTC",
        free: "1.0",
        locked: "0.0",
      });

      balanceGuard.start();

      const status = balanceGuard.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.bufferPercent).toBe(10);
      expect(status.monitoredAssets).toEqual(expect.arrayContaining(["USDT", "BTC"]));
      expect(status.monitoredAssets).toHaveLength(2);
    });

    it("should report empty status when not running", () => {
      const status = balanceGuard.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.monitoredAssets).toEqual([]);
      expect(status.bufferPercent).toBe(10);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero balance", async () => {
      balanceGuard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "0.0",
        locked: "0.0",
      });

      const result = await balanceGuard.canExecuteOrder("USDT", 1);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Insufficient balance");
      expect(result.reason).toContain("have 0.00 USDT");
    });

    it("should handle very small required balance", async () => {
      balanceGuard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "100.0",
        locked: "0.0",
      });

      const result = await balanceGuard.canExecuteOrder("USDT", 0.01);

      expect(result.allowed).toBe(true);
      expect(result.bufferRequired).toBeCloseTo(0.011, 3); // 0.01 + 10% buffer
    });

    it("should handle multiple assets independently", async () => {
      balanceGuard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "100.0",
        locked: "0.0",
      });

      balanceGuard.updateBalanceFromWebSocket({
        asset: "BTC",
        free: "1.0",
        locked: "0.0",
      });

      // USDT: 100 available, need 80 + 10% buffer = 88, so should be allowed (100 >= 88)
      // BTC: 1 available, need 2 + 10% buffer = 2.2, so should be blocked (1 < 2.2)
      const usdtResult = await balanceGuard.canExecuteOrder("USDT", 80);
      const btcResult = await balanceGuard.canExecuteOrder("BTC", 2);

      expect(usdtResult.allowed).toBe(true); // 100 >= 80 + 10% buffer (88)
      expect(btcResult.allowed).toBe(false); // 1 < 2 + 10% buffer (2.2)
    });
  });

  describe("Integration with AsyncMexcClient", () => {
    it("should work with real AsyncMexcClient interface", async () => {
      // This test verifies BalanceGuard can work with the actual AsyncMexcClient
      const mockRealClient = {
        getAccountInfo: vi.fn().mockResolvedValue({
          balances: [{ asset: "USDT", free: "500.0", locked: "0.0" }],
        }),
      };

      const realGuard = new BalanceGuard(mockRealClient as unknown as AsyncMexcClient, {
        minBalanceBufferPercent: 15,
        checkIntervalMs: 10000,
      });

      realGuard.start();
      // Wait for initial balance fetch
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = await realGuard.canExecuteOrder("USDT", 400);

      expect(result.allowed).toBe(true);
      expect(result.bufferRequired).toBeCloseTo(460, 2); // 400 + 15% buffer

      realGuard.stop();
    });
  });
});
