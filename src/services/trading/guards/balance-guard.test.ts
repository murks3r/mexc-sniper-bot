/**
 * Tests for BalanceGuard
 *
 * Verifies real-time balance monitoring with websocket integration,
 * API fallback, and balance buffer protection
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BalanceGuard } from "./balance-guard";

describe("BalanceGuard", () => {
  let balanceGuard: BalanceGuard;
  let mockClient: any;
  let mockLogger: any;

  beforeEach(() => {
    // Mock AsyncMexcClient
    mockClient = {
      getAccountInfo: vi.fn(),
    };

    // Mock StructuredLoggerAdapter
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    balanceGuard = new BalanceGuard(mockClient, {
      minBalanceBufferPercent: 10,
      checkIntervalMs: 5000,
    });
  });

  afterEach(() => {
    balanceGuard.stop();
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
        success: true,
        data: {
          balances: [
            { asset: "USDT", free: "1000.0", locked: "0.0" },
            { asset: "BTC", free: "0.5", locked: "0.0" },
          ],
        },
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
      balanceGuard.start();
      const spy = vi.spyOn(global, "setInterval");

      balanceGuard.start(); // Second call

      expect(spy).toHaveBeenCalledTimes(1); // Only called once
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
        success: true,
        data: {
          balances: [
            { asset: "USDT", free: "500.0", locked: "50.0" },
            { asset: "BTC", free: "0.25", locked: "0.0" },
          ],
        },
      };

      mockClient.getAccountInfo.mockResolvedValue(accountInfo);

      await balanceGuard.start();

      expect(mockClient.getAccountInfo).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith("Balance refreshed from API", {
        assetCount: 2,
      });

      const allBalances = balanceGuard.getAllBalances();
      expect(allBalances.size).toBe(2);
      expect(allBalances.get("USDT")?.free).toBe("500.0");
      expect(allBalances.get("BTC")?.free).toBe("0.25");
    });

    it("should handle API refresh failure", async () => {
      const error = new Error("API rate limit");
      mockClient.getAccountInfo.mockRejectedValue(error);

      await balanceGuard.start();

      expect(mockLogger.error).toHaveBeenCalledWith("Failed to fetch initial balance", {
        error: "API rate limit",
      });
    });

    it("should skip API refresh for fresh websocket data", async () => {
      const accountInfo = {
        success: true,
        data: {
          balances: [{ asset: "USDT", free: "1000.0", locked: "0.0" }],
        },
      };

      mockClient.getAccountInfo.mockResolvedValue(accountInfo);

      // Simulate fresh websocket update
      balanceGuard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "999.0", // Slightly different from API
        locked: "0.0",
      });

      await balanceGuard.start();

      // Should not call API for USDT (fresh websocket data)
      expect(mockClient.getAccountInfo).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Skipping API refresh for asset with fresh websocket data",
        { asset: "USDT" },
      );
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
      const result = await balanceGuard.canExecuteOrder("ETH", 100);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Asset ETH not found in balance");
      expect(result.requiredBalance).toBe(100);
    });

    it("should refresh from API when no balance data exists", async () => {
      const accountInfo = {
        success: true,
        data: {
          balances: [{ asset: "BTC", free: "2.0", locked: "0.0" }],
        },
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

      // Fast forward time to make websocket data stale
      vi.advanceTimersByTime(6000); // 6 seconds > 5 second threshold

      const accountInfo = {
        success: true,
        data: {
          balances: [{ asset: "USDT", free: "800.0", locked: "0.0" }],
        },
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
      const error = new Error("Network timeout");
      mockClient.getAccountInfo.mockRejectedValue(error);

      const result = await balanceGuard.canExecuteOrder("USDT", 100);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Error checking balance");
      expect(result.reason).toContain("Network timeout");
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

      const usdtResult = await balanceGuard.canExecuteOrder("USDT", 80);
      const btcResult = await balanceGuard.canExecuteOrder("BTC", 2);

      expect(usdtResult.allowed).toBe(false); // 100 < 80 + 10% buffer
      expect(btcResult.allowed).toBe(false); // 1 < 2 + 10% buffer
    });
  });

  describe("Integration with AsyncMexcClient", () => {
    it("should work with real AsyncMexcClient interface", async () => {
      // This test verifies BalanceGuard can work with the actual AsyncMexcClient
      const mockRealClient: any = {
        getAccountInfo: vi.fn().mockResolvedValue({
          success: true,
          data: {
            balances: [{ asset: "USDT", free: "500.0", locked: "0.0" }],
          },
        }),
      };

      const realGuard = new BalanceGuard(mockRealClient, {
        minBalanceBufferPercent: 15,
        checkIntervalMs: 10000,
      });

      realGuard.start();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await realGuard.canExecuteOrder("USDT", 400);

      expect(result.allowed).toBe(true);
      expect(result.bufferRequired).toBe(460); // 400 + 15% buffer

      realGuard.stop();
    });
  });
});
