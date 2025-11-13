/**
 * EventAuditLog
 *
 * Structured event pipeline that ensures each major lifecycle event emits
 * structuredLogger.info with correlation IDs for observability.
 */

import type { StructuredLoggerAdapter } from "./structured-logger-adapter";

interface OrderPlacedEvent {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: string;
  price: string;
  correlationId?: string;
}

interface OrderFilledEvent {
  orderId: string;
  symbol: string;
  filledQuantity: string;
  filledPrice: string;
  correlationId?: string;
}

interface OrderCancelledEvent {
  orderId: string;
  symbol: string;
  reason: string;
  correlationId?: string;
}

interface ExecutionWindowStartedEvent {
  targetId: number;
  symbol: string;
  windowStart: Date;
  windowEnd: Date;
  correlationId?: string;
}

interface ExecutionWindowEndedEvent {
  targetId: number;
  symbol: string;
  ordersPlaced: number;
  ordersFilled: number;
  correlationId?: string;
}

interface TakeProfitTriggeredEvent {
  positionId: number;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  profitPercent: number;
  correlationId?: string;
}

interface StopLossTriggeredEvent {
  positionId: number;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  lossPercent: number;
  correlationId?: string;
}

interface BalanceCheckBlockedEvent {
  asset: string;
  requiredBalance: number;
  availableBalance: number;
  reason: string;
  correlationId?: string;
}

interface BalanceUpdatedEvent {
  asset: string;
  free: string;
  locked: string;
  correlationId?: string;
}

interface ExecutionErrorEvent {
  targetId: number;
  symbol: string;
  error: string;
  correlationId?: string;
}

/**
 * Generate a correlation ID if not provided
 */
function generateCorrelationId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export class EventAuditLog {
  constructor(private readonly logger: StructuredLoggerAdapter) {}

  /**
   * Log order placed event
   */
  logOrderPlaced(event: OrderPlacedEvent): void {
    this.logger.info("order_placed", {
      orderId: event.orderId,
      symbol: event.symbol,
      side: event.side,
      quantity: event.quantity,
      price: event.price,
      correlationId: event.correlationId || generateCorrelationId(),
    });
  }

  /**
   * Log order filled event
   */
  logOrderFilled(event: OrderFilledEvent): void {
    this.logger.info("order_filled", {
      orderId: event.orderId,
      symbol: event.symbol,
      filledQuantity: event.filledQuantity,
      filledPrice: event.filledPrice,
      correlationId: event.correlationId || generateCorrelationId(),
    });
  }

  /**
   * Log order cancelled event
   */
  logOrderCancelled(event: OrderCancelledEvent): void {
    this.logger.info("order_cancelled", {
      orderId: event.orderId,
      symbol: event.symbol,
      reason: event.reason,
      correlationId: event.correlationId || generateCorrelationId(),
    });
  }

  /**
   * Log execution window started
   */
  logExecutionWindowStarted(event: ExecutionWindowStartedEvent): void {
    this.logger.info("execution_window_started", {
      targetId: event.targetId,
      symbol: event.symbol,
      windowStart: event.windowStart.toISOString(),
      windowEnd: event.windowEnd.toISOString(),
      correlationId: event.correlationId || generateCorrelationId(),
    });
  }

  /**
   * Log execution window ended
   */
  logExecutionWindowEnded(event: ExecutionWindowEndedEvent): void {
    this.logger.info("execution_window_ended", {
      targetId: event.targetId,
      symbol: event.symbol,
      ordersPlaced: event.ordersPlaced,
      ordersFilled: event.ordersFilled,
      correlationId: event.correlationId || generateCorrelationId(),
    });
  }

  /**
   * Log take-profit triggered
   */
  logTakeProfitTriggered(event: TakeProfitTriggeredEvent): void {
    this.logger.info("take_profit_triggered", {
      positionId: event.positionId,
      symbol: event.symbol,
      entryPrice: event.entryPrice,
      exitPrice: event.exitPrice,
      profitPercent: event.profitPercent,
      correlationId: event.correlationId || generateCorrelationId(),
    });
  }

  /**
   * Log stop-loss triggered
   */
  logStopLossTriggered(event: StopLossTriggeredEvent): void {
    this.logger.info("stop_loss_triggered", {
      positionId: event.positionId,
      symbol: event.symbol,
      entryPrice: event.entryPrice,
      exitPrice: event.exitPrice,
      lossPercent: event.lossPercent,
      correlationId: event.correlationId || generateCorrelationId(),
    });
  }

  /**
   * Log balance check blocked
   */
  logBalanceCheckBlocked(event: BalanceCheckBlockedEvent): void {
    this.logger.warn("balance_check_blocked", {
      asset: event.asset,
      requiredBalance: event.requiredBalance,
      availableBalance: event.availableBalance,
      reason: event.reason,
      correlationId: event.correlationId || generateCorrelationId(),
    });
  }

  /**
   * Log balance updated
   */
  logBalanceUpdated(event: BalanceUpdatedEvent): void {
    this.logger.info("balance_updated", {
      asset: event.asset,
      free: event.free,
      locked: event.locked,
      correlationId: event.correlationId || generateCorrelationId(),
    });
  }

  /**
   * Log execution error
   */
  logExecutionError(event: ExecutionErrorEvent): void {
    this.logger.error("execution_error", {
      targetId: event.targetId,
      symbol: event.symbol,
      error: event.error,
      correlationId: event.correlationId || generateCorrelationId(),
    });
  }
}
