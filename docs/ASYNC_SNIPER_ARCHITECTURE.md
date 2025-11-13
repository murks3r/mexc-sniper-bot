# Async Sniper Architecture

## Overview

This document describes the async sniper bot architecture, including the new async infrastructure, order coordination, take-profit monitoring, and balance guard components.

## Architecture Components

### Phase 1: Async Infrastructure & Config

#### AsyncMexcClient

Wrapper around `UnifiedMexcServiceV2` that provides:
- Parallel request dispatch using `Promise.allSettled`
- Concurrency limit enforcement
- Request timeout handling
- Structured logging with correlation IDs

**Usage:**
```typescript
import { AsyncMexcClient } from "@/src/services/trading/clients/async-mexc-client";

const client = new AsyncMexcClient(mexcService, {
  maxConcurrency: 5,
  requestTimeoutMs: 5000,
});

// Parallel requests
const [ticker, accountInfo] = await Promise.allSettled([
  client.getTicker("BTCUSDT"),
  client.getAccountInfo(),
]);
```

#### Configuration Loader

JSON-based configuration with environment variable overrides and hot reload support.

**Config File:** `config/sniper-config.json`

```json
{
  "async": {
    "enabled": true,
    "maxConcurrency": 5,
    "requestTimeoutMs": 5000
  },
  "execution": {
    "retryAttempts": 3,
    "retryDelayMs": 1000
  },
  "takeProfit": {
    "checkIntervalMs": 1000,
    "takeProfitPercent": 10,
    "stopLossPercent": 5
  },
  "balanceGuard": {
    "minBalanceBufferPercent": 5,
    "checkIntervalMs": 5000
  }
}
```

**Usage:**
```typescript
import { loadSniperConfig } from "@/src/config/sniper-config-loader";

const config = await loadSniperConfig();
// Config is validated against Zod schema
// Environment variables override JSON values
```

#### Structured Logging Adapter

Provides contextual payloads (requestId, attempt, latency), auto-generated correlation IDs, and timestamps.

**Usage:**
```typescript
import { StructuredLoggerAdapter } from "@/src/lib/structured-logger-adapter";

const logger = new StructuredLoggerAdapter();
logger.info("order_placed", {
  orderId: "123",
  symbol: "BTCUSDT",
  correlationId: "corr-abc-123",
});
```

### Phase 2: Order Coordination & Error Handling

#### SniperExecutionCoordinator

Time-based orchestration that:
- Waits for execution window
- Handles pre/post window scenarios
- Triggers cancellation when window expires
- Integrates with retry fallback logic

**Usage:**
```typescript
import { SniperExecutionCoordinator } from "@/src/services/trading/coordination/sniper-execution-coordinator";

const coordinator = new SniperExecutionCoordinator(asyncClient, {
  windowStart: new Date("2024-01-01T10:00:00Z"),
  windowEnd: new Date("2024-01-01T10:05:00Z"),
});

const result = await coordinator.executeInWindow(async () => {
  return await placeOrder(...);
});
```

#### Enhanced Retry & Cancellation

Extended retry logic that:
- Registers cancel tokens with coordinator
- Handles chained retries
- Cancels orders when window expires
- Falls back to retry mechanism

### Phase 3: Take-Profit & Balance Management

#### TakeProfitMonitor

Async worker that monitors positions for take-profit and stop-loss triggers:
- Checks prices at configurable intervals
- Triggers TP when price reaches target
- Auto-cancels orders when TP/SL hit
- Handles partial fills

**Usage:**
```typescript
import { TakeProfitMonitor } from "@/src/services/trading/monitoring/take-profit-monitor";

const monitor = new TakeProfitMonitor(asyncClient, {
  checkIntervalMs: 1000,
  takeProfitPercent: 10,
  stopLossPercent: 5,
});

monitor.startMonitoring(position, onTakeProfit, onCancel);
```

#### BalanceGuard

Real-time balance guard that:
- Integrates with websocket stream for real-time updates
- Blocks orders when free balance < required
- Maintains minimum balance buffer
- Periodically refreshes from API as fallback

**Usage:**
```typescript
import { BalanceGuard } from "@/src/services/trading/guards/balance-guard";

const guard = new BalanceGuard(asyncClient, {
  minBalanceBufferPercent: 5,
  checkIntervalMs: 5000,
});

guard.start();

// Update from websocket
guard.updateBalanceFromWebSocket({
  asset: "USDT",
  free: "1000",
  locked: "0",
});

// Check before placing order
const canExecute = await guard.canExecuteOrder("USDT", 500);
if (!canExecute.allowed) {
  // Handle insufficient balance
}
```

### Phase 4: Logging & Observability

#### EventAuditLog

Structured event pipeline that ensures each major lifecycle event emits structured logs with correlation IDs.

**Events:**
- `order_placed` - Order placement
- `order_filled` - Order fill
- `order_cancelled` - Order cancellation
- `execution_window_started` - Execution window start
- `execution_window_ended` - Execution window end
- `take_profit_triggered` - Take-profit trigger
- `stop_loss_triggered` - Stop-loss trigger
- `balance_check_blocked` - Balance check failure
- `balance_updated` - Balance update from websocket
- `execution_error` - Execution error

**Usage:**
```typescript
import { EventAuditLog } from "@/src/lib/event-audit-log";

const auditLog = new EventAuditLog(logger);

auditLog.logOrderPlaced({
  orderId: "123",
  symbol: "BTCUSDT",
  side: "BUY",
  quantity: "0.001",
  price: "50000",
  correlationId: "corr-abc-123",
});
```

## Configuration

### Environment Variables

All configuration values can be overridden via environment variables:

```bash
# Async config
SNIPER_CONFIG_ASYNC_ENABLED=true
SNIPER_CONFIG_ASYNC_MAX_CONCURRENCY=5
SNIPER_CONFIG_ASYNC_REQUEST_TIMEOUT_MS=5000

# Execution config
SNIPER_CONFIG_EXECUTION_RETRY_ATTEMPTS=3
SNIPER_CONFIG_EXECUTION_RETRY_DELAY_MS=1000

# Take-profit config
SNIPER_CONFIG_TAKE_PROFIT_CHECK_INTERVAL_MS=1000
SNIPER_CONFIG_TAKE_PROFIT_TAKE_PROFIT_PERCENT=10
SNIPER_CONFIG_TAKE_PROFIT_STOP_LOSS_PERCENT=5

# Balance guard config
SNIPER_CONFIG_BALANCE_GUARD_MIN_BALANCE_BUFFER_PERCENT=5
SNIPER_CONFIG_BALANCE_GUARD_CHECK_INTERVAL_MS=5000
```

### Hot Reload

Configuration supports hot reloading. Changes to `config/sniper-config.json` are automatically detected and reloaded:

```typescript
const config = await loadSniperConfig();
// Config is automatically reloaded when file changes
```

## Integration Points

### OrderExecutor Integration

```typescript
import { AsyncMexcClient } from "@/src/services/trading/clients/async-mexc-client";
import { SniperExecutionCoordinator } from "@/src/services/trading/coordination/sniper-execution-coordinator";

const asyncClient = new AsyncMexcClient(mexcService, config.async);
const coordinator = new SniperExecutionCoordinator(asyncClient, {
  windowStart: target.windowStart,
  windowEnd: target.windowEnd,
});

// Execute order with coordination
const result = await coordinator.executeInWindow(async () => {
  return await asyncClient.placeOrder(...);
});
```

### PositionManager Integration

```typescript
import { TakeProfitMonitor } from "@/src/services/trading/monitoring/take-profit-monitor";

const monitor = new TakeProfitMonitor(asyncClient, config.takeProfit);

// Start monitoring when position is opened
monitor.startMonitoring(position, (event) => {
  // Handle take-profit
  auditLog.logTakeProfitTriggered(event);
}, (event) => {
  // Handle stop-loss
  auditLog.logStopLossTriggered(event);
});
```

### Balance Guard Integration

```typescript
import { BalanceGuard } from "@/src/services/trading/guards/balance-guard";

const guard = new BalanceGuard(asyncClient, config.balanceGuard);
guard.start();

// Update from websocket stream
websocket.on("balance", (update) => {
  guard.updateBalanceFromWebSocket(update);
  auditLog.logBalanceUpdated(update);
});

// Check before placing order
const canExecute = await guard.canExecuteOrder("USDT", requiredBalance);
if (!canExecute.allowed) {
  auditLog.logBalanceCheckBlocked({
    asset: "USDT",
    requiredBalance,
    availableBalance: canExecute.availableBalance!,
    reason: canExecute.reason!,
  });
  return;
}
```

## Testing

All components follow TDD principles with comprehensive test coverage:

- `src/services/trading/clients/__tests__/async-mexc-client.spec.ts`
- `src/config/__tests__/sniper-config-loader.spec.ts`
- `src/lib/__tests__/structured-logger-adapter.spec.ts`
- `src/services/trading/coordination/__tests__/sniper-execution-coordinator.spec.ts`
- `src/services/trading/monitoring/__tests__/take-profit-monitor.spec.ts`
- `src/services/trading/guards/__tests__/balance-guard.spec.ts`
- `src/lib/__tests__/event-audit-log.spec.ts`

Run tests:
```bash
bun test
```

## Backwards Compatibility

New async components are gated behind configuration toggles until fully verified:

```json
{
  "async": {
    "enabled": false  // Disable async features
  }
}
```

When `async.enabled` is `false`, the system falls back to synchronous execution using the existing `UnifiedMexcServiceV2`.

## Performance Considerations

- **Concurrency Limits**: Configurable max concurrency prevents API rate limiting
- **Request Timeouts**: Prevents hanging requests
- **Websocket Integration**: Real-time balance updates reduce API calls
- **Stale Data Handling**: Automatic fallback to API when websocket data is stale

## Security

- All configuration values are validated against Zod schemas
- Environment variables override JSON config (useful for secrets)
- Balance guard prevents over-trading
- Structured logging includes correlation IDs for audit trails

## Monitoring

All events are logged with structured data and correlation IDs, enabling:
- Request tracing across components
- Performance monitoring
- Error tracking
- Audit trails

Use correlation IDs to trace requests across the entire execution pipeline.

