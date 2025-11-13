# External MEXC Sniper Bot Analysis

## Repositories Analyzed

1. **Habibaeo/mexc-sniper-bot-vultr** - `deployable_sniper_bot_full_with_tp3.py`
2. **Tonoy77/mexc-sniper** - `bot.py` and `main.py`

---

## Key Features & Learnings

### 🚀 **1. Aggressive Order Execution Strategy (Tonoy77)**

**What they do:**
- **Order spam during listing window**: Sends multiple BUY orders rapidly within a 0.5s pre-launch to 0.7s post-launch window
- **First-fill-wins**: Keeps the first filled order, cancels all others
- **Parallel async execution**: Uses `aiohttp` with async/await for concurrent order placement

**Implementation:**
```python
# Pre-launch timing: start 0.5s before target
start = target_time - timedelta(seconds=0.5)
end = target_time + timedelta(seconds=0.7)

# Rapid order spam in loop
while datetime.now(timezone.utc) < end:
    order = await client.new_order(session, symbol, "BUY", "MARKET", buy_amount)
    if "orderId" in order:
        order_ids.append(order["orderId"])
        status = await client.query_order(session, symbol, order["orderId"])
        if status.get("status") == "FILLED":
            filled = status
            break

# Cancel all unfilled orders
for oid in order_ids:
    if oid != filled["orderId"]:
        await client.cancel_order(session, symbol, oid)
```

**Why it works:**
- Maximizes probability of getting filled at launch
- Network latency mitigation through redundancy
- Smart cleanup prevents duplicate positions

**Our current approach:**
- Single order execution at launch time
- No order redundancy or spam strategy

**Recommendation:** ⚠️ **HIGH PRIORITY - Consider implementing with safeguards**
- Add configurable "order burst" mode (disabled by default)
- Implement order cancellation logic
- Add safety limits (max concurrent orders: 3-5)
- Track and log all order IDs for reconciliation

---

### 💰 **2. Quote Order Quantity (Both Repos)**

**What they do:**
- Use `quoteOrderQty` parameter instead of `quantity`
- Specify buy amount in USDT directly (e.g., 100 USDT worth)
- Exchange calculates base quantity automatically

**Implementation:**
```python
params = {
    "symbol": symbol,
    "side": "BUY",
    "type": "MARKET",
    "quoteOrderQty": quote_amount,  # e.g., 100 USDT
    "timestamp": timestamp,
    "recvWindow": 5000
}
```

**Benefits:**
- Simpler position sizing (specify $100 instead of calculating tokens)
- No need for real-time price fetching before order
- Automatic handling of price precision

**Our current approach:**
- Calculate quantity from USDT amount and current price
- Manual precision rounding

**Recommendation:** ✅ **IMPLEMENT**
- Add `quoteOrderQty` support to MEXC client
- Update order execution to use it for MARKET orders
- Keep current approach as fallback for LIMIT orders

---

### 🔄 **3. Listing Detection Retry Logic (Habibaeo)**

**What they do:**
- Continuously retry orders if token not yet tradeable (Error 10007)
- Poll price endpoint until valid price appears
- Configurable retry delay

**Implementation:**
```python
# Wait for token to be live
while True:
    price = get_price(symbol)
    if price is not None and price > 0:
        break
    print(f"⚠️ Token {symbol} not live yet. Retrying...")
    time.sleep(delay)

# Retry order placement if not tradeable
while True:
    order = place_order(...)
    if "code" in order and order["code"] == 10007:
        print(f"⏳ Symbol not yet tradeable (Error 10007). Retrying...")
        time.sleep(delay)
        continue
    break
```

**Why it works:**
- Handles MEXC API inconsistencies (listing announced but trading not enabled)
- Ensures order placement as soon as possible after actual trading start

**Our current approach:**
- Single order attempt at scheduled time
- No retry on specific errors

**Recommendation:** ✅ **IMPLEMENT**
- Add error code detection (10007 = symbol not tradeable)
- Implement retry loop with exponential backoff
- Add max retry limit (e.g., 10 attempts over 30 seconds)
- Log each retry attempt

---

### 📊 **4. Quantity Validation Pipeline (Habibaeo)**

**What they do:**
- Fetch symbol LOT_SIZE filter from exchangeInfo
- Extract stepSize and calculate precision
- Round quantity to valid precision
- Validate against minQty and minNotional

**Implementation:**
```python
# Get precision from step size
def get_lot_size_from_step_size(step_size_str):
    step_size = Decimal(step_size_str)
    return abs(step_size.as_tuple().exponent)

# Round to valid precision
def round_quantity(quantity, precision):
    quant = Decimal(str(quantity))
    return float(quant.quantize(Decimal(f'1e-{precision}')))

# Calculate and validate
raw_qty = budget / price
qty = round_quantity(raw_qty, qty_precision)

if qty < min_qty:
    raise ValueError(f"Quantity {qty} below minQty {min_qty}")

notional = qty * price
if notional < 1.0:
    raise ValueError(f"Order value ${notional} below 1 USDT minimum")
```

**Our current approach:**
- We have precision from symbol data
- May not validate all exchange constraints

**Recommendation:** ✅ **IMPLEMENT**
- Add comprehensive validation before order placement
- Fetch and cache LOT_SIZE filters
- Validate minQty, maxQty, stepSize, minNotional
- Provide clear error messages for validation failures

---

### 🎯 **5. Take Profit Monitoring (Both Repos)**

**What they do:**
- **Continuous price polling** after buy execution
- **Background thread/task** for TP monitoring
- **Immediate market sell** when target price hit
- **Profit calculation** with detailed logging

**Implementation (Tonoy77):**
```python
def monitor_take_profit(self, symbol, qty, buy_price, tp_pct):
    target = buy_price * (1 + tp_pct / 100)
    
    while True:
        price = float(self.http.ticker_price(symbol=symbol)['price'])
        if price >= target:
            # Execute sell
            sell = self.sell_token(symbol, qty)
            
            # Calculate profit
            sell_price = float(status['cummulativeQuoteQty']) / float(status['executedQty'])
            profit = (sell_price - buy_price) * qty
            self.logger.info(f"Profit: {profit:.6f} USDT ({(sell_price/buy_price - 1)*100:.2f}%)")
            break
        time.sleep(0.1)  # Poll every 100ms
```

**Threading approach:**
```python
threading.Thread(
    target=self.monitor_take_profit,
    args=(symbol, qty, price, tp_pct),
    daemon=True
).start()
```

**Our current approach:**
- We have auto-exit-manager with database-driven monitoring
- More sophisticated but potentially slower

**Recommendation:** 🔄 **ENHANCE EXISTING**
- Keep database-driven approach for reliability
- Add fast-path price monitoring (WebSocket or rapid polling)
- Implement tiered TP levels (TP1: 5%, TP2: 10%, TP3: 20%)
- Add partial exit strategy (sell 50% at TP1, 30% at TP2, 20% at TP3)

---

### ⏱️ **6. Precise Timing Strategy (Tonoy77)**

**What they do:**
- **Pre-execution window**: Start 0.5s before launch time
- **Post-execution window**: Continue until 0.7s after launch
- **Tight polling loop**: 5ms sleep between attempts
- **Timezone handling**: Convert from local (Asia/Dhaka) to UTC

**Implementation:**
```python
start = target_time - timedelta(seconds=0.5)
end = target_time + timedelta(seconds=0.7)

while datetime.now(timezone.utc) < start:
    await asyncio.sleep(0.005)  # 5ms precision

# Execute in window
while datetime.now(timezone.utc) < end:
    if filled:
        break
    # ... place orders
```

**Our current approach:**
- Execute within 5 seconds of launch time (broader window)
- Check every 1 second

**Recommendation:** ✅ **IMPLEMENT**
- Add configurable pre-launch offset (default: 0.5s)
- Add configurable execution window (default: 0.7s post-launch)
- Reduce polling interval to 100ms during execution window
- Add timezone configuration for different markets

---

### 🛡️ **7. Error Handling & Logging**

**What they do (Habibaeo):**
- **Debug-friendly output**: Print intermediate calculations
- **Step-by-step validation**: Show price, quantity, notional value
- **Clear error messages**: Explain exactly what went wrong

**Implementation:**
```python
print(f"💰 Price used for Qty calculation: {price}")
print(f"💸 Budget: {budget}")
print(f"🧮 Raw Quantity = {raw_qty}")
print(f"🔢 Step Size: {step_size}, Qty Precision: {qty_precision}")
print(f"🎯 Rounded Quantity: {qty}")
print(f"📦 Order Preview => Type: {order_type}, Qty: {qty}, Price: {price}")
```

**Our current approach:**
- Structured logging with console
- Less verbose intermediate steps

**Recommendation:** 🔄 **ENHANCE**
- Add debug mode with verbose calculation logging
- Log all validation steps
- Add order preview before execution
- Keep detailed audit trail in database

---

### 🔐 **8. API Client Design (Tonoy77)**

**What they do:**
- **Async HTTP client** with connection pooling
- **Session reuse** for multiple requests
- **Signature generation** on every request
- **5000ms receive window** for clock sync tolerance

**Implementation:**
```python
class AsyncMexcClient:
    def __init__(self, api_key, api_secret):
        self.base_url = "https://api.mexc.com"
        
    async def new_order(self, session, symbol, side, order_type, quote_order_qty):
        params = {
            # ...
            "recvWindow": 5000  # Clock tolerance
        }
        params["signature"] = self._sign(params)
        
        async with session.post(url, params=params, headers=headers) as resp:
            return await resp.json()
```

**Our current approach:**
- Synchronous REST client
- Individual requests without connection pooling

**Recommendation:** ⚠️ **MEDIUM PRIORITY**
- Consider async MEXC client for high-speed operations
- Implement connection pooling for better performance
- Add configurable recvWindow (default: 5000ms)
- Keep sync client for non-critical operations

---

## Implementation Priority Matrix

| Priority | Feature | Impact | Complexity | Timeline |
|----------|---------|--------|------------|----------|
| 🔴 HIGH | Quote Order Quantity | High | Low | 1-2 hours |
| 🔴 HIGH | Listing Detection Retry | High | Low | 2-3 hours |
| 🔴 HIGH | Quantity Validation Pipeline | High | Medium | 3-4 hours |
| 🔴 HIGH | Precise Timing Strategy | High | Medium | 3-4 hours |
| 🟡 MEDIUM | Order Spam Strategy | Very High | High | 6-8 hours |
| 🟡 MEDIUM | Async API Client | Medium | High | 8-10 hours |
| 🟢 LOW | Enhanced Logging | Medium | Low | 2-3 hours |
| 🟢 LOW | Tiered Take Profit | Medium | Medium | 4-5 hours |

---

## Risk Assessment

### Order Spam Strategy ⚠️
**Risks:**
- Multiple simultaneous fills (if cancellation fails)
- Exchange rate limiting
- API key suspension for abuse
- Increased fees from multiple orders

**Mitigations:**
- Max concurrent orders limit (3-5)
- Immediate cancellation of unfilled orders
- Transaction reconciliation system
- User opt-in with warnings
- Rate limit monitoring

---

## Quick Wins (Can Implement Today)

### 1. Quote Order Quantity (2 hours)
```typescript
// Add to MEXC client
interface MarketOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  quoteOrderQty?: number;  // NEW: Specify in USDT
  quantity?: number;        // Existing
}
```

### 2. Error 10007 Retry Logic (2 hours)
```typescript
async function executeWithRetry(orderFn: () => Promise<Order>, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const order = await orderFn();
      if (order.code === 10007) {
        console.warn(`⏳ Symbol not tradeable (${i+1}/${maxRetries})`);
        await sleep(2000 * Math.pow(1.5, i)); // Exponential backoff
        continue;
      }
      return order;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
}
```

### 3. Precise Timing (3 hours)
```typescript
const LAUNCH_OFFSET_MS = -500; // Start 0.5s before
const EXECUTION_WINDOW_MS = 700; // Continue 0.7s after

const startTime = new Date(launchTime.getTime() + LAUNCH_OFFSET_MS);
const endTime = new Date(launchTime.getTime() + EXECUTION_WINDOW_MS);

while (Date.now() < startTime.getTime()) {
  await sleep(100); // Tight poll
}

// Execute in window
```

---

## Testing Strategy

### Unit Tests
- [ ] Quote order quantity parameter handling
- [ ] Retry logic with mock API responses
- [ ] Quantity validation with various step sizes
- [ ] Timing precision (mock Date.now())

### Integration Tests
- [ ] End-to-end snipe with testnet
- [ ] Order cancellation flow
- [ ] Multi-order reconciliation
- [ ] Error recovery scenarios

### Performance Tests
- [ ] Order execution latency benchmarks
- [ ] Concurrent order handling
- [ ] WebSocket vs REST polling comparison

---

## Next Steps

1. **Immediate Actions** (Today):
   - ✅ Create this analysis document
   - ⏳ Implement quote order quantity
   - ⏳ Add Error 10007 retry logic
   - ⏳ Enhance timing precision

2. **This Week**:
   - Comprehensive quantity validation
   - Enhanced debugging logs
   - Integration tests for new features

3. **Next Week**:
   - Evaluate order spam strategy (with safeguards)
   - Consider async client migration
   - Implement tiered take profit

4. **Future Considerations**:
   - WebSocket price feeds for faster TP monitoring
   - Multi-exchange support architecture
   - Advanced position sizing algorithms
