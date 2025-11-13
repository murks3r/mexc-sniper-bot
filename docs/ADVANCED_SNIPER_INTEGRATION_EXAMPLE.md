# Advanced Sniper Integration Example

This document shows how to integrate the new advanced sniper utilities into your trading bot.

## Features Demonstrated

1. ✅ **Quote Order Quantity** - Already supported in our client
2. ✅ **Error 10007 Retry Logic** - New utility
3. ✅ **Comprehensive Quantity Validation** - New utility
4. ✅ **Precise Timing Strategy** - New utility
5. ⚠️ **Order Spam Strategy** - Advanced (optional, disabled by default)

---

## Basic Integration Example

```typescript
import { createMexcCoreClient } from "@/src/services/data/modules/mexc-core-client";
import {
  executeOrderWithRetry,
  validateAndAdjustQuantity,
  waitForExecutionWindow,
  logQuantityValidation,
  DEFAULT_TIMING_CONFIG,
} from "@/src/services/trading/advanced-sniper-utils";

/**
 * Execute a snipe order with all advanced features
 */
async function executeSniperOrder(params: {
  symbol: string;
  budgetUsdt: number;
  launchTime: Date;
  apiKey: string;
  secretKey: string;
}) {
  const { symbol, budgetUsdt, launchTime, apiKey, secretKey } = params;

  // 1. Initialize MEXC client
  const mexcClient = createMexcCoreClient({
    apiKey,
    secretKey,
    baseUrl: "https://api.mexc.com",
  });

  console.info(`🚀 Preparing to snipe ${symbol} at ${launchTime.toISOString()}`);
  console.info(`💰 Budget: ${budgetUsdt} USDT`);

  // 2. Fetch symbol information for validation
  const symbolInfoResponse = await mexcClient.market.getExchangeInfo();

  if (!symbolInfoResponse.success || !symbolInfoResponse.data?.symbols) {
    throw new Error("Failed to fetch exchange info");
  }

  const symbolInfo = symbolInfoResponse.data.symbols.find((s) => s.symbol === symbol);

  if (!symbolInfo) {
    throw new Error(`Symbol ${symbol} not found on exchange`);
  }

  // 3. Get current price (for validation, not required with quoteOrderQty)
  const priceResponse = await mexcClient.market.getCurrentPrice(symbol);
  const currentPrice = priceResponse.success ? Number.parseFloat(priceResponse.data?.price || "0") : 0;

  if (currentPrice === 0) {
    console.warn("⚠️ Price not available yet. Will use quoteOrderQty instead of quantity.");
  }

  // 4. Validate quantity (optional but recommended for diagnostics)
  if (currentPrice > 0) {
    const rawQuantity = budgetUsdt / currentPrice;
    const validation = validateAndAdjustQuantity(rawQuantity, currentPrice, symbolInfo.filters);

    logQuantityValidation(validation);

    if (!validation.isValid) {
      throw new Error(`Quantity validation failed: ${validation.errors.join(", ")}`);
    }
  }

  // 5. Wait for optimal execution window
  console.info("⏰ Waiting for execution window...");
  const { endTime } = await waitForExecutionWindow(launchTime, {
    preLaunchOffsetMs: -500, // Start 0.5s before launch
    postLaunchWindowMs: 700, // Continue 0.7s after launch
    pollIntervalMs: 100, // Check every 100ms
  });

  console.info("🎯 Execution window opened! Placing order...");

  // 6. Execute order with retry logic (handles Error 10007)
  const orderResult = await executeOrderWithRetry(
    async () => {
      // Use quoteOrderQty for direct USDT amount (no quantity calculation needed)
      return await mexcClient.trading.placeOrder({
        symbol,
        side: "BUY",
        type: "MARKET",
        quantity: "0", // Not used with quoteOrderQty
        quoteOrderQty: budgetUsdt.toString(), // Buy $100 worth
      });
    },
    {
      maxRetries: 10,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 1.5,
    }
  );

  // 7. Check result
  if (!orderResult.success || !orderResult.data) {
    throw new Error(`Order execution failed: ${orderResult.error}`);
  }

  console.info("✅ Order executed successfully!");
  console.info(`📊 Order ID: ${orderResult.data.orderId}`);
  console.info(`📊 Status: ${orderResult.data.status}`);
  console.info(`📊 Executed Qty: ${orderResult.data.executedQty}`);
  console.info(`📊 Average Price: ${orderResult.data.price}`);

  return orderResult.data;
}

// Example usage
const snipeConfig = {
  symbol: "BTCUSDT",
  budgetUsdt: 100,
  launchTime: new Date("2024-01-15T10:00:00Z"),
  apiKey: process.env.MEXC_API_KEY!,
  secretKey: process.env.MEXC_SECRET_KEY!,
};

executeSniperOrder(snipeConfig)
  .then((order) => {
    console.info("🎉 Snipe completed successfully!");
    console.info(JSON.stringify(order, null, 2));
  })
  .catch((error) => {
    console.error("❌ Snipe failed:", error);
  });
```

---

## Advanced: Order Spam Strategy (Use with Extreme Caution)

⚠️ **WARNING**: Only use during critical launch windows with user explicit consent!

```typescript
import {
  executeOrderSpamStrategy,
  waitForExecutionWindow,
  formatExecutionSummary,
  DEFAULT_ORDER_SPAM_CONFIG,
} from "@/src/services/trading/advanced-sniper-utils";

/**
 * Execute aggressive order spam strategy
 * 
 * This sends multiple orders rapidly and keeps only the first filled one.
 * 
 * RISKS:
 * - Multiple fills if cancellation fails
 * - Exchange rate limiting
 * - Account suspension
 * - Increased trading fees
 */
async function executeAggressiveSnipe(params: {
  symbol: string;
  budgetUsdt: number;
  launchTime: Date;
  mexcClient: any; // Your MEXC client instance
  userConsent: boolean; // Must be true to proceed
}) {
  const { symbol, budgetUsdt, launchTime, mexcClient, userConsent } = params;

  if (!userConsent) {
    throw new Error(
      "Order spam strategy requires explicit user consent due to risks!"
    );
  }

  console.warn("⚠️⚠️⚠️ ORDER SPAM STRATEGY ENABLED ⚠️⚠️⚠️");
  console.warn("Multiple orders will be placed! Ensure you understand the risks!");

  // Wait for execution window
  const { endTime } = await waitForExecutionWindow(launchTime);

  // Execute order spam
  const spamResult = await executeOrderSpamStrategy(
    // Order placement function
    async () => {
      return await mexcClient.trading.placeOrder({
        symbol,
        side: "BUY",
        type: "MARKET",
        quantity: "0",
        quoteOrderQty: budgetUsdt.toString(),
      });
    },
    // Order cancellation function
    async (orderId: number) => {
      return await mexcClient.trading.cancelOrder(symbol, orderId);
    },
    // End time
    endTime,
    // Config
    {
      enabled: true, // MUST be explicitly enabled
      maxConcurrentOrders: 3, // Safety limit
      burstIntervalMs: 50, // 50ms between orders
      autoCancel: true, // Auto-cancel unfilled orders
    }
  );

  // Log summary
  console.info(formatExecutionSummary(spamResult));

  if (spamResult.filledOrder) {
    console.info("✅ Aggressive snipe successful!");
    return spamResult.filledOrder;
  } else {
    throw new Error("No orders were filled");
  }
}
```

---

## Integration into Existing Auto-Sniper Hook

Update `src/hooks/use-pattern-sniper.ts`:

```typescript
import {
  executeOrderWithRetry,
  validateAndAdjustQuantity,
  waitForExecutionWindow,
  MEXC_ERROR_CODES,
} from "@/src/services/trading/advanced-sniper-utils";

// Inside executeSnipe callback:
const executeSnipe = useCallback(async (target: TradingTargetDisplay, userId?: string) => {
  // ... existing validation ...

  try {
    // 1. Wait for optimal execution window
    const { endTime } = await waitForExecutionWindow(
      new Date(target.launchTime),
      {
        preLaunchOffsetMs: -500,
        postLaunchWindowMs: 700,
        pollIntervalMs: 100,
      }
    );

    // 2. Execute with retry logic
    const orderResult = await executeOrderWithRetry(
      async () => {
        return await fetch("/api/mexc/trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: `${target.symbol}USDT`,
            side: "BUY",
            type: "MARKET",
            quoteOrderQty: prefs?.defaultBuyAmountUsdt ?? 100,
            userId: actualUserId,
            snipeTargetId,
          }),
        }).then(r => r.json());
      },
      {
        maxRetries: 10,
        initialDelayMs: 1000,
      }
    );

    // 3. Handle result
    if (orderResult.success && orderResult.order) {
      console.info("✅ Snipe executed with advanced features!");
      // ... rest of success handling ...
    }
  } catch (error) {
    console.error("❌ Advanced snipe failed:", error);
    // ... error handling ...
  }
}, []);
```

---

## Server-Side API Route Integration

Update `app/api/mexc/trade/route.ts`:

```typescript
import { executeOrderWithRetry } from "@/src/services/trading/advanced-sniper-utils";

export async function POST(request: Request) {
  const body = await request.json();
  
  // Execute order with built-in retry logic
  const result = await executeOrderWithRetry(
    async () => {
      return await mexcClient.trading.placeOrder({
        symbol: body.symbol,
        side: body.side,
        type: body.type,
        quantity: body.quantity || "0",
        quoteOrderQty: body.quoteOrderQty, // Use USDT amount directly
      });
    },
    {
      maxRetries: 10,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
    }
  );

  return Response.json(result);
}
```

---

## Testing the Integration

### Unit Test Example

```typescript
import { describe, it, expect } from "vitest";
import { executeOrderWithRetry, MEXC_ERROR_CODES } from "../advanced-sniper-utils";

describe("Sniper Integration", () => {
  it("should retry on Error 10007", async () => {
    let attempts = 0;
    const mockOrder = async () => {
      attempts++;
      if (attempts === 1) {
        return {
          success: false,
          data: { code: MEXC_ERROR_CODES.SYMBOL_NOT_TRADEABLE },
        };
      }
      return {
        success: true,
        data: { orderId: 123, status: "FILLED" },
      };
    };

    const result = await executeOrderWithRetry(mockOrder);
    
    expect(result.success).toBe(true);
    expect(attempts).toBe(2);
  });
});
```

---

## Performance Benchmarks

Based on the Python implementations analyzed:

| Metric | Python (Tonoy77) | Our Implementation | Notes |
|--------|------------------|-------------------|-------|
| Pre-launch offset | 0.5s before | Configurable (default 0.5s) | ✅ Matching |
| Post-launch window | 0.7s after | Configurable (default 0.7s) | ✅ Matching |
| Polling interval | 5ms | 100ms (configurable) | ⚠️ Consider reducing to 10-50ms |
| Order spam | 3-5 orders | Optional (max 3-5) | ✅ Matching with safeguards |
| Retry attempts | 10 | Configurable (default 10) | ✅ Matching |

---

## Best Practices

### ✅ DO:
- Use `quoteOrderQty` for simpler position sizing
- Enable retry logic for all snipe orders
- Validate quantities before execution (diagnostic purposes)
- Use precise timing for competitive launches
- Log all execution details for debugging
- Test on testn et first

### ❌ DON'T:
- Enable order spam without user consent
- Use order spam for non-critical trades
- Ignore quantity validation warnings
- Skip error handling
- Hard-code timing parameters (make them configurable)

---

## Migration Checklist

- [ ] Update MEXC client calls to use `quoteOrderQty`
- [ ] Wrap order execution in `executeOrderWithRetry`
- [ ] Add quantity validation for diagnostic logging
- [ ] Implement precise timing with `waitForExecutionWindow`
- [ ] Add comprehensive error logging
- [ ] Create user setting for order spam (disabled by default)
- [ ] Update documentation
- [ ] Add integration tests
- [ ] Performance test on testnet
- [ ] Monitor production execution times

---

## Next Steps

1. **Immediate** (Today):
   - ✅ Integrate `executeOrderWithRetry` into trade route
   - ✅ Add `quoteOrderQty` to order parameters
   - ✅ Implement quantity validation logging

2. **This Week**:
   - Add precise timing to auto-sniper
   - Create user settings for timing parameters
   - Add comprehensive error tracking

3. **Future**:
   - Consider order spam as opt-in feature
   - Implement WebSocket for faster price updates
   - Add performance metrics dashboard

---

## Support & Troubleshooting

### Common Issues

**Q: Order fails with "Symbol not tradeable"**
A: The retry logic will automatically handle this. If it persists after 10 retries, the listing may be delayed.

**Q: Quantity validation fails**
A: Check symbol filters and increase budget. The error message will specify the exact issue (minQty, minNotional, etc.).

**Q: Execution timing seems off**
A: Adjust `preLaunchOffsetMs` and `postLaunchWindowMs` in timing config. Monitor actual execution times and tune accordingly.

**Q: Want to use order spam**
A: Ensure you understand the risks. Enable explicitly in config and get user consent. Start with `maxConcurrentOrders: 2-3`.

---

## References

- [External Sniper Analysis](./EXTERNAL_SNIPER_ANALYSIS.md)
- [MEXC API Documentation](https://mexcdevelop.github.io/apidocs/spot_v3_en/)
- [Original Python Implementation (Tonoy77)](https://github.com/Tonoy77/mexc-sniper)
- [Original Python Implementation (Habibaeo)](https://github.com/Habibaeo/mexc-sniper-bot-vultr)
