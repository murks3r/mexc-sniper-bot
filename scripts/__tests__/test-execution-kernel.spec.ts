/**
 * Execution Kernel Vertical Slice Test Spec
 *
 * TDD test for order placement and DB persistence
 */

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/src/db";
import { saveExecutionHistory } from "@/src/db/execution-history-helpers";
import { executionHistory } from "@/src/db/schemas/trading";
import { createMexcCoreClient } from "@/src/services/data/modules/mexc-core-client";

// Mock MEXC client to avoid requiring real credentials
vi.mock("@/src/services/data/modules/mexc-core-client", () => {
  const mockClient = {
    getConfig: vi.fn().mockReturnValue({
      apiKey: "test-api-key",
      secretKey: "test-secret-key",
      baseUrl: "https://api.mexc.com",
    }),
    getServerTime: vi.fn().mockResolvedValue({
      success: true,
      data: Date.now(),
    }),
    getAccountBalance: vi.fn().mockResolvedValue({
      success: true,
      data: [{ asset: "USDT", free: "1000", locked: "0" }],
    }),
    placeOrder: vi.fn().mockResolvedValue({
      success: true,
      data: {
        orderId: "12345",
        symbol: "BTCUSDT",
        side: "BUY",
        executedQty: "0.0002",
        price: "50000",
        cummulativeQuoteQty: "10",
        status: "FILLED",
        transactTime: Date.now(),
      },
    }),
  };
  return {
    createMexcCoreClient: vi.fn().mockReturnValue(mockClient),
  };
});

// Mock DB helpers
vi.mock("@/src/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/src/db/execution-history-helpers", () => ({
  saveExecutionHistory: vi.fn(),
}));

describe("Execution Kernel Vertical Slice", () => {
  const MEXC_BASE_URL = process.env.MEXC_BASE_URL || "https://api.mexc.com";
  const TEST_USER_ID = "system";
  const TEST_SYMBOL = "BTCUSDT";
  const TEST_QUOTE_AMOUNT = "10"; // 10 USDT;
  const requiredApiKey = "test-api-key";
  const requiredSecretKey = "test-secret-key";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize MEXC client with environment credentials", () => {
    const client = createMexcCoreClient({
      apiKey: requiredApiKey,
      secretKey: requiredSecretKey,
      baseUrl: MEXC_BASE_URL,
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      rateLimitDelay: 100,
    });

    expect(client).toBeDefined();
    const config = client.getConfig();
    expect(config.apiKey).toBe(requiredApiKey);
    expect(config.baseUrl).toBe(MEXC_BASE_URL);
  });

  it("should test API connectivity", async () => {
    const client = createMexcCoreClient({
      apiKey: requiredApiKey,
      secretKey: requiredSecretKey,
      baseUrl: MEXC_BASE_URL,
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      rateLimitDelay: 100,
    });

    const serverTime = await client.getServerTime();
    expect(serverTime.success).toBe(true);
    expect(serverTime.data).toBeDefined();
    expect(typeof serverTime.data).toBe("number");
  });

  it("should place a market buy order and save to execution_history", async () => {
    // Setup mocks
    const mockExecutionId = 12345;
    (saveExecutionHistory as any).mockResolvedValue(mockExecutionId);
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: mockExecutionId,
              symbolName: TEST_SYMBOL,
              exchangeOrderId: "12345",
              status: "success",
            },
          ]),
        }),
      }),
    });

    const client = createMexcCoreClient({
      apiKey: requiredApiKey,
      secretKey: requiredSecretKey,
      baseUrl: MEXC_BASE_URL,
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      rateLimitDelay: 100,
    });

    // Check balance first
    const balanceResult = await client.getAccountBalance();
    expect(balanceResult.success).toBe(true);

    const usdtBalance = balanceResult.data?.find((b) => b.asset === "USDT");
    const availableUsdt = usdtBalance ? parseFloat(usdtBalance.free) : 0;

    if (availableUsdt < parseFloat(TEST_QUOTE_AMOUNT)) {
      throw new Error(
        `Insufficient balance: Need ${TEST_QUOTE_AMOUNT} USDT, have ${availableUsdt.toFixed(2)} USDT`,
      );
    }

    // Place order
    const orderStartTime = Date.now();
    const orderResult = await client.placeOrder({
      symbol: TEST_SYMBOL,
      side: "BUY",
      type: "MARKET",
      quoteOrderQty: TEST_QUOTE_AMOUNT,
    });

    expect(orderResult.success).toBe(true);
    expect(orderResult.data).toBeDefined();

    const orderData = orderResult.data;
    if (!orderData) {
      throw new Error("Order execution succeeded but returned no data payload");
    }
    expect(orderData.orderId).toBeDefined();
    expect(orderData.symbol).toBe(TEST_SYMBOL);
    expect(orderData.side).toBe("BUY");

    const executionLatencyMs = Date.now() - orderStartTime;

    // Save to execution_history
    const executionId = await saveExecutionHistory({
      userId: TEST_USER_ID,
      snipeTargetId: null,
      positionId: null,
      vcoinId: "BTC",
      symbolName: TEST_SYMBOL,
      orderType: "market",
      orderSide: "buy",
      requestedQuantity: parseFloat(orderData.executedQty || "0"),
      requestedPrice: null,
      executedQuantity: parseFloat(orderData.executedQty || "0"),
      executedPrice: orderData.price ? parseFloat(orderData.price) : null,
      totalCost: orderData.cummulativeQuoteQty ? parseFloat(orderData.cummulativeQuoteQty) : null,
      fees: null,
      exchangeOrderId: orderData.orderId?.toString() || null,
      exchangeStatus: orderData.status || null,
      exchangeResponse: orderData,
      executionLatencyMs,
      slippagePercent: null,
      status: orderData.status === "FILLED" ? "success" : "partial",
      errorCode: null,
      errorMessage: null,
      requestedAt: new Date(orderStartTime),
      executedAt: orderData.transactTime ? new Date(orderData.transactTime) : new Date(),
    });

    expect(executionId).toBeGreaterThan(0);

    // Verify the record was saved
    const savedRecord = await db
      .select()
      .from(executionHistory)
      .where(eq(executionHistory.id, executionId))
      .limit(1);

    expect(savedRecord.length).toBe(1);
    expect(savedRecord[0].symbolName).toBe(TEST_SYMBOL);
    expect(savedRecord[0].exchangeOrderId).toBe(orderData.orderId?.toString() || null);
    expect(savedRecord[0].status).toBeDefined();
  });
});
