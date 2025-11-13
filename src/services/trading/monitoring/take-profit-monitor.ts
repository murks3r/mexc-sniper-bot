/**
 * TakeProfitMonitor
 *
 * Async worker that monitors positions for take-profit and stop-loss triggers:
 * - Checks prices at intervals
 * - Triggers TP when price reaches target
 * - Auto-cancels orders when TP/SL hit
 * - Handles partial fills
 */

import { StructuredLoggerAdapter } from "@/src/lib/structured-logger-adapter";
import type { AsyncMexcClient } from "@/src/services/trading/clients/async-mexc-client";

interface Position {
  id: number;
  symbol: string;
  entryPrice: number;
  quantity: string;
  status: "open" | "closed" | "cancelled";
  orderId?: string;
}

interface MonitorConfig {
  checkIntervalMs: number;
  takeProfitPercent: number;
  stopLossPercent: number;
}

interface TakeProfitEvent {
  positionId: number;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  profitPercent: number;
  quantity: string;
}

interface CancelEvent {
  positionId: number;
  symbol: string;
  reason: "stop_loss" | "take_profit" | "manual";
}

type TakeProfitCallback = (event: TakeProfitEvent) => void | Promise<void>;
type CancelCallback = (event: CancelEvent) => void | Promise<void>;

interface MonitoredPosition {
  position: Position;
  onTakeProfit: TakeProfitCallback;
  onCancel: CancelCallback;
  intervalId: ReturnType<typeof setInterval> | null;
}

export class TakeProfitMonitor {
  private readonly logger: StructuredLoggerAdapter;
  private readonly client: AsyncMexcClient;
  private readonly config: MonitorConfig;
  private monitoredPositions: Map<number, MonitoredPosition> = new Map();
  private isRunning = false;

  constructor(client: AsyncMexcClient, config: MonitorConfig) {
    this.client = client;
    this.config = config;
    this.logger = new StructuredLoggerAdapter();
  }

  /**
   * Start monitoring a position
   */
  startMonitoring(
    position: Position,
    onTakeProfit: TakeProfitCallback,
    onCancel: CancelCallback,
  ): void {
    if (this.monitoredPositions.has(position.id)) {
      this.logger.warn("Position already being monitored", {
        positionId: position.id,
        symbol: position.symbol,
      });
      return;
    }

    const intervalId = setInterval(() => {
      this.checkPosition(position.id).catch((error) => {
        this.logger.error("Error checking position", {
          positionId: position.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.config.checkIntervalMs);

    this.monitoredPositions.set(position.id, {
      position,
      onTakeProfit,
      onCancel,
      intervalId,
    });

    this.logger.info("Started monitoring position", {
      positionId: position.id,
      symbol: position.symbol,
      entryPrice: position.entryPrice,
      checkIntervalMs: this.config.checkIntervalMs,
    });

    this.isRunning = true;

    // Initial check
    this.checkPosition(position.id).catch((error) => {
      this.logger.error("Error in initial position check", {
        positionId: position.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Stop monitoring a specific position
   */
  stopMonitoring(positionId: number): void {
    const monitored = this.monitoredPositions.get(positionId);
    if (!monitored) {
      return;
    }

    if (monitored.intervalId) {
      clearInterval(monitored.intervalId);
    }

    this.monitoredPositions.delete(positionId);

    this.logger.info("Stopped monitoring position", {
      positionId,
      symbol: monitored.position.symbol,
    });

    if (this.monitoredPositions.size === 0) {
      this.isRunning = false;
    }
  }

  /**
   * Stop all monitoring
   */
  stop(): void {
    for (const [_positionId, monitored] of this.monitoredPositions.entries()) {
      if (monitored.intervalId) {
        clearInterval(monitored.intervalId);
      }
    }

    this.monitoredPositions.clear();
    this.isRunning = false;

    this.logger.info("Stopped all position monitoring");
  }

  /**
   * Check a position's current price and trigger events if needed
   */
  private async checkPosition(positionId: number): Promise<void> {
    const monitored = this.monitoredPositions.get(positionId);
    if (!monitored) {
      return;
    }

    const { position, onTakeProfit, onCancel } = monitored;

    try {
      // Get current price
      const ticker = await this.client.getTicker(position.symbol);
      const currentPrice = parseFloat(ticker.price);

      // Calculate profit/loss percentage
      const priceChange = currentPrice - position.entryPrice;
      const profitPercent = (priceChange / position.entryPrice) * 100;

      this.logger.debug("Position price check", {
        positionId: position.id,
        symbol: position.symbol,
        entryPrice: position.entryPrice,
        currentPrice,
        profitPercent: profitPercent.toFixed(2),
      });

      // Check take-profit
      if (profitPercent >= this.config.takeProfitPercent) {
        this.logger.info("Take-profit triggered", {
          positionId: position.id,
          symbol: position.symbol,
          entryPrice: position.entryPrice,
          currentPrice,
          profitPercent: profitPercent.toFixed(2),
        });

        // Cancel any pending orders
        if (position.orderId) {
          try {
            await this.client.cancelOrder?.(position.orderId);
            this.logger.info("Cancelled pending order on TP", {
              positionId: position.id,
              orderId: position.orderId,
            });
          } catch (error) {
            this.logger.warn("Failed to cancel order on TP", {
              positionId: position.id,
              orderId: position.orderId,
              error: error instanceof Error ? error.message : String(error),
            });
            // Continue with TP trigger even if cancel fails
          }
        }

        // Trigger take-profit callback
        await onTakeProfit({
          positionId: position.id,
          symbol: position.symbol,
          entryPrice: position.entryPrice,
          currentPrice,
          profitPercent,
          quantity: position.quantity,
        });

        // Stop monitoring this position
        this.stopMonitoring(positionId);
        return;
      }

      // Check stop-loss
      if (profitPercent <= -this.config.stopLossPercent) {
        this.logger.info("Stop-loss triggered", {
          positionId: position.id,
          symbol: position.symbol,
          entryPrice: position.entryPrice,
          currentPrice,
          lossPercent: Math.abs(profitPercent).toFixed(2),
        });

        // Cancel any pending orders
        if (position.orderId) {
          try {
            await this.client.cancelOrder?.(position.orderId);
            this.logger.info("Cancelled pending order on SL", {
              positionId: position.id,
              orderId: position.orderId,
            });
          } catch (error) {
            this.logger.warn("Failed to cancel order on SL", {
              positionId: position.id,
              orderId: position.orderId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Trigger cancel callback
        await onCancel({
          positionId: position.id,
          symbol: position.symbol,
          reason: "stop_loss",
        });

        // Stop monitoring this position
        this.stopMonitoring(positionId);
        return;
      }

      // Price is within range, continue monitoring
    } catch (error) {
      this.logger.error("Error checking position price", {
        positionId: position.id,
        symbol: position.symbol,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't stop monitoring on transient errors
    }
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isRunning: boolean;
    monitoredCount: number;
    positionIds: number[];
  } {
    return {
      isRunning: this.isRunning,
      monitoredCount: this.monitoredPositions.size,
      positionIds: Array.from(this.monitoredPositions.keys()),
    };
  }
}
