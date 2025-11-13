/**
 * BalanceGuard Tests
 *
 * Mocks websocket/account updates; ensures guard blocks orders when free balance < required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncMexcClient } from "@/src/services/trading/clients/async-mexc-client";
import { BalanceGuard } from "../balance-guard";

// Helper to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("BalanceGuard", () => {
  let guard: BalanceGuard;
  let mockAsyncClient: {
    getAccountInfo: ReturnType<typeof vi.fn>;
  };
  let _mockWebSocketCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAsyncClient = {
      getAccountInfo: vi.fn(),
    };

    _mockWebSocketCallback = vi.fn();

    guard = new BalanceGuard(mockAsyncClient as unknown as AsyncMexcClient, {
      minBalanceBufferPercent: 5, // 5% buffer
      checkIntervalMs: 100,
    });
  });

  afterEach(() => {
    guard.stop();
  });

  describe("balance checking", () => {
    it("should allow order when sufficient balance available", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "1000", locked: "0" }],
      });

      const requiredBalance = 500; // Need 500 USDT
      const canExecute = await guard.canExecuteOrder("USDT", requiredBalance);

      expect(canExecute.allowed).toBe(true);
      expect(canExecute.reason).toBeUndefined();
      expect(mockAsyncClient.getAccountInfo).toHaveBeenCalled();
    });

    it("should block order when insufficient balance", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "100", locked: "0" }],
      });

      const requiredBalance = 500; // Need 500 USDT, only have 100
      const canExecute = await guard.canExecuteOrder("USDT", requiredBalance);

      expect(canExecute.allowed).toBe(false);
      expect(canExecute.reason?.toLowerCase()).toContain("insufficient");
      expect(canExecute.availableBalance).toBe(100);
      expect(canExecute.requiredBalance).toBe(500);
    });

    it("should account for locked balance", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "600", locked: "400" }],
      });

      // Total: 1000 USDT, but only 600 free
      const requiredBalance = 500;
      const canExecute = await guard.canExecuteOrder("USDT", requiredBalance);

      expect(canExecute.allowed).toBe(true); // 600 free > 500 required
      expect(canExecute.availableBalance).toBe(600);
    });

    it("should respect minimum balance buffer", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "525", locked: "0" }],
      });

      // Need 500, have 525
      // With 5% buffer: need 500 * 1.05 = 525
      // Exactly at buffer limit
      const requiredBalance = 500;
      const canExecute = await guard.canExecuteOrder("USDT", requiredBalance);

      expect(canExecute.allowed).toBe(true);
    });

    it("should block when balance is below buffer threshold", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "520", locked: "0" }],
      });

      // Need 500, have 520
      // With 5% buffer: need 525
      // Below buffer threshold
      const requiredBalance = 500;
      const canExecute = await guard.canExecuteOrder("USDT", requiredBalance);

      expect(canExecute.allowed).toBe(false);
      expect(canExecute.reason).toContain("buffer");
    });
  });

  describe("websocket integration", () => {
    it("should update balance from websocket stream", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "1000", locked: "0" }],
      });

      guard.start();
      await wait(50); // Wait for initial fetch

      // Simulate websocket balance update
      const websocketUpdate = {
        asset: "USDT",
        free: "2000",
        locked: "0",
      };

      guard.updateBalanceFromWebSocket(websocketUpdate);

      // Should use updated balance from websocket (websocket is fresh)
      const canExecute = await guard.canExecuteOrder("USDT", 1500);
      expect(canExecute.allowed).toBe(true);
      expect(canExecute.availableBalance).toBe(2000);
    });

    it("should handle websocket updates for different assets", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [
          { asset: "USDT", free: "1000", locked: "0" },
          { asset: "BTC", free: "0.1", locked: "0" },
        ],
      });

      guard.start();
      await wait(50); // Wait for initial fetch

      // Update BTC balance via websocket (after initial fetch)
      guard.updateBalanceFromWebSocket({
        asset: "BTC",
        free: "0.2",
        locked: "0",
      });

      // USDT should still be from initial fetch (websocket fresh)
      const usdtCheck = await guard.canExecuteOrder("USDT", 500);
      expect(usdtCheck.allowed).toBe(true);
      expect(usdtCheck.availableBalance).toBe(1000);

      // BTC should use websocket update (0.2 free > 0.15 * 1.05 = 0.1575 required with buffer)
      // Note: BTC was in initial response (0.1), websocket updated to 0.2
      // Since balance exists, it checks if websocket is fresh
      const btcCheck = await guard.canExecuteOrder("BTC", 0.15);
      // With 5% buffer: 0.15 * 1.05 = 0.1575, and we have 0.2 (from websocket)
      expect(btcCheck.allowed).toBe(true);
      // Available balance should be from websocket (0.2), not initial API (0.1)
      expect(btcCheck.availableBalance).toBeGreaterThanOrEqual(0.2);
    });

    it("should fallback to API when websocket data is stale", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "1000", locked: "0" }],
      });

      guard.start();

      // Update via websocket
      guard.updateBalanceFromWebSocket({
        asset: "USDT",
        free: "500",
        locked: "0",
      });

      // Manually mark websocket as stale by clearing the timestamp
      // Simulate stale data by waiting and then checking
      await wait(100);

      // Clear websocket update timestamp to simulate stale data
      (guard as any).lastWebSocketUpdate.delete("USDT");

      await wait(100);

      // Force refresh from API (simulating stale websocket data)
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "1500", locked: "0" }],
      });

      const canExecute = await guard.canExecuteOrder("USDT", 1200);
      // Should use API data if websocket is stale
      // 1500 free > 1200 * 1.05 = 1260 required (with buffer)
      expect(canExecute.allowed).toBe(true);
    });
  });

  describe("real-time monitoring", () => {
    it("should periodically refresh balance from API", async () => {
      mockAsyncClient.getAccountInfo
        .mockResolvedValueOnce({
          balances: [{ asset: "USDT", free: "1000", locked: "0" }],
        })
        .mockResolvedValueOnce({
          balances: [{ asset: "USDT", free: "2000", locked: "0" }],
        });

      guard.start();

      // Wait for refresh interval
      await wait(150);

      // Should have called getAccountInfo multiple times
      expect(mockAsyncClient.getAccountInfo.mock.calls.length).toBeGreaterThan(1);
    });

    it("should stop monitoring when stop() is called", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "1000", locked: "0" }],
      });

      guard.start();

      await wait(50);
      const callCountBeforeStop = mockAsyncClient.getAccountInfo.mock.calls.length;

      guard.stop();

      await wait(150);
      const callCountAfterStop = mockAsyncClient.getAccountInfo.mock.calls.length;

      // Should not continue calling after stop
      expect(callCountAfterStop).toBe(callCountBeforeStop);
    });
  });

  describe("edge cases", () => {
    it("should handle missing asset in balance response", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "BTC", free: "0.1", locked: "0" }],
      });

      const canExecute = await guard.canExecuteOrder("USDT", 100);

      expect(canExecute.allowed).toBe(false);
      expect(canExecute.reason).toContain("not found");
    });

    it("should handle API errors gracefully", async () => {
      mockAsyncClient.getAccountInfo.mockRejectedValue(new Error("API error"));

      const canExecute = await guard.canExecuteOrder("USDT", 100);

      // Should default to blocking on error (fail-safe)
      expect(canExecute.allowed).toBe(false);
      expect(canExecute.reason).toContain("error");
    });

    it("should handle zero balance", async () => {
      mockAsyncClient.getAccountInfo.mockResolvedValue({
        balances: [{ asset: "USDT", free: "0", locked: "0" }],
      });

      const canExecute = await guard.canExecuteOrder("USDT", 100);

      expect(canExecute.allowed).toBe(false);
      expect(canExecute.availableBalance).toBe(0);
    });
  });
});
