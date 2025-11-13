/**
 * Auto-Sniping Module - PRIMARY IMPLEMENTATION
 *
 * This is the MAIN auto-sniping implementation for the MEXC Sniper Bot.
 * All other auto-sniping services should use this module to prevent conflicts.
 *
 * Handles auto-sniping execution and monitoring.
 * Extracted from the original monolithic core-trading.service.ts for modularity.
 */

import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/src/db";
import { saveExecutionHistory } from "@/src/db/execution-history-helpers";
import { createPosition, updatePositionOnSell } from "@/src/db/position-helpers";
import { userPreferences as userPreferencesTable } from "@/src/db/schemas/auth";
import { executionHistory, positions, snipeTargets } from "@/src/db/schemas/trading";
import { toSafeError } from "@/src/lib/error-type-utils";
import { executeOrderWithRetry } from "@/src/services/trading/advanced-sniper-utils";
import { tradingStrategyManager } from "@/src/services/trading/trading-strategy-manager";
import { serviceConflictDetector } from "../../service-conflict-detector";
import { OrderExecutor } from "./modules/order-executor";
import type {
  AutoSnipeTarget,
  CoreTradingConfig,
  ModuleContext,
  ModuleState,
  Position,
  ServiceResponse,
  TradeParameters,
  TradeResult,
} from "./types";
import { calculateRetryDelay, isNonRetryableError } from "./utils/error-utils";
import { savePositionCloseHistory } from "./utils/execution-history-helpers";
import { calculateRealizedPnL, shouldTriggerPriceLevel } from "./utils/position-monitoring-utils";

/**
 * Convert a database SnipeTarget row to AutoSnipeTarget interface
 */
function mapSnipeTargetToAutoSnipeTarget(
  target: typeof snipeTargets.$inferSelect,
): AutoSnipeTarget {
  return {
    ...target,
    // Map required AutoSnipeTarget properties
    symbol: target.symbolName,
    quantity: target.positionSizeUsdt,
    amount: target.positionSizeUsdt,
    confidence: target.confidenceScore,
    side: "BUY" as const,
    orderType: (target.entryStrategy === "limit" ? "LIMIT" : "MARKET") as
      | "MARKET"
      | "LIMIT"
      | "STOP_LIMIT",
    price: target.entryPrice ?? undefined,
    targetPrice: target.entryPrice ?? undefined,
    stopLoss: target.stopLossPercent
      ? target.positionSizeUsdt * (target.stopLossPercent / 100)
      : undefined,
    takeProfit: target.takeProfitCustom
      ? target.positionSizeUsdt * (target.takeProfitCustom / 100)
      : undefined,
    takeProfitPercent: target.takeProfitCustom ?? undefined,
    timeInForce: "GTC" as const,
    scheduledAt: target.targetExecutionTime?.toISOString() ?? null,
    executedAt: target.actualExecutionTime?.toISOString() ?? null,
  };
}

// Statistics interface for updateStats method
interface StatsUpdate {
  totalTrades?: number;
  successfulTrades?: number;
  failedTrades?: number;
  averageConfidence?: number;
  timestamp?: number;
}

// Configuration for price level monitoring
type PriceLevelMonitoringConfig = {
  position: Position;
  monitorType: "stop-loss" | "take-profit";
  triggerPrice: number | undefined;
  isStopLoss: boolean;
  pendingTimers: Map<string, NodeJS.Timeout>;
  executeCallback: (position: Position) => Promise<void>;
};

export class AutoSnipingModule {
  private context: ModuleContext;
  private state: ModuleState;
  private orderExecutor: OrderExecutor;

  // Auto-sniping state
  private autoSnipingInterval: NodeJS.Timeout | null = null;
  private lastSnipeCheck: Date | null = null;
  private isActive = false;
  private currentUserId: string | null = null;

  // Metrics
  private processedTargets = 0;
  private successfulSnipes = 0;
  private failedSnipes = 0;

  // Position tracking
  private activePositions = new Map<string, Position>();
  private positionByTargetId = new Map<number, string>();
  private pendingStopLosses = new Map<string, NodeJS.Timeout>();
  private pendingTakeProfits = new Map<string, NodeJS.Timeout>();
  // DB-driven SL/TP loop timer
  private positionCloseInterval: NodeJS.Timeout | null = null;

  constructor(context: ModuleContext) {
    this.context = context;
    this.orderExecutor = new OrderExecutor(context);
    this.state = {
      isInitialized: false,
      isHealthy: true,
      lastActivity: new Date(),
      metrics: {
        processedTargets: 0,
        successfulSnipes: 0,
        failedSnipes: 0,
        averageConfidence: 0,
      },
    };

    // Register with service conflict detector to prevent duplicate services
    const registered = serviceConflictDetector.registerService("AutoSnipingModule");
    if (!registered) {
      throw new Error(
        "AutoSnipingModule cannot start: conflicting auto-sniping services are already active. Use only the consolidated core trading service.",
      );
    }
  }

  /**
   * Initialize the auto-sniping module
   */
  async initialize(): Promise<void> {
    this.context.logger.info("Initializing Auto-Sniping Module");
    this.state.isInitialized = true;
    this.context.logger.info("Auto-Sniping Module initialized successfully");
  }

  /**
   * Shutdown the auto-sniping module
   */
  async shutdown(): Promise<void> {
    this.context.logger.info("Shutting down Auto-Sniping Module");

    // Stop auto-sniping
    await this.stop();

    // Clear all pending timers
    this.pendingStopLosses.forEach((timer) => clearTimeout(timer));
    this.pendingTakeProfits.forEach((timer) => clearTimeout(timer));
    this.pendingStopLosses.clear();
    this.pendingTakeProfits.clear();

    // Log active positions that need manual handling
    if (this.activePositions.size > 0) {
      this.context.logger.warn(`Shutting down with ${this.activePositions.size} active positions`, {
        positions: Array.from(this.activePositions.keys()),
      });
    }

    this.state.isInitialized = false;
  }

  /**
   * Update configuration
   */
  async updateConfig(config: Partial<CoreTradingConfig>): Promise<void> {
    this.context.config = { ...this.context.config, ...config };

    // Restart auto-sniping if active with new configuration
    if (this.isActive) {
      await this.stop();
      if (config.autoSnipingEnabled) {
        await this.start();
      }
    }

    this.context.logger.info("Auto-Sniping Module configuration updated");
  }

  /**
   * Set the current authenticated user id for preference lookups
   */
  setCurrentUser(userId: string): void {
    this.currentUserId = userId;
    this.context.logger.info("Auto-Sniping current user set", { userId });
  }

  /**
   * Start auto-sniping monitoring
   */
  async start(): Promise<ServiceResponse<void>> {
    if (this.isActive) {
      return {
        success: false,
        error: "Auto-sniping is already active",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      this.context.logger.info("Starting auto-sniping monitoring", {
        interval: this.context.config.snipeCheckInterval,
        confidenceThreshold: this.context.config.confidenceThreshold,
        currentUserId: this.currentUserId || "not set",
      });

      // CRITICAL: Verify user ID is set before starting (warn if not set, but allow system targets)
      if (!this.currentUserId) {
        this.context.logger.warn(
          "Starting auto-sniping without user ID set - will process system targets only",
          {
            note: "User ID should be set via setCurrentUser() before starting",
          },
        );
      }

      this.isActive = true;

      // Track if intervals were created for cleanup on error
      let intervalsCreated = false;

      try {
        await this.rehydrateOpenPositions().catch((rehydrateError) => {
          const safe = toSafeError(rehydrateError);
          this.context.logger.error("Failed to rehydrate open positions", safe);
        });

        this.autoSnipingInterval = setInterval(() => {
          void this.processSnipeTargets(this.currentUserId ?? undefined);
        }, this.context.config.snipeCheckInterval);
        intervalsCreated = true;

        // Start DB-driven SL/TP monitoring loop (idempotent, restart-safe)
        this.positionCloseInterval = setInterval(() => {
          void this.monitorDbPositionsAndExecuteSells();
        }, this.context.config.snipeCheckInterval);

        this.triggerPatternDetection();

        this.context.logger.info("Auto-sniping monitoring started successfully", {
          interval: this.context.config.snipeCheckInterval,
          currentUserId: this.currentUserId || "system only",
        });

        return {
          success: true,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        // Cleanup intervals if they were created
        if (intervalsCreated) {
          if (this.autoSnipingInterval) {
            clearInterval(this.autoSnipingInterval);
            this.autoSnipingInterval = null;
          }
          if (this.positionCloseInterval) {
            clearInterval(this.positionCloseInterval);
            this.positionCloseInterval = null;
          }
        }
        // Reset active flag on error
        this.isActive = false;
        throw error;
      }
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Failed to start auto-sniping", safeError);

      // Ensure state is clean on error
      this.isActive = false;

      return {
        success: false,
        error: safeError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Stop auto-sniping monitoring
   */
  async stop(): Promise<ServiceResponse<void>> {
    try {
      if (this.autoSnipingInterval) {
        clearInterval(this.autoSnipingInterval);
        this.autoSnipingInterval = null;
      }

      if (this.positionCloseInterval) {
        clearInterval(this.positionCloseInterval);
        this.positionCloseInterval = null;
      }

      this.isActive = false;
      this.context.logger.info("Auto-sniping monitoring stopped");

      // Unregister from service conflict detector
      serviceConflictDetector.unregisterService("AutoSnipingModule");

      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Failed to stop auto-sniping", safeError);

      return {
        success: false,
        error: safeError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Unified position monitoring loop using positions table
   * - Queries positions table for open positions
   * - Checks stop-loss, take-profit, and time-based exit conditions
   * - Executes MARKET SELL when any condition is met
   * - Updates positions table and links buy/sell pairs
   */
  private async monitorDbPositionsAndExecuteSells(): Promise<void> {
    try {
      const now = new Date();

      // Fetch open positions from positions table
      const openPositions = await db.select().from(positions).where(eq(positions.status, "open"));

      if (!openPositions?.length) {
        return;
      }

      for (const position of openPositions) {
        const symbol = this.normalizeSymbol(position.symbolName);
        const currentPrice = await this.getCurrentMarketPrice(symbol);

        if (
          currentPrice === null ||
          currentPrice === undefined ||
          Number.isNaN(currentPrice) ||
          currentPrice <= 0
        ) {
          this.context.logger.debug("Position monitor: price unavailable", {
            positionId: position.id,
            symbol,
          });
          continue;
        }

        // Check all exit conditions with structured logging
        let shouldSell = false;
        let reason: "STOP_LOSS" | "TAKE_PROFIT" | "TIME_BASED" | null = null;
        let reasonMetadata: Record<string, any> = {};

        // Stop-loss check
        if (currentPrice <= position.stopLossPrice) {
          shouldSell = true;
          reason = "STOP_LOSS";
          reasonMetadata = {
            currentPrice,
            stopLossPrice: position.stopLossPrice,
            priceDifference: currentPrice - position.stopLossPrice,
            priceDifferencePercent:
              ((currentPrice - position.stopLossPrice) / position.stopLossPrice) * 100,
          };
          this.context.logger.info("🔴 SELL DECISION: Stop-loss triggered", {
            decision: "SELL",
            reason: "STOP_LOSS",
            reasonCode: "STOP_LOSS_TRIGGERED",
            positionId: position.id,
            symbol,
            entryPrice: position.entryPrice,
            currentPrice,
            stopLossPrice: position.stopLossPrice,
            quantity: position.quantity,
            metadata: reasonMetadata,
            timestamp: now.toISOString(),
          });
        }

        // Take-profit check
        if (!shouldSell && currentPrice >= position.takeProfitPrice) {
          shouldSell = true;
          reason = "TAKE_PROFIT";
          reasonMetadata = {
            currentPrice,
            takeProfitPrice: position.takeProfitPrice,
            priceDifference: currentPrice - position.takeProfitPrice,
            priceDifferencePercent:
              ((currentPrice - position.takeProfitPrice) / position.takeProfitPrice) * 100,
            profitAmount: (currentPrice - position.entryPrice) * position.quantity,
            profitPercent: ((currentPrice - position.entryPrice) / position.entryPrice) * 100,
          };
          this.context.logger.info("🟢 SELL DECISION: Take-profit triggered", {
            decision: "SELL",
            reason: "TAKE_PROFIT",
            reasonCode: "TAKE_PROFIT_TRIGGERED",
            positionId: position.id,
            symbol,
            entryPrice: position.entryPrice,
            currentPrice,
            takeProfitPrice: position.takeProfitPrice,
            quantity: position.quantity,
            metadata: reasonMetadata,
            timestamp: now.toISOString(),
          });
        }

        // Time-based exit check
        if (!shouldSell && now >= position.maxHoldUntil) {
          shouldSell = true;
          reason = "TIME_BASED";
          const holdDurationMs = now.getTime() - position.entryTime.getTime();
          const holdDurationHours = holdDurationMs / (1000 * 60 * 60);
          reasonMetadata = {
            entryTime: position.entryTime.toISOString(),
            maxHoldUntil: position.maxHoldUntil.toISOString(),
            currentTime: now.toISOString(),
            holdDurationMs,
            holdDurationHours: holdDurationHours.toFixed(2),
            maxHoldHours:
              (position.maxHoldUntil.getTime() - position.entryTime.getTime()) / (1000 * 60 * 60),
          };
          this.context.logger.info("⏰ SELL DECISION: Time-based exit triggered", {
            decision: "SELL",
            reason: "TIME_BASED",
            reasonCode: "TIME_BASED_EXIT",
            positionId: position.id,
            symbol,
            entryPrice: position.entryPrice,
            currentPrice,
            quantity: position.quantity,
            metadata: reasonMetadata,
            timestamp: now.toISOString(),
          });
        }

        // Log when position is monitored but no sell condition is met
        if (!shouldSell) {
          this.context.logger.debug("🔍 Position monitored - no sell conditions met", {
            decision: "HOLD",
            reason: "NO_EXIT_CONDITION",
            reasonCode: "HOLD_POSITION",
            positionId: position.id,
            symbol,
            currentPrice,
            stopLossPrice: position.stopLossPrice,
            takeProfitPrice: position.takeProfitPrice,
            maxHoldUntil: position.maxHoldUntil.toISOString(),
            priceToStopLoss: currentPrice - position.stopLossPrice,
            priceToTakeProfit: position.takeProfitPrice - currentPrice,
            timeUntilMaxHold: position.maxHoldUntil.getTime() - now.getTime(),
            timestamp: now.toISOString(),
          });
          continue;
        }

        // Atomic claim: open -> closing (prevent duplicate sells)
        const claim = await db
          .update(positions)
          .set({ status: "partial", updatedAt: new Date() })
          .where(and(eq(positions.id, position.id), eq(positions.status, "open")))
          .returning({ id: positions.id });

        if (!Array.isArray(claim) || claim.length === 0) {
          this.context.logger.debug("Position monitor: position already claimed", {
            positionId: position.id,
            symbol,
          });
          continue;
        }

        // Place MARKET SELL for the full position size
        const closeParams: TradeParameters = {
          symbol,
          side: "SELL",
          type: "MARKET",
          quantity: position.quantity,
          timeInForce: "IOC",
        };

        try {
          const closeResult = await this.executeOrderWithRetry(closeParams);
          if (!closeResult.success) {
            throw new Error(closeResult.error || "Close order failed");
          }

          const executedQty = Number(
            closeResult.data?.executedQty ?? closeResult.data?.quantity ?? position.quantity,
          );
          const exitPrice = Number(closeResult.data?.price ?? currentPrice);
          const totalRevenue = Number(
            closeResult.data?.cummulativeQuoteQty ?? executedQty * exitPrice,
          );

          // Calculate P&L
          const entryValue = position.entryPrice * position.quantity;
          const exitValue = exitPrice * executedQty;
          const realizedPnl = exitValue - entryValue;
          const realizedPnlPercent = (realizedPnl / entryValue) * 100;

          // Persist sell execution
          const executedAt = new Date();
          const sellExecutionId = await saveExecutionHistory({
            userId: position.userId,
            snipeTargetId: position.snipeTargetId,
            positionId: position.id,
            vcoinId: position.vcoinId || symbol,
            symbolName: symbol,
            orderType: (closeResult.data?.type || "MARKET").toString().toLowerCase(),
            orderSide: "sell",
            requestedQuantity: position.quantity,
            requestedPrice: null,
            executedQuantity: executedQty,
            executedPrice: exitPrice,
            totalCost: totalRevenue,
            fees: closeResult.data?.fees ? Number(closeResult.data.fees) : null,
            exchangeOrderId: closeResult.data?.orderId ? String(closeResult.data.orderId) : null,
            exchangeStatus: (closeResult.data?.status || "FILLED").toString(),
            exchangeResponse: closeResult,
            executionLatencyMs: (closeResult as any).executionTime || null,
            slippagePercent: null,
            status: "success",
            requestedAt: new Date(),
            executedAt,
          });

          // Update position as closed
          await updatePositionOnSell({
            positionId: position.id,
            exitPrice,
            sellExecutionId,
            realizedPnl,
            realizedPnlPercent,
          });

          // Update snipe target as closed
          if (position.snipeTargetId) {
            await this.updateSnipeTargetStatus(position.snipeTargetId, "completed", undefined, {
              executionStatus: "closed",
              actualPositionSize: 0,
              executionPrice: exitPrice,
            });
          }

          this.context.logger.info("✅ SELL EXECUTED: Position closed successfully", {
            decision: "SELL",
            action: "EXECUTED",
            reason,
            reasonCode:
              reason === "STOP_LOSS"
                ? "STOP_LOSS_EXECUTED"
                : reason === "TAKE_PROFIT"
                  ? "TAKE_PROFIT_EXECUTED"
                  : "TIME_BASED_EXECUTED",
            positionId: position.id,
            targetId: position.snipeTargetId,
            symbol,
            entryPrice: position.entryPrice,
            exitPrice,
            quantity: executedQty,
            totalRevenue,
            realizedPnl,
            realizedPnlPercent: `${realizedPnlPercent.toFixed(2)}%`,
            sellExecutionId,
            exchangeOrderId: closeResult.data?.orderId,
            metadata: reasonMetadata,
            timestamp: executedAt.toISOString(),
          });
        } catch (closeError) {
          const safe = toSafeError(closeError);
          this.context.logger.error("❌ SELL FAILED: Close order execution failed", {
            decision: "SELL",
            action: "FAILED",
            reason,
            reasonCode:
              reason === "STOP_LOSS"
                ? "STOP_LOSS_FAILED"
                : reason === "TAKE_PROFIT"
                  ? "TAKE_PROFIT_FAILED"
                  : "TIME_BASED_FAILED",
            positionId: position.id,
            symbol,
            error: safe.message,
            errorCode: "SELL_EXECUTION_ERROR",
            metadata: reasonMetadata,
            timestamp: new Date().toISOString(),
          });
          // Revert status back to open to allow retry
          try {
            await db
              .update(positions)
              .set({ status: "open", updatedAt: new Date() })
              .where(eq(positions.id, position.id));
          } catch {}
        }
      }
    } catch (error) {
      const safe = toSafeError(error);
      this.context.logger.error("Position monitor: monitoring loop error", { error: safe.message });
    }
  }

  /**
   * Resolve vcoinId for a snipe target
   */
  private async getVcoinIdForTarget(
    snipeTargetId: number,
    fallbackSymbol: string,
  ): Promise<string> {
    try {
      const rows = await db
        .select({ vcoinId: snipeTargets.vcoinId })
        .from(snipeTargets)
        .where(eq(snipeTargets.id, snipeTargetId))
        .limit(1);
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.vcoinId) {
        return rows[0].vcoinId;
      }
    } catch {}
    return fallbackSymbol;
  }

  /**
   * Resolve the correct userId to attribute executions for a snipe target
   * Priority: latest successful BUY's userId -> current session user -> target's userId
   */
  private async resolveUserIdForSnipe(
    targetUserId: string,
    snipeTargetId: number,
  ): Promise<string> {
    try {
      const rows = await db
        .select({ userId: executionHistory.userId })
        .from(executionHistory)
        .where(
          and(
            eq(executionHistory.snipeTargetId, snipeTargetId),
            eq(executionHistory.action, "buy"),
            eq(executionHistory.status, "success"),
          ),
        )
        .orderBy(desc(executionHistory.executedAt))
        .limit(1);
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.userId) {
        return rows[0].userId;
      }
    } catch {}
    if (this.currentUserId) return this.currentUserId;
    return targetUserId;
  }

  /**
   * Pause auto-sniping monitoring
   */
  async pause(): Promise<ServiceResponse<void>> {
    if (!this.isActive) {
      return {
        success: false,
        error: "Auto-sniping is not active",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      if (this.autoSnipingInterval) {
        clearInterval(this.autoSnipingInterval);
        this.autoSnipingInterval = null;
      }

      this.context.logger.info("Auto-sniping monitoring paused");
      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Failed to pause auto-sniping", safeError);

      return {
        success: false,
        error: safeError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Resume auto-sniping monitoring
   */
  async resume(): Promise<ServiceResponse<void>> {
    if (!this.isActive) {
      return {
        success: false,
        error: "Auto-sniping is not active",
        timestamp: new Date().toISOString(),
      };
    }

    if (this.autoSnipingInterval) {
      return {
        success: false,
        error: "Auto-sniping is already running",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Resume the interval (ensure current user id is used if set)
      this.autoSnipingInterval = setInterval(() => {
        void this.processSnipeTargets(this.currentUserId ?? undefined);
      }, this.context.config.snipeCheckInterval);

      this.context.logger.info("Auto-sniping monitoring resumed");
      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Failed to resume auto-sniping", safeError);

      return {
        success: false,
        error: safeError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get module status
   */
  getStatus() {
    return {
      isActive: this.isActive,
      isHealthy: this.state.isHealthy,
      lastSnipeCheck: this.lastSnipeCheck,
      processedTargets: this.processedTargets,
      successfulSnipes: this.successfulSnipes,
      failedSnipes: this.failedSnipes,
      successRate:
        this.processedTargets > 0 ? (this.successfulSnipes / this.processedTargets) * 100 : 0,
      currentUserId: this.currentUserId,
    };
  }

  /**
   * Execute auto-sniping (main entry point)
   * This method is the primary execution point for auto-sniping operations
   */
  async execute(): Promise<ServiceResponse<{ processedCount: number; successCount: number }>> {
    const cycleStartTime = Date.now();

    try {
      if (!this.isActive) {
        this.context.logger.warn("⚠️ Auto-sniping execution skipped - module not active", {
          isActive: this.isActive,
          cycleStartTime: new Date(cycleStartTime).toISOString(),
        });
        return {
          success: false,
          error: "Auto-sniping module is not active",
          timestamp: new Date().toISOString(),
        };
      }

      this.context.logger.info("🚀 Starting auto-sniping execution cycle", {
        cycleStartTime: new Date(cycleStartTime).toISOString(),
        moduleState: this.getStats(),
        activeTargets: this.activePositions.size,
        completedSnipes: this.successfulSnipes,
        failedSnipes: this.failedSnipes,
      });

      // Delegate to processSnipeTargets for the actual execution, using current user if set
      const result = await this.processSnipeTargets(this.currentUserId ?? undefined);
      const cycleEndTime = Date.now();
      const cycleDuration = cycleEndTime - cycleStartTime;

      this.context.logger.info("✅ Auto-sniping execution cycle completed", {
        processedCount: result.data?.processedCount || 0,
        successCount: result.data?.successCount || 0,
        cycleDurationMs: cycleDuration,
        cycleStartTime: new Date(cycleStartTime).toISOString(),
        cycleEndTime: new Date(cycleEndTime).toISOString(),
        successRate:
          result.data?.processedCount > 0
            ? (((result.data?.successCount || 0) / result.data?.processedCount) * 100).toFixed(2) +
              "%"
            : "0%",
        moduleState: this.getStats(),
      });

      return result;
    } catch (error) {
      const safeError = toSafeError(error);
      const cycleEndTime = Date.now();
      const cycleDuration = cycleEndTime - cycleStartTime;

      this.context.logger.error("❌ Auto-sniping execution cycle failed", {
        error: safeError.message,
        stack: safeError.stack,
        cycleDurationMs: cycleDuration,
        cycleStartTime: new Date(cycleStartTime).toISOString(),
        cycleEndTime: new Date(cycleEndTime).toISOString(),
        moduleState: this.getStats(),
        activeTargets: this.activePositions.size,
        completedSnipes: this.successfulSnipes,
        failedSnipes: this.failedSnipes,
      });

      return {
        success: false,
        error: safeError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Process individual snipe target
   * This method handles the execution of a single snipe target
   */
  async processTarget(target: AutoSnipeTarget): Promise<ServiceResponse<TradeResult>> {
    try {
      this.context.logger.info(`Processing individual snipe target: ${target.symbol}`, {
        confidence: target.confidence,
        amount: target.quantity,
        strategy: target.orderType || "normal",
      });

      // Validate target before processing
      if (target.confidence < this.context.config.confidenceThreshold) {
        return {
          success: false,
          error: `Target confidence score ${target.confidence} below threshold ${this.context.config.confidenceThreshold}`,
          timestamp: new Date().toISOString(),
        };
      }

      // Execute the snipe target (target is already AutoSnipeTarget)
      const result = await this.executeSnipeTarget(target, undefined);

      this.context.logger.info(
        `Individual snipe target processed successfully: ${target.symbol}`,
        {
          orderId: result.data?.orderId,
          executedQty: result.data?.executedQty,
        },
      );

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error(`Failed to process individual snipe target: ${target.symbol}`, {
        error: safeError.message,
        target,
      });

      return {
        success: false,
        error: safeError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Manually process snipe targets
   */
  async processSnipeTargets(
    userId?: string,
  ): Promise<ServiceResponse<{ processedCount: number; successCount: number }>> {
    try {
      this.lastSnipeCheck = new Date();
      this.state.lastActivity = new Date();
      this.context.logger.debug("AutoSniping tick", {
        at: this.lastSnipeCheck.toISOString(),
        currentUserId: this.currentUserId,
        userIdParam: userId,
      });

      // Get ready snipe targets from database
      const readyTargets = await this.getReadySnipeTargets(userId);

      if (readyTargets.length === 0) {
        this.context.logger.info("⏸️ No ready targets found for execution", {
          userId: userId || "all",
          checkTime: this.lastSnipeCheck.toISOString(),
          reason:
            "No targets match ready criteria (status=ready, execution time passed, retries < 10)",
        });
        return {
          success: true,
          data: { processedCount: 0, successCount: 0 },
          timestamp: new Date().toISOString(),
        };
      }

      this.context.logger.info(`🚀 Processing ${readyTargets.length} ready snipe targets`, {
        targets: readyTargets.map((t) => ({
          id: t.id,
          symbol: t.symbol,
          confidence: t.confidence,
          targetExecutionTime: t.scheduledAt,
          currentRetries: t.currentRetries || 0,
        })),
        confidenceThreshold: this.context.config.confidenceThreshold,
      });

      let successCount = 0;
      const skippedTargets: Array<{
        targetId: number;
        symbol: string;
        reason: string;
        details: Record<string, unknown>;
      }> = [];

      // Process each target
      for (const target of readyTargets) {
        const targetStartTime = Date.now();

        if (target.confidence >= this.context.config.confidenceThreshold) {
          try {
            this.context.logger.info("▶️ Attempting execution", {
              targetId: target.id,
              symbol: target.symbol,
              confidence: target.confidence,
              threshold: this.context.config.confidenceThreshold,
              targetExecutionTime: target.scheduledAt,
              currentRetries: target.currentRetries,
            });

            const autoSnipeTarget = mapSnipeTargetToAutoSnipeTarget(target);
            await this.executeSnipeTarget(autoSnipeTarget, userId);
            successCount++;
            this.successfulSnipes++;

            this.context.logger.info("✅ Target execution initiated successfully", {
              targetId: target.id,
              symbol: target.symbol,
              processingTimeMs: Date.now() - targetStartTime,
            });
          } catch (error) {
            const safeError = toSafeError(error);
            this.context.logger.error("❌ Failed to execute snipe target", {
              targetId: target.id,
              symbol: target.symbol,
              error: safeError.message,
              stack: safeError.stack,
              target: {
                id: target.id,
                symbol: target.symbol,
                status: target.status,
                confidence: target.confidence,
                targetExecutionTime: target.scheduledAt,
                currentRetries: target.currentRetries,
              },
              processingTimeMs: Date.now() - targetStartTime,
            });
            await this.updateSnipeTargetStatus(target.id, "failed", safeError.message);
            this.failedSnipes++;
          }
        } else {
          const skipReason = `Confidence score ${target.confidence} below threshold ${this.context.config.confidenceThreshold}`;
          skippedTargets.push({
            targetId: target.id,
            symbol: target.symbol,
            reason: skipReason,
            details: {
              confidence: target.confidence,
              threshold: this.context.config.confidenceThreshold,
              difference: target.confidence - this.context.config.confidenceThreshold,
            },
          });

          this.context.logger.warn("⏭️ BUY DECISION: Skipping low confidence target", {
            decision: "BUY",
            action: "SKIPPED",
            reason: "LOW_CONFIDENCE",
            reasonCode: "BUY_SKIPPED_LOW_CONFIDENCE",
            reasonMessage: skipReason,
            targetId: target.id,
            symbol: target.symbol,
            confidence: target.confidence,
            threshold: this.context.config.confidenceThreshold,
            difference: target.confidence - this.context.config.confidenceThreshold,
            timestamp: new Date().toISOString(),
          });
        }

        this.processedTargets++;
      }

      // Log summary of skipped targets
      if (skippedTargets.length > 0) {
        this.context.logger.info("📊 Execution summary - skipped targets", {
          skippedCount: skippedTargets.length,
          skippedTargets,
        });
      }

      // Update metrics
      this.state.metrics.processedTargets = this.processedTargets;
      this.state.metrics.successfulSnipes = this.successfulSnipes;
      this.state.metrics.failedSnipes = this.failedSnipes;

      return {
        success: true,
        data: { processedCount: readyTargets.length, successCount },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Failed to process snipe targets", safeError);

      return {
        success: false,
        error: safeError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check if target was already executed (idempotency check)
   */
  private async checkIdempotency(
    target: AutoSnipeTarget,
    executionStartTime: number,
  ): Promise<TradeResult | null> {
    try {
      const prior = await db
        .select({
          id: executionHistory.id,
          exchangeOrderId: executionHistory.exchangeOrderId,
          executedQuantity: executionHistory.executedQuantity,
          executedPrice: executionHistory.executedPrice,
          executedAt: executionHistory.executedAt,
        })
        .from(executionHistory)
        .where(
          and(
            eq(executionHistory.snipeTargetId, target.id),
            eq(executionHistory.status, "success"),
          ),
        )
        .limit(1);

      if (prior.length > 0) {
        this.context.logger.warn(
          "Idempotency: target already executed previously; marking completed and skipping",
          {
            targetId: target.id,
            priorExecutionId: prior[0].id,
          },
        );
        await this.updateSnipeTargetStatus(target.id, "completed", undefined, {
          executionStatus: "success",
          executionPrice: prior[0].executedPrice ?? null,
          actualPositionSize: prior[0].executedQuantity ?? null,
        });
        return {
          success: true,
          data: {
            orderId: prior[0].exchangeOrderId || `executed-previously-${prior[0].id}`,
            symbol: target.symbol,
            side: "BUY",
            type: "MARKET",
            quantity: String(prior[0].executedQuantity ?? "0"),
            price: String(prior[0].executedPrice ?? "0"),
            status: "FILLED",
            executedQty: String(prior[0].executedQuantity ?? "0"),
            timestamp:
              (prior[0].executedAt || new Date()).toISOString?.() || new Date().toISOString(),
          },
          executionTime: Date.now() - executionStartTime,
          timestamp: new Date().toISOString(),
        } as unknown as TradeResult;
      }
    } catch (idempoError) {
      this.context.logger.warn("Idempotency pre-check failed; proceeding with caution", {
        targetId: target.id,
        error: idempoError instanceof Error ? idempoError.message : String(idempoError),
      });
    }
    return null;
  }

  /**
   * Check if market price is available for the target
   */
  private async checkPriceAvailability(
    target: AutoSnipeTarget,
    executionStartTime: number,
  ): Promise<{ currentPrice: number | null; result: TradeResult | null }> {
    this.context.logger.info("🔍 Checking market price availability", {
      targetId: target.id,
      symbol: target.symbol,
      targetExecutionTime: target.scheduledAt,
      currentTime: new Date().toISOString(),
      timeUntilExecution: target.scheduledAt
        ? new Date(target.scheduledAt).getTime() - Date.now()
        : null,
    });

    const currentPrice = await this.getCurrentMarketPrice(target.symbol);
    if (!currentPrice || currentPrice <= 0) {
      const priceCheckTime = Date.now() - executionStartTime;
      this.context.logger.warn("⚠️ Price unavailable for snipe target; deferring execution", {
        targetId: target.id,
        symbol: target.symbol,
        vcoinId: target.vcoinId,
        currentPrice,
        priceCheckTimeMs: priceCheckTime,
        reason: "Awaiting first market price; will retry",
        targetExecutionTime: target.scheduledAt,
        currentRetries: target.currentRetries,
        nextRetry:
          target.currentRetries !== null && target.currentRetries < 10
            ? "Will retry on next cycle"
            : "Max retries approaching",
      });
      await this.updateSnipeTargetStatus(
        target.id,
        "ready",
        `Price unavailable (${currentPrice}); awaiting first market price; will retry`,
      );
      return {
        currentPrice: null,
        result: {
          success: false,
          error: "Price unavailable; deferred",
          timestamp: new Date().toISOString(),
        } as unknown as TradeResult,
      };
    }

    this.context.logger.info("✅ Resolved current market price", {
      targetId: target.id,
      symbol: target.symbol,
      currentPrice,
      priceResolutionTimeMs: Date.now() - executionStartTime,
      targetExecutionTime: target.scheduledAt,
      timeSinceTargetExecution: target.scheduledAt
        ? Date.now() - new Date(target.scheduledAt).getTime()
        : null,
    });

    return { currentPrice, result: null };
  }

  /**
   * Attempt to claim target for execution (atomic operation)
   */
  private async claimTargetForExecution(target: AutoSnipeTarget): Promise<TradeResult | null> {
    this.context.logger.info("🔒 Attempting to claim target for execution", {
      targetId: target.id,
      symbol: target.symbol,
      currentStatus: target.status,
      requiredStatus: "ready",
    });

    const claimRows = await db
      .update(snipeTargets)
      .set({ status: "executing", actualExecutionTime: new Date(), updatedAt: new Date() })
      .where(and(eq(snipeTargets.id, target.id), eq(snipeTargets.status, "ready")))
      .returning({ id: snipeTargets.id });

    if (!Array.isArray(claimRows) || claimRows.length === 0) {
      this.context.logger.warn("⚠️ Target already claimed or not ready; skipping execution", {
        targetId: target.id,
        symbol: target.symbol,
        currentStatus: target.status,
        reason: "Another worker already claimed this target OR target status is not 'ready'",
        claimAttemptTime: new Date().toISOString(),
      });
      return {
        success: false,
        error: "Already claimed",
        timestamp: new Date().toISOString(),
      } as unknown as TradeResult;
    }

    this.context.logger.info("✅ Successfully claimed target for execution", {
      targetId: target.id,
      symbol: target.symbol,
      claimTime: new Date().toISOString(),
    });

    return null;
  }

  /**
   * Validate user ID and preferences
   */
  private async validateUserAndPreferences(
    target: AutoSnipeTarget,
    currentUserId: string | undefined,
  ): Promise<{
    success: boolean;
    error?: string;
    userId?: string;
    uiMaxBuyUsdt?: number;
    stopLossPercent?: number;
    takeProfitPercent?: number;
    maxHoldHours?: number;
  }> {
    const prefsUserId = currentUserId || this.currentUserId;
    if (!prefsUserId) {
      const noUserMsg = "Missing current userId for preferences lookup (must come from session)";
      this.context.logger.error(noUserMsg, { targetId: target.id });
      await this.updateSnipeTargetStatus(target.id, "failed", noUserMsg, {
        executionStatus: "failed",
      });
      return { success: false, error: noUserMsg };
    }

    let uiMaxBuyUsdt: number | undefined;
    let stopLossPercent: number = target.stopLossPercent || 5.0;
    let takeProfitPercent: number = target.takeProfitCustom || 10.0;
    let maxHoldHours: number = 24.0;

    const candidateUserIds = [prefsUserId];
    for (const uid of candidateUserIds) {
      try {
        const prefs = await db
          .select({
            defaultBuyAmountUsdt: userPreferencesTable.defaultBuyAmountUsdt,
            stopLossPercent: userPreferencesTable.stopLossPercent,
            takeProfitLevel1: userPreferencesTable.takeProfitLevel1,
            takeProfitLevel2: userPreferencesTable.takeProfitLevel2,
            takeProfitLevel3: userPreferencesTable.takeProfitLevel3,
            takeProfitLevel4: userPreferencesTable.takeProfitLevel4,
            takeProfitCustom: userPreferencesTable.takeProfitCustom,
            defaultTakeProfitLevel: userPreferencesTable.defaultTakeProfitLevel,
          })
          .from(userPreferencesTable)
          .where(eq(userPreferencesTable.userId, uid))
          .limit(1);
        const maxHold = 24; // Default max hold hours
        if (prefs && prefs.length > 0) {
          if (
            typeof prefs[0].defaultBuyAmountUsdt === "number" &&
            prefs[0].defaultBuyAmountUsdt > 0
          ) {
            uiMaxBuyUsdt = prefs[0].defaultBuyAmountUsdt;
          }
          if (typeof prefs[0].stopLossPercent === "number" && prefs[0].stopLossPercent > 0) {
            stopLossPercent = prefs[0].stopLossPercent;
          }
          // Use the default take profit level or custom
          const defaultLevel = prefs[0].defaultTakeProfitLevel || 2;
          let selectedTakeProfit: number | null = null;
          if (prefs[0].takeProfitCustom !== null && typeof prefs[0].takeProfitCustom === "number") {
            selectedTakeProfit = prefs[0].takeProfitCustom;
          } else {
            switch (defaultLevel) {
              case 1:
                selectedTakeProfit = prefs[0].takeProfitLevel1;
                break;
              case 2:
                selectedTakeProfit = prefs[0].takeProfitLevel2;
                break;
              case 3:
                selectedTakeProfit = prefs[0].takeProfitLevel3;
                break;
              case 4:
                selectedTakeProfit = prefs[0].takeProfitLevel4;
                break;
              default:
                selectedTakeProfit = prefs[0].takeProfitLevel2;
            }
          }
          if (
            selectedTakeProfit !== null &&
            typeof selectedTakeProfit === "number" &&
            selectedTakeProfit > 0
          ) {
            takeProfitPercent = selectedTakeProfit;
          }
          // maxHold is not in the schema, using default
          maxHoldHours = maxHold;
          break;
        }
      } catch (prefsErr) {
        this.context.logger.error("Failed to read user preferences", {
          userId: uid,
          error: prefsErr instanceof Error ? prefsErr.message : String(prefsErr),
        });
      }
    }

    if (!(typeof uiMaxBuyUsdt === "number" && Number.isFinite(uiMaxBuyUsdt) && uiMaxBuyUsdt > 0)) {
      const fallbackAmountCandidates = [
        Number(target.quantity ?? 0),
        Number(this.context.config.maxPositionSize ?? 0),
        100,
      ].filter((value) => Number.isFinite(value) && value > 0) as number[];

      if (fallbackAmountCandidates.length > 0) {
        uiMaxBuyUsdt = fallbackAmountCandidates[0];
        this.context.logger.warn(
          "⚠️ Missing defaultBuyAmountUsdt preference; using fallback for execution",
          {
            userId: prefsUserId,
            targetId: target.id,
            symbol: target.symbol,
            fallbackAmount: uiMaxBuyUsdt,
            checkedUserIds: candidateUserIds,
            timestamp: new Date().toISOString(),
          },
        );
      } else {
        const prefsErrorMsg = `Default buy amount not set in user preferences (defaultBuyAmountUsdt) for user ${prefsUserId}`;
        this.context.logger.error(
          "❌ BUY DECISION: Missing required default buy amount; aborting snipe",
          {
            decision: "BUY",
            action: "ABORTED",
            reason: "MISSING_USER_PREFERENCES",
            reasonCode: "BUY_ABORTED_MISSING_PREFERENCES",
            reasonMessage: "User preferences missing or invalid defaultBuyAmountUsdt",
            userId: prefsUserId,
            targetId: target.id,
            symbol: target.symbol,
            uiMaxBuyUsdt,
            checkedUserIds: candidateUserIds,
            timestamp: new Date().toISOString(),
          },
        );
        await this.updateSnipeTargetStatus(target.id, "failed", prefsErrorMsg, {
          executionStatus: "failed",
        });
        return { success: false, error: prefsErrorMsg };
      }
    }

    this.context.logger.info("✅ User preferences validated", {
      userId: prefsUserId,
      targetId: target.id,
      uiMaxBuyUsdt,
      targetPositionSize: target.quantity,
    });

    return {
      success: true,
      userId: prefsUserId,
      uiMaxBuyUsdt,
      stopLossPercent,
      takeProfitPercent,
      maxHoldHours,
    };
  }

  /**
   * Execute a specific snipe target
   */
  async executeSnipeTarget(target: AutoSnipeTarget, currentUserId?: string): Promise<TradeResult> {
    const executionStartTime = Date.now();

    this.context.logger.info("🟢 BUY DECISION: Starting snipe target execution", {
      decision: "BUY",
      action: "INITIATED",
      reason: "TARGET_READY",
      reasonCode: "BUY_TARGET_EXECUTION_STARTED",
      targetId: target.id,
      symbol: target.symbol,
      confidence: target.confidence,
      amount: target.quantity,
      strategy: target.orderType || "normal",
      vcoinId: target.vcoinId,
      executionStartTime: new Date(executionStartTime).toISOString(),
      timestamp: new Date().toISOString(),
    });

    // Idempotency guard: if this target already has a successful execution recorded, don't trade again
    const idempotencyResult = await this.checkIdempotency(target, executionStartTime);
    if (idempotencyResult) {
      return idempotencyResult;
    }

    // Check price availability - critical decision point
    const priceCheck = await this.checkPriceAvailability(target, executionStartTime);
    if (priceCheck.result && !priceCheck.result.success) {
      this.context.logger.warn("⏭️ BUY DECISION: Skipping target due to price unavailability", {
        decision: "BUY",
        action: "SKIPPED",
        reason: "PRICE_UNAVAILABLE",
        reasonCode: "BUY_SKIPPED_PRICE_UNAVAILABLE",
        targetId: target.id,
        symbol: target.symbol,
        error: priceCheck.result.error,
        timestamp: new Date().toISOString(),
      });
      return priceCheck.result;
    }
    const currentPrice = priceCheck.currentPrice!;

    // Atomic claim: ensure only one worker can move this target from ready/active -> executing
    // If target is "active", transition it to "ready" first, then claim it
    if (target.status === "active") {
      this.context.logger.info("🔄 Transitioning active target to ready status", {
        targetId: target.id,
        symbol: target.symbol,
      });
      await db
        .update(snipeTargets)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(snipeTargets.id, target.id));
      // Update local target status for consistency
      target.status = "ready";
    }

    const claimResult = await this.claimTargetForExecution(target);
    if (claimResult) {
      this.context.logger.warn("⏭️ BUY DECISION: Skipping target - already claimed or not ready", {
        decision: "BUY",
        action: "SKIPPED",
        reason: "TARGET_ALREADY_CLAIMED",
        reasonCode: "BUY_SKIPPED_TARGET_CLAIMED",
        targetId: target.id,
        symbol: target.symbol,
        error: claimResult.error,
        timestamp: new Date().toISOString(),
      });
      return claimResult;
    }

    try {
      const strategy = tradingStrategyManager.getStrategy();

      this.context.logger.info(`Using strategy: ${strategy.name}`, {
        levels: strategy.levels.length,
        firstPhaseTarget: strategy.levels[0]?.percentage,
      });

      // Validate user ID and preferences
      const userValidation = await this.validateUserAndPreferences(target, currentUserId);
      if (!userValidation.success) {
        this.context.logger.error("❌ BUY DECISION: User validation failed; aborting snipe", {
          decision: "BUY",
          action: "ABORTED",
          reason: "USER_VALIDATION_FAILED",
          reasonCode: "BUY_ABORTED_USER_VALIDATION",
          targetId: target.id,
          symbol: target.symbol,
          error: userValidation.error,
          timestamp: new Date().toISOString(),
        });
        return {
          success: false,
          error: userValidation.error!,
          timestamp: new Date().toISOString(),
        } as unknown as TradeResult;
      }

      const {
        userId: prefsUserId,
        uiMaxBuyUsdt,
        stopLossPercent,
        takeProfitPercent,
        maxHoldHours,
      } = userValidation;

      // Determine buy size in USDT dynamically with safe fallback
      const { computeDynamicPositionSizeUsdt } = await import("@/src/lib/dynamic-position-sizer");
      const dynamicBuyUsdt = await computeDynamicPositionSizeUsdt(
        this.context.mexcService, // Use mexcService instead of mexcPortfolio
        this.context.config,
        { positionSizeUsdt: target.quantity },
      );
      const buyUsdt = Math.min(dynamicBuyUsdt, uiMaxBuyUsdt);

      // Resolve takeProfitPercent from target (use custom if available, otherwise resolve from level)
      const { resolveRiskParams } = await import("@/src/lib/risk-defaults");
      const riskParams = await resolveRiskParams(
        {
          stopLossPercent: stopLossPercent,
          takeProfitLevel: target.takeProfitLevel ?? undefined,
          takeProfitCustom: target.takeProfitCustom ?? undefined,
        },
        prefsUserId,
      );
      const resolvedTakeProfitPercent = riskParams.takeProfitPercent;

      const tradeParams: TradeParameters = {
        symbol: target.symbol,
        side: "BUY",
        type: "MARKET",
        quoteOrderQty: buyUsdt,
        timeInForce: "IOC",
        isAutoSnipe: true,
        confidenceScore: target.confidence,
        stopLossPercent: target.stopLossPercent,
        takeProfitPercent: resolvedTakeProfitPercent,
        strategy: target.orderType || "normal",
        snipeTargetId: target.id,
        userId: prefsUserId,
      };

      this.context.logger.debug("📋 Prepared trade parameters", {
        targetId: target.id,
        symbol: target.symbol,
        tradeParams,
        strategyName: strategy.name,
        strategyLevels: strategy.levels.length,
      });

      const tradeExecutionStartTime = Date.now();
      const result = await this.executeTradeViaManualModule(tradeParams);
      const tradeExecutionTime = Date.now() - tradeExecutionStartTime;

      const buySuccess = (result as any)?.success;
      const orderId = (result as any)?.data?.orderId || (result as any)?.orderId;
      const orderStatus = (result as any)?.data?.status || (result as any)?.status;

      if (buySuccess) {
        this.context.logger.info("✅ BUY EXECUTED: Trade execution completed successfully", {
          decision: "BUY",
          action: "EXECUTED",
          reason: "ORDER_FILLED",
          reasonCode: "BUY_EXECUTED_SUCCESS",
          targetId: target.id,
          symbol: target.symbol,
          orderId,
          status: orderStatus,
          executedQty: (result as any)?.data?.executedQty || (result as any)?.executedQty,
          executedPrice: (result as any)?.data?.price || (result as any)?.price,
          totalCost:
            (result as any)?.data?.cummulativeQuoteQty || (result as any)?.cummulativeQuoteQty,
          tradeExecutionTimeMs: tradeExecutionTime,
          totalExecutionTimeMs: Date.now() - executionStartTime,
          strategy: strategy.name,
          confidence: target.confidence,
          timestamp: new Date().toISOString(),
        });
      } else {
        this.context.logger.error("❌ BUY FAILED: Trade execution failed", {
          decision: "BUY",
          action: "FAILED",
          reason: "ORDER_EXECUTION_FAILED",
          reasonCode: "BUY_EXECUTED_FAILED",
          targetId: target.id,
          symbol: target.symbol,
          orderId,
          status: orderStatus,
          error: (result as any)?.error,
          tradeExecutionTimeMs: tradeExecutionTime,
          totalExecutionTimeMs: Date.now() - executionStartTime,
          strategy: strategy.name,
          confidence: target.confidence,
          timestamp: new Date().toISOString(),
        });
      }

      if (result.success) {
        // Validate that the exchange response indicates a filled order with quantity
        const orderData: any = result.data || {};
        const statusText: string = String(orderData.status || "").toUpperCase();
        const executedQtyNum: number = Number(orderData.executedQty || orderData.origQty || 0);
        const orderId = orderData.orderId || orderData.id;

        // Enhanced status validation - consider more statuses as potentially valid
        const validFilledStatuses = ["FILLED", "SUCCESS", "COMPLETED"];
        const partialFilledStatuses = ["PARTIALLY_FILLED", "PARTIAL"];
        const pendingStatuses = ["NEW", "PENDING", "ACCEPTED", "SUBMITTED"];
        const rejectedStatuses = ["REJECTED", "CANCELED", "CANCELLED", "EXPIRED", "FAILED"];

        const isFilled = validFilledStatuses.includes(statusText) && executedQtyNum > 0;
        const isPartiallyFilled = partialFilledStatuses.includes(statusText) && executedQtyNum > 0;
        const isPending = pendingStatuses.includes(statusText);
        const isRejected = rejectedStatuses.includes(statusText);

        this.context.logger.info("Order execution result analysis", {
          targetId: target.id,
          symbol: target.symbol,
          orderId,
          statusText,
          executedQtyNum,
          isFilled,
          isPartiallyFilled,
          isPending,
          isRejected,
          rawResponse: orderData,
        });

        if (isFilled) {
          // Order is fully filled - proceed with success
          this.context.logger.info("Order fully filled successfully", {
            targetId: target.id,
            symbol: target.symbol,
            orderId,
            executedQty: executedQtyNum,
            status: statusText,
          });
        } else if (isPartiallyFilled) {
          // Order is partially filled - still consider it a success but log the partial fill
          this.context.logger.warn("Order partially filled - proceeding with partial success", {
            targetId: target.id,
            symbol: target.symbol,
            orderId,
            executedQty: executedQtyNum,
            status: statusText,
            note: "Order partially filled, may need monitoring for completion",
          });
        } else if (isPending) {
          const msg = `Order placed but pending execution (status=${statusText}, executedQty=${executedQtyNum})`;
          this.context.logger.warn("Order pending execution - attempting to wait and recheck", {
            targetId: target.id,
            symbol: target.symbol,
            orderId,
            statusText,
            executedQtyNum,
            rawResponse: orderData,
            note: "Order accepted but not yet filled - will wait and recheck status",
          });
          const recheckResult = await this.recheckPendingOrder(target.symbol, orderId, 3);
          if (recheckResult.success && recheckResult.data) {
            this.context.logger.info("Order filled after recheck", {
              targetId: target.id,
              symbol: target.symbol,
              orderId,
              finalStatus: recheckResult.data.status,
              finalExecutedQty: recheckResult.data.executedQty,
            });
            result.data = { ...orderData, ...recheckResult.data };
          } else {
            this.context.logger.warn("Order still pending after recheck", {
              targetId: target.id,
              symbol: target.symbol,
              orderId,
              recheckError: recheckResult.error,
            });
            await this.updateSnipeTargetStatus(target.id, "completed", msg, {
              executionStatus: "success",
              executionPrice: orderData.price ? Number(orderData.price) : null,
              actualPositionSize:
                executedQtyNum ||
                (orderData.price
                  ? Number(target.quantity || 0) / Number(orderData.price)
                  : 0),
            });
            try {
              const normalizedSymbol = this.normalizeSymbol(target.symbol);
              await saveExecutionHistory({
                userId: prefsUserId,
                snipeTargetId: target.id,
                vcoinId: (target as any).vcoinId || normalizedSymbol,
                symbolName: normalizedSymbol,
                orderType: (orderData.type || "MARKET").toString().toLowerCase(),
                orderSide: "buy",
                requestedQuantity: Number(target.quantity || 0),
                status: "success",
                errorMessage: msg,
                requestedAt: new Date(),
                executedAt: new Date(),
                exchangeStatus: statusText || "pending",
                exchangeResponse: result,
                executionLatencyMs: result.executionTime || null,
                exchangeOrderId: String(orderId),
              });
            } catch {
              /* swallow persist failure */
            }
            return result;
          }
        } else if (isRejected) {
          // Order was rejected
          const msg = `Order rejected by exchange (status=${statusText}, executedQty=${executedQtyNum})`;
          this.context.logger.error("Order rejected by exchange", {
            targetId: target.id,
            symbol: target.symbol,
            orderId,
            statusText,
            executedQtyNum,
            rawResponse: orderData,
          });
          await this.updateSnipeTargetStatus(target.id, "failed", msg, {
            executionStatus: "failed",
          });
          try {
            const normalizedSymbol = this.normalizeSymbol(target.symbol);
            await saveExecutionHistory({
              userId: prefsUserId,
              snipeTargetId: target.id,
              vcoinId: (target as any).vcoinId || normalizedSymbol,
              symbolName: normalizedSymbol,
              orderType: (orderData.type || "MARKET").toString().toLowerCase(),
              orderSide: "buy",
              requestedQuantity: Number(target.quantity || 0),
              status: "failed",
              errorMessage: msg,
              requestedAt: new Date(),
              executedAt: new Date(),
              exchangeStatus: statusText || "rejected",
              exchangeResponse: result,
              executionLatencyMs: result.executionTime || null,
            });
          } catch {
            /* swallow persist failure here since already failed */
          }
          return result;
        } else {
          // Unknown or empty status - check if this is a new listing issue
          const isNewListingIssue = (!statusText || statusText === "") && executedQtyNum === 0;

          if (isNewListingIssue) {
            // Successful order placement with empty/unknown status and zero executedQty.
            // Per requirements: consider execution successful (do not fail or retry).
            this.context.logger.warn(
              "Exchange response not filled or zero quantity; treating as successful placement",
              {
                targetId: target.id,
                symbol: target.symbol,
                orderId,
                statusText,
                executedQtyNum,
                note: "Proceeding to persist execution and mark target completed",
              },
            );

            // Opportunistically verify status. If it turns filled, the verified data will be merged.
            if (orderId) {
              const verify = await this.verifyOrderStatus(
                this.normalizeSymbol(target.symbol),
                String(orderId),
              );
              if (verify.success && verify.data) {
                result.data = { ...orderData, ...verify.data };
              }
            }
            // Fall through to success persistence block below without returning.
          } else {
            // Unknown/empty status but nonzero executedQty → treat as success and enrich
            this.context.logger.warn(
              "Exchange response unclear but has executed quantity; treating as success",
              {
                targetId: target.id,
                symbol: target.symbolName,
                orderId,
                statusText,
                executedQtyNum,
              },
            );

            // Try verify to enrich fields
            if (orderId) {
              const verify = await this.verifyOrderStatus(
                this.normalizeSymbol(target.symbol),
                String(orderId),
              );
              if (verify.success && verify.data) {
                result.data = { ...orderData, ...verify.data };
              } else {
                // Compute missing price/total if possible
                if (!orderData.price && orderData.cummulativeQuoteQty && executedQtyNum > 0) {
                  orderData.price = String(Number(orderData.cummulativeQuoteQty) / executedQtyNum);
                }
              }
            }
            // Fall through to success persistence
          }
        }

        const normalizedSymbolForSuccess = this.normalizeSymbol(target.symbol);
        const executedQtyValue = Number(result.data?.executedQty ?? result.data?.quantity ?? 0);
        const priceValue = result.data?.price
          ? Number(result.data.price)
          : result.data?.executedPrice
            ? Number(result.data.executedPrice)
            : currentPrice;

        if (!result.success) {
          // Should not happen in this branch, but keep safety net
          await this.updateSnipeTargetStatus(
            target.id,
            "failed",
            "Execution reported success=false",
            { executionStatus: "failed" },
          );
          return result;
        }

        // Persist execution history FIRST (even if executedQty is still 0)
        try {
          const executedAtDate = result.data?.timestamp
            ? new Date(result.data.timestamp)
            : new Date();

          const totalCostValue = result.data?.cummulativeQuoteQty
            ? Number(result.data.cummulativeQuoteQty)
            : priceValue != null
              ? priceValue *
                (executedQtyValue || Number(target.quantity || 0) / (priceValue || 1))
              : null;

          this.context.logger.info("📝 Recording execution history (treated as success)", {
            targetId: target.id,
            symbol: normalizedSymbolForSuccess,
            orderId: result.data?.orderId,
            executedQuantity: executedQtyValue,
            executedPrice: priceValue ?? null,
            totalCost: totalCostValue,
            executionLatencyMs: result.executionTime || null,
            timestamp: executedAtDate,
          });

          const buyExecutionId = await saveExecutionHistory({
            userId: prefsUserId,
            snipeTargetId: target.id,
            vcoinId: (target as any).vcoinId || normalizedSymbolForSuccess,
            symbolName: normalizedSymbolForSuccess,
            orderType: (result.data?.type || "MARKET").toString().toLowerCase(),
            orderSide: (result.data?.side || "BUY").toString().toLowerCase(),
            requestedQuantity: Number(target.quantity || 0),
            requestedPrice: null,
            executedQuantity: executedQtyValue || null,
            executedPrice: priceValue ?? null,
            totalCost: totalCostValue,
            fees: null,
            exchangeOrderId: result.data?.orderId ? String(result.data.orderId) : null,
            exchangeStatus: statusText || "FILLED",
            exchangeResponse: result,
            executionLatencyMs: result.executionTime || null,
            slippagePercent: null,
            status: "success",
            requestedAt: new Date(),
            executedAt: executedAtDate,
          });

          this.context.logger.info("✅ Execution history recorded (success)", {
            targetId: target.id,
            orderId: result.data?.orderId,
            symbol: normalizedSymbolForSuccess,
            executionId: buyExecutionId,
          });

          // Create position for monitoring if we have valid execution data
          let positionId: number | null = null;
          if (executedQtyValue > 0 && priceValue && priceValue > 0) {
            try {
              positionId = await createPosition({
                userId: prefsUserId,
                snipeTargetId: target.id,
                symbolName: normalizedSymbolForSuccess,
                vcoinId: (target as any).vcoinId || normalizedSymbolForSuccess,
                entryPrice: priceValue,
                quantity: executedQtyValue,
                buyExecutionId,
                stopLossPercent: stopLossPercent,
                takeProfitPercent: takeProfitPercent,
                maxHoldHours: maxHoldHours,
              });

              this.context.logger.info("✅ Position created for monitoring", {
                positionId,
                targetId: target.id,
                symbol: normalizedSymbolForSuccess,
                entryPrice: priceValue,
                quantity: executedQtyValue,
                stopLossPercent,
                takeProfitPercent,
                maxHoldHours,
              });
            } catch (positionError) {
              const safePositionError = toSafeError(positionError);
              this.context.logger.error("❌ Failed to create position", {
                targetId: target.id,
                symbol: normalizedSymbolForSuccess,
                error: safePositionError.message,
              });
              // Continue execution even if position creation fails
            }
          }

          await this.updateSnipeTargetStatus(target.id, "completed", undefined, {
            executionStatus: "success",
            executionPrice: priceValue ?? null,
            actualPositionSize:
              executedQtyValue ||
              (priceValue ? Number(target.quantity || 0) / priceValue : 0),
          });
        } catch (persistError) {
          const safePersistError = toSafeError(persistError);
          this.context.logger.error(
            "❌ Failed to persist execution history; marking target completed anyway",
            {
              targetId: target.id,
              symbol: target.symbol,
              error: safePersistError.message,
            },
          );
          await this.updateSnipeTargetStatus(
            target.id,
            "completed",
            `Persist execution failed: ${safePersistError.message}`,
            {
              executionStatus: "success",
              executionPrice: priceValue ?? null,
              actualPositionSize:
                executedQtyValue ||
                (priceValue ? Number(target.quantity || 0) / priceValue : 0),
            },
          );
          return result;
        }

        // Emit auto-snipe event with strategy info
        this.context.eventEmitter.emit("auto_snipe_executed", {
          target,
          result,
          strategy: strategy.name,
        });

        this.context.logger.info("Snipe target executed successfully with strategy", {
          symbol: target.symbol,
          orderId: result.data?.orderId,
          strategy: strategy.name,
          entryPrice: result.data?.price,
          quantity: result.data?.executedQty,
        });
      } else {
        const errMsg =
          (typeof result.error === "string" ? result.error : result.error?.message) ||
          "Execution failed";

        // If price is not yet available (new listing), keep target ready for retry
        if (/Unable to get current price/i.test(errMsg)) {
          await this.updateSnipeTargetStatus(
            target.id,
            "ready",
            "Awaiting first market price; will retry",
          );
          this.context.logger.warn(
            `Price unavailable for ${target.symbol}; deferring execution`,
          );
        } else {
          // Otherwise mark as failed
          await this.updateSnipeTargetStatus(target.id, "failed", errMsg);
          // Persist failed execution attempt
          try {
            const normalizedSymbol = this.normalizeSymbol(target.symbol);

            this.context.logger.warn("📝 Inserting failed execution history record", {
              targetId: target.id,
              symbol: normalizedSymbol,
              errorMessage: errMsg,
              requestedQuantity: Number(target.quantity || 0),
              executionLatencyMs: result.executionTime || null,
              timestamp: new Date(),
            });

            await saveExecutionHistory({
              userId: prefsUserId,
              snipeTargetId: target.id,
              vcoinId: (target as any).vcoinId || normalizedSymbol,
              symbolName: normalizedSymbol,
              orderType: (result.type || "MARKET").toString().toLowerCase(),
              orderSide: "buy",
              requestedQuantity: Number(target.quantity || 0),
              status: "failed",
              errorMessage: errMsg,
              requestedAt: new Date(),
              executedAt: new Date(),
              executionLatencyMs: result.executionTime || null,
              exchangeStatus: "rejected",
              exchangeResponse: result,
            });

            this.context.logger.warn("✅ Failed execution history successfully persisted", {
              targetId: target.id,
              symbol: normalizedSymbol,
              errorMessage: errMsg,
              requestedQuantity: Number(target.quantity || 0),
              executionLatencyMs: result.executionTime || null,
            });
          } catch (persistError) {
            const safePersistError = toSafeError(persistError);
            this.context.logger.error("❌ Failed to persist failed execution history", {
              targetId: target.id,
              symbol: target.symbolName,
              error: safePersistError.message,
              stack: safePersistError.stack,
              originalError: errMsg,
              executionRecord: {
                userId: "system",
                snipeTargetId: target.id,
                symbolName: target.symbolName,
                action: "buy",
                status: "failed",
                errorMessage: errMsg,
              },
            });
          }
        }
      }

      return result;
    } catch (error) {
      const safeError = toSafeError(error);
      const totalExecutionTime = Date.now() - executionStartTime;

      this.context.logger.error("❌ Snipe target execution failed", {
        targetId: target.id,
        symbol: target.symbol,
        error: safeError.message,
        stack: safeError.stack,
        totalExecutionTimeMs: totalExecutionTime,
        confidence: target.confidence,
        amount: target.quantity,
        strategy: target.orderType || "normal",
        errorType: error?.constructor?.name || "Unknown",
      });

      if (/Auto-sniping module is not healthy or not initialized/i.test(safeError.message)) {
        this.context.logger.error("Auto-sniping module state", {
          isInitialized: this.state.isInitialized,
          isHealthy: this.state.isHealthy,
        });
      }

      if (/Unable to get current price/i.test(safeError.message)) {
        this.context.logger.warn("⚠️ Price unavailable; deferring execution", {
          targetId: target.id,
          symbol: target.symbol,
          reason: "Awaiting first market price; will retry",
          totalExecutionTimeMs: totalExecutionTime,
        });
        await this.updateSnipeTargetStatus(
          target.id,
          "ready",
          "Awaiting first market price; will retry",
        );
      } else {
        this.context.logger.error("💥 Execution failed; marking target as failed", {
          targetId: target.id,
          symbol: target.symbol,
          error: safeError.message,
          totalExecutionTimeMs: totalExecutionTime,
        });
        await this.updateSnipeTargetStatus(target.id, "failed", safeError.message);
      }
      throw error;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get ready snipe targets from database
   * Enhanced with comprehensive logging for execution reasoning
   */
  private async getReadySnipeTargets(userId?: string): Promise<AutoSnipeTarget[]> {
    const checkStartTime = Date.now();
    try {
      const now = new Date();

      // First, fetch ALL targets to analyze why they're excluded
      const allTargets = await db
        .select({
          id: snipeTargets.id,
          userId: snipeTargets.userId,
          vcoinId: snipeTargets.vcoinId,
          symbolName: snipeTargets.symbolName,
          positionSizeUsdt: snipeTargets.positionSizeUsdt,
          status: snipeTargets.status,
          priority: snipeTargets.priority,
          riskLevel: snipeTargets.riskLevel,
          createdAt: snipeTargets.createdAt,
          updatedAt: snipeTargets.updatedAt,
          entryPrice: snipeTargets.entryPrice,
          executionStatus: snipeTargets.executionStatus,
          executionPrice: snipeTargets.executionPrice,
          confidenceScore: snipeTargets.confidenceScore,
          takeProfitLevel: snipeTargets.takeProfitLevel,
          errorMessage: snipeTargets.errorMessage,
          targetExecutionTime: snipeTargets.targetExecutionTime,
          actualExecutionTime: snipeTargets.actualExecutionTime,
          actualPositionSize: snipeTargets.actualPositionSize,
          entryStrategy: snipeTargets.entryStrategy,
          maxRetries: snipeTargets.maxRetries,
          currentRetries: snipeTargets.currentRetries,
          takeProfitCustom: snipeTargets.takeProfitCustom,
        })
        .from(snipeTargets)
        .orderBy(snipeTargets.priority, snipeTargets.createdAt)
        .limit(50); // Get more to analyze

      // Log analysis of all targets
      const excludedTargets: Array<{
        targetId: number;
        symbol: string;
        reasons: string[];
      }> = [];

      for (const target of allTargets) {
        const reasons: string[] = [];

        // Check status
        if (target.status !== "ready") {
          reasons.push(`Status is "${target.status}" (required: "ready")`);
        }

        // Check execution time
        if (target.scheduledAt) {
          const execTime = new Date(target.scheduledAt);
          if (execTime > now) {
            reasons.push(
              `Target execution time ${execTime.toISOString()} is in the future (now: ${now.toISOString()})`,
            );
          }
        }

        // Check retries
        if (target.currentRetries !== null && target.currentRetries >= 10) {
          reasons.push(`Max retries exceeded (${target.currentRetries}/10)`);
        }

        // Check user filter
        if (userId) {
          if (target.userId !== userId && target.userId !== "system") {
            reasons.push(
              `User mismatch: target userId="${target.userId}", requested userId="${userId}"`,
            );
          }
        }

        if (reasons.length > 0) {
          excludedTargets.push({
            targetId: target.id,
            symbol: target.symbol || "UNKNOWN",
            reasons,
          });
        }
      }

      // Log excluded targets for debugging
      if (excludedTargets.length > 0) {
        this.context.logger.info("🔍 Targets excluded from execution", {
          excludedCount: excludedTargets.length,
          excludedTargets: excludedTargets.slice(0, 10), // Log first 10
          timestamp: now.toISOString(),
        });
      }

      // Now apply the actual query filters
      // Include both "ready" and "active" targets - "active" targets should transition to ready when execution time arrives
      const baseWhere = and(
        or(
          eq(snipeTargets.status, "ready"),
          // Also include "active" targets whose execution time has passed (they should be executed)
          and(
            eq(snipeTargets.status, "active"),
            or(isNull(snipeTargets.targetExecutionTime), lt(snipeTargets.targetExecutionTime, now)),
          ),
        ),
        or(isNull(snipeTargets.targetExecutionTime), lt(snipeTargets.targetExecutionTime, now)),
        // Limit retries for new listing issues (max 10 attempts = ~5 minutes at 30s intervals)
        or(isNull(snipeTargets.currentRetries), lt(snipeTargets.currentRetries, 10)),
      );

      const whereClause = userId
        ? and(baseWhere, or(eq(snipeTargets.userId, userId), eq(snipeTargets.userId, "system")))
        : baseWhere;

      const targets = await db
        .select({
          id: snipeTargets.id,
          userId: snipeTargets.userId,
          vcoinId: snipeTargets.vcoinId,
          symbolName: snipeTargets.symbolName,
          positionSizeUsdt: snipeTargets.positionSizeUsdt,
          status: snipeTargets.status,
          priority: snipeTargets.priority,
          riskLevel: snipeTargets.riskLevel,
          createdAt: snipeTargets.createdAt,
          updatedAt: snipeTargets.updatedAt,
          entryPrice: snipeTargets.entryPrice,
          executionStatus: snipeTargets.executionStatus,
          executionPrice: snipeTargets.executionPrice,
          confidenceScore: snipeTargets.confidenceScore,
          takeProfitLevel: snipeTargets.takeProfitLevel,
          errorMessage: snipeTargets.errorMessage,
          targetExecutionTime: snipeTargets.targetExecutionTime,
          actualExecutionTime: snipeTargets.actualExecutionTime,
          actualPositionSize: snipeTargets.actualPositionSize,
          entryStrategy: snipeTargets.entryStrategy,
          maxRetries: snipeTargets.maxRetries,
          currentRetries: snipeTargets.currentRetries,
          takeProfitCustom: snipeTargets.takeProfitCustom,
          stopLossPercent: snipeTargets.stopLossPercent,
        })
        .from(snipeTargets)
        .where(whereClause)
        .orderBy(snipeTargets.priority, snipeTargets.createdAt)
        .limit(10);

      this.context.logger.info("✅ Ready targets query completed", {
        readyCount: targets.length,
        excludedCount: excludedTargets.length,
        queryTimeMs: Date.now() - checkStartTime,
        readyTargets: targets.map((t) => ({
          id: t.id,
          symbol: t.symbolName,
          status: t.status,
          targetExecutionTime: t.targetExecutionTime?.toISOString(),
          currentRetries: t.currentRetries,
          confidence: t.confidenceScore,
        })),
      });

      // Map database results to AutoSnipeTarget interface
      return targets.map((target) => mapSnipeTargetToAutoSnipeTarget(target));
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("❌ Failed to fetch ready snipe targets", {
        error: safeError.message,
        stack: safeError.stack,
        queryTimeMs: Date.now() - checkStartTime,
      });
      return [];
    }
  }

  /**
   * Update snipe target status in database
   */
  private async updateSnipeTargetStatus(
    targetId: number,
    status: string,
    errorMessage?: string,
    additionalFields?: Record<string, any>,
  ): Promise<void> {
    try {
      const updateData: {
        status: string;
        updatedAt: Date;
        actualExecutionTime?: Date;
        errorMessage?: string;
        [key: string]: any;
      } = {
        status,
        updatedAt: new Date(),
        ...additionalFields,
      };

      if (status === "executing") {
        updateData.actualExecutionTime = new Date();
      }

      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }

      this.context.logger.info("🔄 Updating snipe target status", {
        targetId,
        newStatus: status,
        previousStatus: "unknown", // Could be enhanced to track previous status
        errorMessage,
        actualExecutionTime: updateData.actualExecutionTime,
        timestamp: updateData.updatedAt,
      });

      await db.update(snipeTargets).set(updateData).where(eq(snipeTargets.id, targetId));

      this.context.logger.info("✅ Snipe target status updated successfully", {
        targetId,
        status,
        errorMessage,
        actualExecutionTime: updateData.actualExecutionTime,
        timestamp: updateData.updatedAt,
      });
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("❌ Failed to update snipe target status", {
        targetId,
        status,
        errorMessage,
        error: safeError.message,
        stack: safeError.stack,
        updateData: {
          status,
          updatedAt: new Date(),
          actualExecutionTime: status === "executing" ? new Date() : undefined,
          errorMessage,
        },
      });
    }
  }

  /**
   * Trigger pattern detection to find new opportunities
   * Note: This will be triggered periodically by the auto-sniping system
   * For now, we'll log that pattern detection should run here
   */
  private async triggerPatternDetection(): Promise<void> {
    try {
      this.context.logger.info(
        "Auto-sniping started - pattern detection should be running automatically",
      );
      this.context.logger.info("Pattern detection runs via:");
      this.context.logger.info("1. Calendar polling (every 5 minutes) - triggers pattern analysis");
      this.context.logger.info("2. Manual trigger via /api/triggers/pattern-analysis");
      this.context.logger.info("3. Scheduled Inngest workflows");
      this.context.logger.info(
        "Auto-sniping will process any targets created by pattern detection",
      );
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Pattern detection trigger info failed", safeError);
    }
  }

  /**
   * Execute trade via manual trading module
   * This would typically call the manual trading module's executeTrade method
   */
  private async executeTradeViaManualModule(params: TradeParameters): Promise<TradeResult> {
    try {
      // Route to order executor module (handles both paper and real trading)
      // CRITICAL: Use paperTradingMode from config, not enablePaperTrading
      if (this.context.config.paperTradingMode) {
        return await this.orderExecutor.executePaperSnipe(params);
      } else {
        return await this.orderExecutor.executeRealSnipe(params);
      }
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Trade execution via manual module failed", {
        params,
        error: safeError,
      });
      throw safeError;
    }
  }

  /**
   * Execute paper snipe trade
   */
  private async executePaperSnipe(params: TradeParameters): Promise<TradeResult> {
    const startTime = Date.now();
    const simulatedPrice = 100 + Math.random() * 1000; // Mock price
    const orderId = `paper-snipe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      success: true,
      data: {
        orderId,
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        quantity: (params.quoteOrderQty! / simulatedPrice).toString(),
        price: simulatedPrice.toString(),
        status: "FILLED",
        executedQty: (params.quoteOrderQty! / simulatedPrice).toString(),
        timestamp: new Date().toISOString(),
        paperTrade: true,
        simulatedPrice,
        autoSnipe: true,
        confidenceScore: params.confidenceScore,
      },
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute real snipe trade
   */
  private async executeRealSnipe(params: TradeParameters): Promise<TradeResult> {
    const startTime = Date.now();

    try {
      // Enhanced safety checks before trading
      await this.performPreTradeValidation(params);

      // Get current market price for validation
      const normalizedSymbol = this.normalizeSymbol(params.symbol);
      const currentPrice = await this.getCurrentMarketPrice(normalizedSymbol);
      if (!currentPrice) {
        return {
          success: false,
          error: `Unable to get current price for ${normalizedSymbol}`,
          timestamp: new Date().toISOString(),
        };
      }

      // Prepare MEXC API parameters with enhanced validation
      const mexcParams = {
        symbol: normalizedSymbol,
        side: params.side,
        type: params.type,
        quoteOrderQty: params.quoteOrderQty,
        timeInForce: params.timeInForce || "IOC",
      };

      // Validate order parameters
      await this.validateOrderParameters(mexcParams, currentPrice);

      // Execute through MEXC service with retry logic
      const mexcResult = await this.executeOrderWithRetry(mexcParams);

      if (!mexcResult.success || !mexcResult.data) {
        throw new Error(mexcResult.error || "Snipe trade execution failed");
      }

      // Create position tracking entry
      const position = await this.createPositionEntry(
        mexcResult.data,
        params,
        currentPrice,
        params.snipeTargetId,
      );

      // Setup stop-loss and take-profit monitoring
      // Position monitoring now handled by DB-based monitorDbPositionsAndExecuteSells()
      // No need for in-memory monitoring setup

      const result: TradeResult = {
        success: true,
        data: {
          orderId: mexcResult.data.orderId.toString(),
          clientOrderId: mexcResult.data.clientOrderId,
          symbol: mexcResult.data.symbol,
          side: mexcResult.data.side,
          type: mexcResult.data.type,
          quantity: mexcResult.data.origQty,
          price: mexcResult.data.price || currentPrice.toString(),
          status: mexcResult.data.status,
          executedQty: mexcResult.data.executedQty,
          cummulativeQuoteQty: mexcResult.data.cummulativeQuoteQty,
          timestamp: new Date(mexcResult.data.transactTime || Date.now()).toISOString(),
          autoSnipe: true,
          confidenceScore: params.confidenceScore,
        },
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };

      this.context.logger.info("Real snipe trade executed successfully", {
        orderId: result.data?.orderId,
        symbol: normalizedSymbol,
        executedQty: result.data?.executedQty,
        entryPrice: result.data?.price,
        positionId: position.id,
      });

      // Emit position opened event
      this.context.eventEmitter.emit("position_opened", position);

      return result;
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Real snipe trade execution failed", {
        symbol: params.symbol,
        error: safeError.message,
        params: {
          side: params.side,
          type: params.type,
          quoteOrderQty: params.quoteOrderQty,
        },
      });
      throw safeError;
    }
  }

  // ============================================================================
  // Enhanced Trading Helper Methods
  // ============================================================================

  /**
   * Perform comprehensive pre-trade validation
   */
  private async performPreTradeValidation(params: TradeParameters): Promise<void> {
    // Check safety coordinator
    if (this.context.safetyCoordinator) {
      // Check if safety coordinator has a status method available
      if (typeof (this.context.safetyCoordinator as any).getCurrentStatus === "function") {
        const safetyStatus = (this.context.safetyCoordinator as any).getCurrentStatus();
        if (safetyStatus?.overall?.safetyLevel !== "safe") {
          throw new Error(`Trading blocked by safety system: ${safetyStatus.overall.safetyLevel}`);
        }
      }
      // If no getCurrentStatus method, assume safe to proceed
    }

    // Check module health
    if (!this.state.isHealthy || !this.state.isInitialized) {
      throw new Error("Auto-sniping module is not healthy or not initialized");
    }

    // Check position limits
    if (this.activePositions.size >= this.context.config.maxConcurrentPositions) {
      throw new Error(`Maximum concurrent positions reached: ${this.activePositions.size}`);
    }

    // Validate required parameters
    if (!params.symbol || !params.side || !params.type) {
      throw new Error("Missing required trading parameters");
    }

    if (!params.quoteOrderQty || params.quoteOrderQty <= 0) {
      throw new Error("Invalid position size");
    }
  }

  /**
   * Get current market price for a symbol
   */
  private async getCurrentMarketPrice(symbol: string): Promise<number | null> {
    const priceFetchStartTime = Date.now();
    try {
      const marketSymbol = this.normalizeSymbol(symbol);
      this.context.logger.info("💰 Starting price fetch", {
        originalSymbol: symbol,
        normalizedSymbol: marketSymbol,
        timestamp: new Date().toISOString(),
      });

      const priceAttempts: Array<{
        attempt: number;
        success: boolean;
        price?: number;
        error?: string;
      }> = [];

      for (let attempt = 1; attempt <= 3; attempt++) {
        this.context.logger.debug("Fetching current market price", {
          symbol: marketSymbol,
          attempt,
          maxAttempts: 3,
        });

        try {
          const price = await this.tryFetchCurrentPriceOnce(marketSymbol);
          if (price && price > 0) {
            priceAttempts.push({ attempt, success: true, price });
            this.context.logger.info("✅ Successfully fetched market price", {
              symbol: marketSymbol,
              price,
              attempt,
              fetchTimeMs: Date.now() - priceFetchStartTime,
            });
            return price;
          } else {
            priceAttempts.push({ attempt, success: false, error: "Price was null or <= 0" });
            this.context.logger.warn("⚠️ Price fetch returned invalid value", {
              symbol: marketSymbol,
              attempt,
              price,
            });
          }
        } catch (attemptError) {
          const attemptErrorMsg =
            attemptError instanceof Error ? attemptError.message : String(attemptError);
          priceAttempts.push({ attempt, success: false, error: attemptErrorMsg });
          this.context.logger.warn("⚠️ Price fetch attempt failed", {
            symbol: marketSymbol,
            attempt,
            error: attemptErrorMsg,
          });
        }

        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      // All attempts failed
      this.context.logger.error("❌ Unable to get current price from any source", {
        symbol: marketSymbol,
        originalSymbol: symbol,
        attempts: priceAttempts,
        totalFetchTimeMs: Date.now() - priceFetchStartTime,
        reason: "All 3 attempts failed or returned invalid prices",
      });
      return null;
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("❌ Critical error getting current price", {
        symbol,
        error: safeError.message,
        stack: safeError.stack,
        fetchTimeMs: Date.now() - priceFetchStartTime,
      });
      return null;
    }
  }

  private async tryFetchCurrentPriceOnce(symbol: string): Promise<number | null> {
    try {
      let price: number | null = null;

      this.context.logger.debug("tryFetchCurrentPriceOnce called", {
        symbol,
        mexcServiceAvailable: !!this.context.mexcService,
        hasGetTicker: !!(this.context.mexcService && typeof this.context.mexcService.getTicker === "function"),
        hasGetCurrentPrice: !!(this.context.mexcService && typeof this.context.mexcService.getCurrentPrice === "function"),
      });

      if (this.context.mexcService && typeof this.context.mexcService.getTicker === "function") {
        try {
          const ticker = await this.context.mexcService.getTicker(symbol);
          this.context.logger.debug("Ticker response", {
            symbol,
            success: ticker.success,
            dataPreview: ticker.data,
          });
          
          if (!ticker.success) {
            this.context.logger.warn("Ticker fetch failed", { symbol, error: ticker.error });
            return null;
          }
          
          if (ticker.success && ticker.data) {
            const priceFields = ["price", "lastPrice", "close", "last"];
            for (const field of priceFields) {
              const fieldValue = (ticker.data as any)[field];
              if (fieldValue) {
                const priceValue = parseFloat(fieldValue);
                if (priceValue > 0) {
                  price = priceValue;
                  this.context.logger.debug("Ticker price extracted", {
                    symbol,
                    field,
                    value: priceValue,
                  });
                  break;
                }
              }
            }
            if (!price) {
              this.context.logger.warn("Ticker present but no usable price", {
                symbol,
                data: ticker.data,
                fieldsChecked: ["price", "lastPrice", "close", "last"],
                hasPrice: Boolean((ticker.data as any).price),
                hasLastPrice: Boolean((ticker.data as any).lastPrice),
              });
            }
          }
        } catch (tickerError) {
          this.context.logger.warn(`Failed to get ticker for ${symbol}`, {
            error: tickerError instanceof Error ? tickerError.message : String(tickerError),
          });
        }
      }

      if (!price) {
        const wsPrice = (this.context as any).marketData?.getLatestPrice?.(symbol);
        if (typeof wsPrice === "number" && wsPrice > 0) {
          price = wsPrice;
          this.context.logger.debug("Using websocket price", { symbol, price: wsPrice });
        }
      }

      if (
        !price &&
        this.context.mexcService &&
        typeof this.context.mexcService.getCurrentPrice === "function"
      ) {
        try {
          this.context.logger.debug("Trying getCurrentPrice fallback", { symbol });
          const priceResult = await this.context.mexcService.getCurrentPrice(symbol);
          this.context.logger.debug("getCurrentPrice returned", { symbol, value: priceResult, type: typeof priceResult });
          if (typeof priceResult === "number" && priceResult > 0) {
            price = priceResult;
          }
        } catch (priceError) {
          this.context.logger.warn(`Failed to get current price for ${symbol}`, {
            error: priceError instanceof Error ? priceError.message : String(priceError),
          });
        }
      }

      if (
        !price &&
        this.context.mexcService &&
        typeof this.context.mexcService.getOrderBook === "function"
      ) {
        try {
          const orderBook = await this.context.mexcService.getOrderBook(symbol, 5);
          this.context.logger.debug("Order book response", {
            symbol,
            success: orderBook.success,
            topBid: orderBook.data?.bids?.[0]?.[0],
            topAsk: orderBook.data?.asks?.[0]?.[0],
          });
          if (orderBook.success && orderBook.data) {
            const { bids, asks } = orderBook.data;
            if (bids && bids.length > 0 && asks && asks.length > 0) {
              const bidPrice = parseFloat(bids[0][0]);
              const askPrice = parseFloat(asks[0][0]);
              if (bidPrice > 0 && askPrice > 0) {
                price = (bidPrice + askPrice) / 2;
                this.context.logger.debug("Order book mid-price computed", {
                  symbol,
                  bidPrice,
                  askPrice,
                  mid: price,
                });
              }
            }
          }
        } catch (orderBookError) {
          this.context.logger.warn(`Failed to get order book for ${symbol}`, {
            error:
              orderBookError instanceof Error ? orderBookError.message : String(orderBookError),
          });
        }
      }

      // Fallback 4: Try calendar API for new listings
      if (
        !price &&
        this.context.mexcService &&
        typeof this.context.mexcService.getCalendarListings === "function"
      ) {
        try {
          const calendarResponse = await this.context.mexcService.getCalendarListings();
          if (calendarResponse.success && calendarResponse.data) {
            const baseSymbol = symbol.replace(/USDT$|USDC$|BTC$|ETH$/i, "").toUpperCase();
            const listing = (calendarResponse.data as any[]).find(
              (entry: any) =>
                entry.symbol?.toUpperCase() === baseSymbol ||
                entry.vcoinName?.toUpperCase() === baseSymbol ||
                entry.vcoinId?.toUpperCase() === baseSymbol,
            );
            // Calendar doesn't provide price, but we can log it for debugging
            if (listing) {
              this.context.logger.debug("Found symbol in calendar but no price available", {
                symbol,
                listingSymbol: listing.symbol,
                vcoinId: listing.vcoinId,
              });
            }
          }
        } catch (calendarError) {
          this.context.logger.debug(`Failed to check calendar for ${symbol}`, {
            error: calendarError instanceof Error ? calendarError.message : String(calendarError),
          });
        }
      }

      // Note: getKlines is not implemented in UnifiedMexcService
      // Skipping klines fallback - previous fallbacks should have succeeded

      if (!price) {
        this.context.logger.debug("Price not resolved from any source in this attempt", { symbol });
      }
      return price;
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.warn(`Transient error getting current price for ${symbol}`, safeError);
      return null;
    }
  }

  /**
   * Normalize a raw symbol into an exchange-ready market symbol (e.g., MAIGA -> MAIGAUSDT)
   */
  private normalizeSymbol(rawSymbol: string): string {
    // Uppercase and trim
    const upper = (rawSymbol || "").toUpperCase().trim();
    // Strip all characters not allowed by MEXC symbol convention; join base and quote
    // Allowed final charset is ^[A-Z0-9-_.]{1,64}$, but MEXC spot symbols are typically A-Z0-9 only
    // We remove separators and illegal characters to avoid 700008
    const alnum = upper.replace(/[^A-Z0-9]/g, "");

    const knownQuotes = ["USDT", "USDC", "BTC", "ETH"];
    const endsWithKnown = knownQuotes.some((q) => alnum.endsWith(q));
    const symbol = endsWithKnown ? alnum : `${alnum}USDT`;

    // Ensure max length 64
    return symbol.length > 64 ? symbol.slice(0, 64) : symbol;
  }

  // Fetch symbol trading rules (precision/stepSize)
  private async getSymbolTradeRules(symbol: string): Promise<{
    baseAssetPrecision: number;
    quotePrecision: number;
    stepSize?: number;
    lotSizeDecimals?: number;
    tickSize?: number;
    minPrice?: number;
    maxPrice?: number;
    minQty?: number;
    maxQty?: number;
    minNotional?: number;
  }> {
    try {
      // Prefer symbol-level info which includes filters
      const symbolInfo = await (this.context.mexcService as any).getSymbolInfoBasic?.(symbol);
      if (symbolInfo?.success && symbolInfo.data) {
        const info = symbolInfo.data as any;
        let stepSize: number | undefined;
        let lotSizeDecimals: number | undefined;
        let tickSize: number | undefined;
        let minPrice: number | undefined;
        let maxPrice: number | undefined;
        const filters = info.filters || [];
        const lot = Array.isArray(filters)
          ? filters.find((f: any) => f.filterType === "LOT_SIZE")
          : undefined;
        const price = Array.isArray(filters)
          ? filters.find((f: any) => f.filterType === "PRICE_FILTER")
          : undefined;
        const notional = Array.isArray(filters)
          ? filters.find((f: any) => f.filterType === "MIN_NOTIONAL")
          : undefined;
        if (lot?.stepSize) {
          stepSize = parseFloat(lot.stepSize);
          const s = String(lot.stepSize);
          if (s.includes(".")) lotSizeDecimals = s.split(".")[1].replace(/0+$/, "").length;
          else lotSizeDecimals = 0;
        }
        if (price) {
          if (price.tickSize) tickSize = parseFloat(price.tickSize);
          if (price.minPrice) minPrice = parseFloat(price.minPrice);
          if (price.maxPrice) maxPrice = parseFloat(price.maxPrice);
        }
        const minQty = lot?.minQty ? parseFloat(lot.minQty) : undefined;
        const maxQty = lot?.maxQty ? parseFloat(lot.maxQty) : undefined;
        const minNotional = notional?.minNotional ? parseFloat(notional.minNotional) : undefined;
        return {
          baseAssetPrecision: Number(info.baseAssetPrecision || 8),
          quotePrecision: Number(info.quotePrecision || 8),
          stepSize,
          lotSizeDecimals,
          tickSize,
          minPrice,
          maxPrice,
          minQty,
          maxQty,
          minNotional,
        };
      }
    } catch (_e) {}
    return { baseAssetPrecision: 8, quotePrecision: 8 };
  }

  // Adjust raw quantity down to valid increment
  private adjustQuantity(
    rawQty: number,
    rules: { stepSize?: number; lotSizeDecimals?: number; baseAssetPrecision?: number },
  ): number {
    if (!Number.isFinite(rawQty) || rawQty <= 0) return 0;
    if (rules?.stepSize && rules.stepSize > 0) {
      const steps = Math.floor(rawQty / rules.stepSize);
      return steps * rules.stepSize;
    }
    const decimals = Math.min(rules?.lotSizeDecimals ?? rules?.baseAssetPrecision ?? 8, 8);
    const factor = 10 ** decimals;
    return Math.floor(rawQty * factor) / factor;
  }

  // Format quantity as string respecting precision
  private formatQuantity(
    qty: number,
    rules: { lotSizeDecimals?: number; baseAssetPrecision?: number },
  ): string {
    if (!Number.isFinite(qty) || qty <= 0) return "0";
    const decimals = Math.min(rules?.lotSizeDecimals ?? rules?.baseAssetPrecision ?? 8, 8);
    return qty
      .toFixed(decimals)
      .replace(/\.0+$/, "")
      .replace(/(\.\d*?)0+$/, "$1");
  }

  // Adjust raw price to exchange constraints (min/max/tickSize)
  private adjustPrice(
    rawPrice: number,
    rules: { tickSize?: number; minPrice?: number; maxPrice?: number },
  ): number {
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) return 0;
    let p = rawPrice;
    if (typeof rules.maxPrice === "number" && Number.isFinite(rules.maxPrice)) {
      p = Math.min(p, rules.maxPrice);
    }
    if (typeof rules.minPrice === "number" && Number.isFinite(rules.minPrice)) {
      p = Math.max(p, rules.minPrice);
    }
    if (rules.tickSize && rules.tickSize > 0) {
      const steps = Math.floor(p / rules.tickSize);
      p = steps * rules.tickSize;
    }
    return p;
  }

  // Format price string respecting tick size precision
  private formatPrice(price: number, rules: { tickSize?: number }): string {
    if (!Number.isFinite(price) || price <= 0) return "0";
    const decimals =
      rules?.tickSize && String(rules.tickSize).includes(".")
        ? String(rules.tickSize).split(".")[1].replace(/0+$/, "").length
        : 8;
    return price
      .toFixed(decimals)
      .replace(/\.0+$/, "")
      .replace(/(\.\d*?)0+$/, "$1");
  }

  /**
   * Validate order parameters before execution
   */
  private async validateOrderParameters(
    orderParams: TradeParameters,
    currentPrice: number,
  ): Promise<void> {
    // Validate symbol format
    if (!orderParams.symbol || typeof orderParams.symbol !== "string") {
      throw new Error("Invalid symbol format");
    }
    // Normalize internal: ensure market symbol is paired with quote
    orderParams.symbol = this.normalizeSymbol(orderParams.symbol);

    // Enforce exchange legal symbol charset early to avoid 700008
    const legalSymbolRe = /^[A-Z0-9-_.]{1,64}$/;
    if (!legalSymbolRe.test(orderParams.symbol)) {
      throw new Error(
        `Illegal characters found in symbol '${orderParams.symbol}'. Legal range is '^[A-Z0-9-_.]{1,64}$'.`,
      );
    }

    // Validate side
    if (!["BUY", "SELL"].includes(orderParams.side)) {
      throw new Error("Invalid order side");
    }

    // Validate order type
    if (!["MARKET", "LIMIT", "STOP_LIMIT"].includes(orderParams.type)) {
      throw new Error("Invalid order type");
    }

    // Validate time in force
    if (orderParams.timeInForce && !["GTC", "IOC", "FOK"].includes(orderParams.timeInForce)) {
      throw new Error("Invalid time in force");
    }

    // Validate quote order quantity
    if (orderParams.quoteOrderQty) {
      const minOrderValue = 5; // USDT minimum
      if (orderParams.quoteOrderQty < minOrderValue) {
        throw new Error(`Order value too small. Minimum: ${minOrderValue} USDT`);
      }
    }

    // Market price sanity check
    if (currentPrice <= 0) {
      throw new Error("Invalid market price");
    }

    // Enhanced price validation for LIMIT orders (non-fatal: will clamp in execution phase)
    if (orderParams.type === "LIMIT" && orderParams.price) {
      await this.validatePriceLimits(orderParams.symbol, orderParams.price, currentPrice);
    }
  }

  /**
   * Recheck pending order status with retries
   */
  private async recheckPendingOrder(
    symbol: string,
    orderId: string,
    maxRetries: number = 3,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Wait before checking (exponential backoff)
        const delay = Math.min(1000 * 2 ** (attempt - 1), 5000);
        if (attempt > 1) {
          this.context.logger.debug(`Waiting ${delay}ms before recheck attempt ${attempt}`, {
            symbol,
            orderId,
            attempt,
            maxRetries,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const statusResult = await this.verifyOrderStatus(symbol, orderId);

        if (statusResult.success && statusResult.data) {
          const statusText = String(statusResult.data.status || "").toUpperCase();
          const executedQtyNum = Number(statusResult.data.executedQty || 0);

          // Check if order is now filled
          const validFilledStatuses = ["FILLED", "SUCCESS", "COMPLETED"];
          const partialFilledStatuses = ["PARTIALLY_FILLED", "PARTIAL"];
          const isFilled = validFilledStatuses.includes(statusText) && executedQtyNum > 0;
          const isPartiallyFilled =
            partialFilledStatuses.includes(statusText) && executedQtyNum > 0;

          if (isFilled || isPartiallyFilled) {
            this.context.logger.info("Order filled during recheck", {
              symbol,
              orderId,
              attempt,
              status: statusText,
              executedQty: executedQtyNum,
            });
            return statusResult;
          }

          // Still pending, continue to next attempt
          this.context.logger.debug("Order still pending during recheck", {
            symbol,
            orderId,
            attempt,
            status: statusText,
            executedQty: executedQtyNum,
          });
        } else {
          this.context.logger.warn("Failed to get order status during recheck", {
            symbol,
            orderId,
            attempt,
            error: statusResult.error,
          });
        }
      } catch (error) {
        const safeError = toSafeError(error);
        this.context.logger.warn("Exception during order recheck", {
          symbol,
          orderId,
          attempt,
          error: safeError.message,
        });
      }
    }

    return {
      success: false,
      error: "Order still pending after all recheck attempts",
    };
  }

  /**
   * Verify order status by querying MEXC directly
   */
  private async verifyOrderStatus(
    symbol: string,
    orderId: string,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      this.context.logger.debug("Querying MEXC for order status", {
        symbol,
        orderId,
      });

      // Use the MEXC service to get order status; pass symbol explicitly to avoid 700004
      const statusResult = await this.context.mexcService.getOrderStatus(
        this.normalizeSymbol(symbol),
        orderId,
      );

      if (statusResult.success && statusResult.data) {
        this.context.logger.debug("Order status retrieved from MEXC", {
          symbol,
          orderId,
          status: statusResult.data.status,
          executedQty: statusResult.data.executedQuantity,
          cummulativeQuoteQty: statusResult.data.cummulativeQuoteQuantity,
        });

        return {
          success: true,
          data: {
            status: statusResult.data.status,
            executedQty: statusResult.data.executedQuantity,
            cummulativeQuoteQty: statusResult.data.cummulativeQuoteQuantity,
            price: statusResult.data.price,
            type: statusResult.data.type,
            side: statusResult.data.side,
            quantity: statusResult.data.quantity,
            timestamp: statusResult.data.timestamp || new Date().toISOString(),
          },
        };
      } else {
        this.context.logger.warn("Failed to retrieve order status from MEXC", {
          symbol,
          orderId,
          error: statusResult.error,
        });

        return {
          success: false,
          error: statusResult.error || "Failed to retrieve order status",
        };
      }
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Exception while verifying order status", {
        symbol,
        orderId,
        error: safeError.message,
      });

      return {
        success: false,
        error: safeError.message,
      };
    }
  }

  /**
   * Validate price against exchange limits to prevent order rejections
   */
  private async validatePriceLimits(
    symbol: string,
    orderPrice: number,
    currentPrice: number,
  ): Promise<void> {
    try {
      // Get symbol trading rules including price filters
      const tradeRules = await this.getSymbolTradeRules(symbol);

      // Soft-check against exchange price limits and tick size: we will clamp later
      const adjusted = this.adjustPrice(orderPrice, tradeRules);
      if (tradeRules.maxPrice && orderPrice > tradeRules.maxPrice) {
        this.context.logger.warn("Order price exceeds maxPrice; will clamp before submit", {
          symbol,
          orderPrice,
          maxPrice: tradeRules.maxPrice,
          adjusted,
        });
      }

      if (tradeRules.minPrice && orderPrice < tradeRules.minPrice) {
        this.context.logger.warn("Order price below minPrice; will clamp before submit", {
          symbol,
          orderPrice,
          minPrice: tradeRules.minPrice,
          adjusted,
        });
      }

      // Additional safety check: prevent orders with prices too far from current market
      const maxPriceDeviation = 0.5; // 50% deviation from current price
      const priceDeviation = Math.abs(orderPrice - currentPrice) / currentPrice;

      if (priceDeviation > maxPriceDeviation) {
        this.context.logger.warn("Order price significantly deviates from market price", {
          symbol,
          orderPrice,
          currentPrice,
          deviation: `${(priceDeviation * 100).toFixed(2)}%`,
          maxAllowed: `${(maxPriceDeviation * 100).toFixed(2)}%`,
        });
      }

      // Log price validation success
      this.context.logger.debug("Price validation passed", {
        symbol,
        orderPrice,
        currentPrice,
        maxPrice: tradeRules.maxPrice,
        minPrice: tradeRules.minPrice,
        tickSize: tradeRules.tickSize,
      });
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Price validation encountered error (will rely on clamping)", {
        symbol,
        orderPrice,
        currentPrice,
        error: safeError.message,
      });
      // Do not throw here; execution path will clamp the price prior to submit
    }
  }

  /**
   * Execute order with advanced retry logic (handles Error 10007 with exponential backoff)
   */
  private async executeOrderWithRetry(
    orderParams: TradeParameters,
    maxRetries: number = 3,
  ): Promise<ServiceResponse<any>> {
    // Retry configuration with exponential backoff
    const retryConfig = {
      maxRetries,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 1.5,
    };

    // Create order execution function that preserves existing logic
    const orderFn = async () => {
      try {
        // Convert TradeParameters to the format expected by MEXC service
        const mexcOrderData: any = {
          symbol: this.normalizeSymbol(orderParams.symbol),
          side: orderParams.side,
          type: orderParams.type,
        };

        // Fetch symbol trade rules (step size / precision) to build valid quantity
        const tradeRules = await this.getSymbolTradeRules(mexcOrderData.symbol);

        // Add optional properties only if they're defined
        if (orderParams.quantity) {
          const adjusted = this.adjustQuantity(orderParams.quantity, tradeRules);
          mexcOrderData.quantity = this.formatQuantity(adjusted, tradeRules);
        }

        // Price handling: never include price for MARKET orders
        if (orderParams.type === "MARKET") {
          if (mexcOrderData.price) delete mexcOrderData.price;
        } else if (orderParams.price) {
          const adjustedPrice = this.adjustPrice(orderParams.price, tradeRules);
          mexcOrderData.price = this.formatPrice(adjustedPrice, tradeRules);
        }

        if (orderParams.timeInForce) {
          mexcOrderData.timeInForce = orderParams.timeInForce;
        }

        // If using quoteOrderQty (for market orders), we need to handle this differently
        if (orderParams.quoteOrderQty && orderParams.type === "MARKET") {
          if (orderParams.side === "BUY") {
            const aggregateResult = await this.executeQuoteOrderQuantityBuy(
              orderParams,
              mexcOrderData,
              tradeRules,
            );
            if (aggregateResult) {
              (mexcOrderData as any).__aggregateResult = aggregateResult;
            }
          } else {
            // For sell orders, quantity should be provided directly
            if (!orderParams.quantity) {
              throw new Error("Quantity required for SELL orders");
            }
            const adjusted = this.adjustQuantity(orderParams.quantity, tradeRules);
            mexcOrderData.quantity = this.formatQuantity(adjusted, tradeRules);
          }
        }

        this.context.logger.debug("Placing order with computed order params", {
          symbol: mexcOrderData.symbol,
          side: mexcOrderData.side,
          type: mexcOrderData.type,
          quantity: mexcOrderData.quantity,
          price: mexcOrderData.price,
          rules: tradeRules,
        });

        // If we aggregated via multi-order budget split, use that result directly
        let result = (mexcOrderData as any).__aggregateResult
          ? (mexcOrderData as any).__aggregateResult
          : await this.context.mexcService.placeOrder(mexcOrderData);

        // If price limit error and this is a LIMIT order, try converting to MARKET order
        if (
          !result.success &&
          mexcOrderData.type === "LIMIT" &&
          (result.error?.includes("Order price cannot exceed") || result.error?.includes("30010"))
        ) {
          this.context.logger.warn("Price limit exceeded, converting LIMIT order to MARKET order", {
            symbol: mexcOrderData.symbol,
            originalPrice: mexcOrderData.price,
            originalType: mexcOrderData.type,
            error: result.error,
          });

          // Convert to market order
          const marketOrderData = { ...mexcOrderData };
          delete marketOrderData.price; // Remove price for market order
          marketOrderData.type = "MARKET";

          result = await this.context.mexcService.placeOrder(marketOrderData);

          if (result.success) {
            this.context.logger.info("Successfully converted to market order", {
              symbol: mexcOrderData.symbol,
              orderId: result.data?.orderId,
            });
          }
        }

        if (result.success) {
          // Enhanced validation: verify order status if initial response is incomplete
          const orderData = result.data || {};
          const hasCompleteStatus = orderData.status && orderData.executedQty !== undefined;

          if (!hasCompleteStatus && orderData.orderId) {
            this.context.logger.info("Order placed but status incomplete, verifying with MEXC", {
              symbol: orderParams.symbol,
              orderId: orderData.orderId,
              initialStatus: orderData.status,
              initialExecutedQty: orderData.executedQty,
            });

            // Query MEXC for actual order status
            const statusResult = await this.verifyOrderStatus(
              orderParams.symbol,
              orderData.orderId,
            );

            if (statusResult.success && statusResult.data) {
              // Merge the verified status data
              result.data = { ...orderData, ...statusResult.data };
              this.context.logger.info("Order status verified successfully", {
                symbol: orderParams.symbol,
                orderId: orderData.orderId,
                verifiedStatus: statusResult.data.status,
                verifiedExecutedQty: statusResult.data.executedQty,
              });
            } else {
              this.context.logger.warn("Failed to verify order status, using initial response", {
                symbol: orderParams.symbol,
                orderId: orderData.orderId,
                error: statusResult.error,
              });
            }
          }

          return {
            success: true,
            data: result.data,
            timestamp: new Date().toISOString(),
          };
        } else {
          // Return error in MexcServiceResponse format for retry detection
          return {
            success: false,
            error: result.error || "Order execution failed",
            timestamp: Date.now(),
            source: "order-execution",
          };
        }
      } catch (error) {
        // Return error for retry detection
        const safeError = toSafeError(error);
        return {
          success: false,
          error: safeError.message,
          timestamp: Date.now(),
          source: "order-execution",
        };
      }
    };

    // Use advanced retry logic with Error 10007 detection
    try {
      const result = await executeOrderWithRetry(orderFn, retryConfig);

      if (result.success) {
        return {
          success: true,
          data: result.data,
          timestamp: new Date().toISOString(),
        };
      }

      throw new Error(result.error || "Order execution failed");
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Order execution failed after all retries", {
        symbol: orderParams.symbol,
        error: safeError,
      });
      throw error;
    }
  }

  /**
   * Create position tracking entry
   */
  private async createPositionEntry(
    orderResult: any,
    params: TradeParameters,
    currentPrice: number,
    targetId?: number,
  ): Promise<Position> {
    const positionId = `${params.symbol}-${orderResult.orderId}-${Date.now()}`;
    const entryPrice = parseFloat(orderResult.price) || currentPrice;
    const quantity = parseFloat(orderResult.executedQty || orderResult.origQty);

    const position: Position = {
      id: positionId,
      symbol: params.symbol,
      side: params.side,
      orderId: orderResult.orderId.toString(),
      clientOrderId: orderResult.clientOrderId,
      snipeTargetId: targetId,
      entryPrice,
      quantity,
      currentPrice: entryPrice,
      stopLossPercent: params.stopLossPercent,
      takeProfitPercent: params.takeProfitPercent,
      timestamp: new Date().toISOString(),
      status: "open",
      openTime: new Date(),
      strategy: params.strategy || "auto-snipe",
      confidenceScore: params.confidenceScore,
      autoSnipe: true,
      paperTrade: this.context.config.enablePaperTrading,
      tags: ["auto-snipe"],
      userId: params.userId,
    };

    // Calculate stop-loss and take-profit prices
    if (params.stopLossPercent && params.stopLossPercent > 0) {
      if (params.side === "BUY") {
        position.stopLossPrice = entryPrice * (1 - params.stopLossPercent / 100);
      } else {
        position.stopLossPrice = entryPrice * (1 + params.stopLossPercent / 100);
      }
    }

    if (params.takeProfitPercent && params.takeProfitPercent > 0) {
      if (params.side === "BUY") {
        position.takeProfitPrice = entryPrice * (1 + params.takeProfitPercent / 100);
      } else {
        position.takeProfitPrice = entryPrice * (1 - params.takeProfitPercent / 100);
      }
    }

    // Store position in active positions map
    this.activePositions.set(positionId, position);
    if (typeof targetId === "number") {
      this.positionByTargetId.set(targetId, positionId);
    }

    this.context.logger.info("Position created", {
      positionId,
      symbol: params.symbol,
      side: params.side,
      entryPrice,
      quantity,
      stopLossPrice: position.stopLossPrice,
      takeProfitPrice: position.takeProfitPrice,
    });

    return position;
  }

  /**
   * Shared method for setting up price level monitoring (stop-loss or take-profit)
   */
  private setupPriceLevelMonitoring(config: PriceLevelMonitoringConfig): void {
    const { position, monitorType, triggerPrice, isStopLoss, pendingTimers, executeCallback } =
      config;
    if (!triggerPrice) return;

    const checkInterval = 5000; // Check every 5 seconds

    this.context.logger.debug(`Setting up ${monitorType} monitoring`, {
      positionId: position.id,
      symbol: position.symbol,
      triggerPrice,
      side: position.side,
    });

    const monitor = async () => {
      try {
        // If target was deleted or no longer open, stop monitoring
        if (typeof position.snipeTargetId === "number") {
          const rows = await db
            .select({
              id: snipeTargets.id,
              executionStatus: snipeTargets.executionStatus,
              actualPositionSize: snipeTargets.actualPositionSize,
            })
            .from(snipeTargets)
            .where(eq(snipeTargets.id, position.snipeTargetId));
          const existsAndOpen =
            Array.isArray(rows) &&
            rows.length > 0 &&
            rows[0].executionStatus === "success" &&
            (rows[0].actualPositionSize ?? 0) > 0;
          if (!existsAndOpen) {
            this.context.logger.info(
              `${monitorType} monitor: target removed or closed; stopping monitoring`,
              {
                positionId: position.id,
                snipeTargetId: position.snipeTargetId,
              },
            );
            this.cleanupPositionMonitoring(position.id);
            this.activePositions.delete(position.id);
            return;
          }
        }

        const currentPrice = await this.getCurrentMarketPrice(position.symbol);
        if (currentPrice === null || currentPrice === undefined || Number.isNaN(currentPrice)) {
          this.context.logger.debug(`${monitorType} monitor: price unavailable`, {
            positionId: position.id,
            symbol: position.symbol,
          });
          const retryTimer = setTimeout(monitor, checkInterval);
          pendingTimers.set(position.id, retryTimer);
          return;
        }

        // Update position current price
        position.currentPrice = currentPrice;

        this.context.logger.debug(`${monitorType} monitor tick`, {
          positionId: position.id,
          symbol: position.symbol,
          currentPrice,
          triggerPrice,
        });

        // Check if trigger condition is met
        const shouldTrigger = shouldTriggerPriceLevel(
          position,
          currentPrice,
          triggerPrice,
          isStopLoss,
        );

        if (shouldTrigger) {
          await executeCallback(position);
        } else {
          // Continue monitoring
          const timer = setTimeout(monitor, checkInterval);
          pendingTimers.set(position.id, timer);
        }
      } catch (error) {
        const safeError = toSafeError(error);
        this.context.logger.error(`${monitorType} monitoring error`, {
          positionId: position.id,
          error: safeError.message,
        });
        const retryTimer = setTimeout(monitor, checkInterval);
        pendingTimers.set(position.id, retryTimer);
      }
    };

    const existingTimer = pendingTimers.get(position.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Start monitoring
    const timer = setTimeout(monitor, checkInterval);
    pendingTimers.set(position.id, timer);
  }

  /**
   * Setup stop-loss monitoring for a position
   */
  private setupStopLossMonitoring(position: Position): void {
    this.setupPriceLevelMonitoring({
      position,
      monitorType: "stop-loss",
      triggerPrice: position.stopLossPrice,
      isStopLoss: true,
      pendingTimers: this.pendingStopLosses,
      executeCallback: (pos) => this.executeStopLoss(pos),
    });
  }

  /**
   * Setup take-profit monitoring for a position
   */
  private setupTakeProfitMonitoring(position: Position): void {
    this.setupPriceLevelMonitoring({
      position,
      monitorType: "take-profit",
      triggerPrice: position.takeProfitPrice,
      isStopLoss: false,
      pendingTimers: this.pendingTakeProfits,
      executeCallback: (pos) => this.executeTakeProfit(pos),
    });
  }

  /**
   * Execute stop-loss for a position
   */
  private async executeStopLoss(position: Position): Promise<void> {
    try {
      this.context.logger.info("Executing stop-loss", {
        positionId: position.id,
        symbol: position.symbol,
        currentPrice: position.currentPrice,
        stopLossPrice: position.stopLossPrice,
      });

      const closeParams: TradeParameters = {
        symbol: position.symbol,
        side: position.side === "BUY" ? "SELL" : "BUY",
        type: "MARKET",
        quantity: position.quantity,
        timeInForce: "IOC",
      };

      const closeResult = await this.executeOrderWithRetry(closeParams);

      if (closeResult.success) {
        const entryValue = position.entryPrice * position.quantity;
        const exitValue = (position.currentPrice || 0) * position.quantity;
        const realizedPnL =
          position.side === "BUY" ? exitValue - entryValue : entryValue - exitValue;

        position.status = "closed";
        position.closeTime = new Date();
        position.realizedPnL = realizedPnL;

        this.cleanupPositionMonitoring(position.id);
        this.activePositions.delete(position.id);
        if (typeof position.snipeTargetId === "number") {
          this.positionByTargetId.delete(position.snipeTargetId);
          await this.updateSnipeTargetStatus(position.snipeTargetId, "completed", undefined, {
            executionStatus: "closed",
            actualPositionSize: 0,
            executionPrice: position.currentPrice ?? position.entryPrice,
          });
          const saleUserId = await this.resolveUserIdForSnipe(
            position.userId || this.currentUserId || "system",
            position.snipeTargetId as number,
          );
          const vcoinIdResolved = await this.getVcoinIdForTarget(
            position.snipeTargetId,
            position.symbol,
          );
          await savePositionCloseHistory(
            position,
            closeResult,
            saleUserId,
            position.snipeTargetId,
            vcoinIdResolved,
          );
        }

        this.context.eventEmitter.emit("position_closed", position);

        this.context.logger.info("Stop-loss executed successfully", {
          positionId: position.id,
          realizedPnL,
          closeOrderId: closeResult.data?.orderId,
        });
      } else {
        throw new Error(closeResult.error || "Failed to execute stop-loss order");
      }
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Stop-loss execution failed", {
        positionId: position.id,
        error: safeError.message,
      });
    }
  }

  /**
   * Execute take-profit for a position
   */
  private async executeTakeProfit(position: Position): Promise<void> {
    try {
      this.context.logger.info("Executing take-profit", {
        positionId: position.id,
        symbol: position.symbol,
        currentPrice: position.currentPrice,
        takeProfitPrice: position.takeProfitPrice,
      });

      const closeParams: TradeParameters = {
        symbol: position.symbol,
        side: position.side === "BUY" ? "SELL" : "BUY",
        type: "MARKET",
        quantity: position.quantity,
        timeInForce: "IOC",
      };

      const closeResult = await this.executeOrderWithRetry(closeParams);

      if (closeResult.success) {
        const exitPrice = position.currentPrice || position.entryPrice;
        const realizedPnL = calculateRealizedPnL(position, exitPrice);

        position.status = "closed";
        position.closeTime = new Date();
        position.realizedPnL = realizedPnL;

        this.cleanupPositionMonitoring(position.id);
        this.activePositions.delete(position.id);
        if (typeof position.snipeTargetId === "number") {
          this.positionByTargetId.delete(position.snipeTargetId);
          await this.updateSnipeTargetStatus(position.snipeTargetId, "completed", undefined, {
            executionStatus: "closed",
            actualPositionSize: 0,
            executionPrice: position.currentPrice ?? position.entryPrice,
          });
          // Persist take-profit sell execution history
          const saleUserId = await this.resolveUserIdForSnipe(
            position.userId || this.currentUserId || "system",
            position.snipeTargetId as number,
          );
          const vcoinIdResolved = await this.getVcoinIdForTarget(
            position.snipeTargetId,
            position.symbol,
          );
          await savePositionCloseHistory(
            position,
            closeResult,
            saleUserId,
            position.snipeTargetId,
            vcoinIdResolved,
          );
        }

        this.context.eventEmitter.emit("position_closed", position);

        this.context.logger.info("Take-profit executed successfully", {
          positionId: position.id,
          realizedPnL,
          closeOrderId: closeResult.data?.orderId,
        });
      } else {
        throw new Error(closeResult.error || "Failed to execute take-profit order");
      }
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Take-profit execution failed", {
        positionId: position.id,
        error: safeError.message,
      });
    }
  }

  /**
   * Cleanup position monitoring timers
   */
  private cleanupPositionMonitoring(positionId: string): void {
    // Clear stop-loss timer
    const stopLossTimer = this.pendingStopLosses.get(positionId);
    if (stopLossTimer) {
      clearTimeout(stopLossTimer);
      this.pendingStopLosses.delete(positionId);
    }

    // Clear take-profit timer
    const takeProfitTimer = this.pendingTakeProfits.get(positionId);
    if (takeProfitTimer) {
      clearTimeout(takeProfitTimer);
      this.pendingTakeProfits.delete(positionId);
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return this.context.config;
  }

  /**
   * Check if ready for trading
   */
  isReadyForTrading(): boolean {
    return this.state.isInitialized && this.state.isHealthy;
  }

  /**
   * Validate configuration
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      // Basic validation logic
      const config = this.context.config;
      return (
        config &&
        typeof config.autoSnipingEnabled === "boolean" &&
        typeof config.confidenceThreshold === "number" &&
        config.confidenceThreshold >= 0 &&
        config.confidenceThreshold <= 100
      );
    } catch (_error) {
      return false;
    }
  }

  /**
   * Perform health checks
   */
  async performHealthChecks(): Promise<boolean> {
    try {
      // Basic health check logic
      return this.state.isInitialized && this.state.isHealthy;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalPnL = Array.from(this.activePositions.values()).reduce(
      (sum, pos) => sum + (pos.realizedPnL || 0),
      0,
    );

    return {
      activePositions: this.activePositions.size,
      totalTrades: this.processedTargets,
      successfulTrades: this.successfulSnipes,
      failedTrades: this.failedSnipes,
      successRate:
        this.processedTargets > 0 ? (this.successfulSnipes / this.processedTargets) * 100 : 0,
      totalPnL,
      averagePnL: this.processedTargets > 0 ? totalPnL / this.processedTargets : 0,
      pendingStopLosses: this.pendingStopLosses.size,
      pendingTakeProfits: this.pendingTakeProfits.size,
      timestamp: Date.now(),
    };
  }

  /**
   * Update statistics
   */
  updateStats(stats: StatsUpdate): void {
    // Update internal metrics with provided stats
    if (stats.totalTrades !== undefined) {
      this.processedTargets = stats.totalTrades;
    }
    if (stats.successfulTrades !== undefined) {
      this.successfulSnipes = stats.successfulTrades;
    }
    if (stats.failedTrades !== undefined) {
      this.failedSnipes = stats.failedTrades;
    }
    if (stats.timestamp !== undefined) {
      this.state.lastActivity = new Date(stats.timestamp);
    }

    // Update state metrics
    this.state.metrics.processedTargets = this.processedTargets;
    this.state.metrics.successfulSnipes = this.successfulSnipes;
    this.state.metrics.failedSnipes = this.failedSnipes;
    this.state.metrics.averageConfidence =
      this.processedTargets > 0 ? (this.successfulSnipes / this.processedTargets) * 100 : 0;
  }

  /**
   * Check if execution is active
   */
  isExecutionActive(): boolean {
    return this.isActive;
  }

  /**
   * Get active positions
   */
  getActivePositions(): Position[] {
    return Array.from(this.activePositions.values());
  }

  /**
   * Stop execution (alias for stop method)
   */
  async stopExecution(): Promise<ServiceResponse<void>> {
    return this.stop();
  }

  /**
   * Emergency close all positions
   */
  async emergencyCloseAll(): Promise<number> {
    const positions = this.getActivePositions();
    let closedCount = 0;

    for (const position of positions) {
      try {
        const result = await this.closePosition(position.id, "emergency_close");
        if (result.success) {
          closedCount++;
        }
      } catch (error) {
        this.context.logger.error(`Failed to close position ${position.id}`, {
          error: (error as Error).message,
        });
      }
    }

    this.context.logger.warn(`Emergency closed ${closedCount}/${positions.length} positions`);
    return closedCount;
  }

  /**
   * Update position size
   */
  async updatePositionSize(positionId: string, newSize: number): Promise<ServiceResponse<void>> {
    try {
      const position = this.activePositions.get(positionId);
      if (!position) {
        return {
          success: false,
          error: `Position ${positionId} not found`,
          timestamp: new Date().toISOString(),
        };
      }

      // Update position size (this is a simulation for now)
      position.quantity = newSize;
      this.activePositions.set(positionId, position);

      this.context.logger.info(`Updated position ${positionId} size to ${newSize}`);
      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const safeError = toSafeError(error);
      return {
        success: false,
        error: safeError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Manually close a position
   */
  async closePosition(
    positionId: string,
    reason: string = "manual",
  ): Promise<ServiceResponse<void>> {
    try {
      const position = this.activePositions.get(positionId);
      if (!position) {
        return {
          success: false,
          error: `Position ${positionId} not found`,
          timestamp: new Date().toISOString(),
        };
      }

      // Place opposite order to close position
      const closeParams: TradeParameters = {
        symbol: position.symbol,
        side: position.side === "BUY" ? "SELL" : "BUY",
        type: "MARKET",
        quantity: position.quantity,
        timeInForce: "IOC",
      };

      const closeResult = await this.executeOrderWithRetry(closeParams);

      if (closeResult.success) {
        // Calculate realized PnL
        const currentPrice =
          (await this.getCurrentMarketPrice(position.symbol)) ||
          position.currentPrice ||
          position.entryPrice;
        const entryValue = position.entryPrice * position.quantity;
        const exitValue = currentPrice * position.quantity;
        const realizedPnL =
          position.side === "BUY" ? exitValue - entryValue : entryValue - exitValue;

        // Update position
        position.status = "closed";
        position.closeTime = new Date();
        position.realizedPnL = realizedPnL;
        position.notes = `Closed manually: ${reason}`;

        // Clean up monitoring
        this.cleanupPositionMonitoring(position.id);
        this.activePositions.delete(position.id);
        if (typeof position.snipeTargetId === "number") {
          this.positionByTargetId.delete(position.snipeTargetId);
          await this.updateSnipeTargetStatus(position.snipeTargetId, "completed", undefined, {
            executionStatus: "closed",
            actualPositionSize: 0,
            executionPrice: currentPrice,
          });
        }

        // Emit position closed event
        this.context.eventEmitter.emit("position_closed", position);

        this.context.logger.info("Position closed manually", {
          positionId,
          reason,
          realizedPnL,
          closeOrderId: closeResult.data?.orderId,
        });

        return {
          success: true,
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          success: false,
          error: closeResult.error || "Failed to close position",
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      const safeError = toSafeError(error);
      this.context.logger.error("Failed to close position manually", {
        positionId,
        error: safeError.message,
      });

      return {
        success: false,
        error: safeError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Close all active positions
   */
  async closeAllPositions(
    reason: string = "shutdown",
  ): Promise<ServiceResponse<{ closed: number; failed: number }>> {
    const positions = Array.from(this.activePositions.keys());
    let closed = 0;
    let failed = 0;

    for (const positionId of positions) {
      try {
        const result = await this.closePosition(positionId, reason);
        if (result.success) {
          closed++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        const safeError = toSafeError(error);
        this.context.logger.error(`Failed to close position ${positionId}`, safeError);
      }
    }

    this.context.logger.info("Batch position close completed", {
      total: positions.length,
      closed,
      failed,
      reason,
    });

    return {
      success: true,
      data: { closed, failed },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get position by ID
   */
  getPosition(positionId: string): Position | null {
    return this.activePositions.get(positionId) || null;
  }

  /**
   * Get positions by symbol
   */
  getPositionsBySymbol(symbol: string): Position[] {
    return Array.from(this.activePositions.values()).filter((pos) => pos.symbol === symbol);
  }

  /**
   * Update position price level (stop-loss or take-profit)
   */
  private async updatePositionPriceLevel(
    positionId: string,
    newPercent: number,
    isStopLoss: boolean,
  ): Promise<ServiceResponse<void>> {
    try {
      const position = this.activePositions.get(positionId);
      if (!position) {
        return {
          success: false,
          error: `Position ${positionId} not found`,
          timestamp: new Date().toISOString(),
        };
      }

      // Clear existing monitoring
      const timerMap = isStopLoss ? this.pendingStopLosses : this.pendingTakeProfits;
      const existingTimer = timerMap.get(positionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        timerMap.delete(positionId);
      }

      // Update price level
      if (isStopLoss) {
        position.stopLossPercent = newPercent;
      } else {
        position.takeProfitPercent = newPercent;
      }

      if (newPercent > 0) {
        const multiplier = isStopLoss
          ? position.side === "BUY"
            ? 1 - newPercent / 100
            : 1 + newPercent / 100
          : position.side === "BUY"
            ? 1 + newPercent / 100
            : 1 - newPercent / 100;

        const priceLevel = position.entryPrice * multiplier;
        if (isStopLoss) {
          position.stopLossPrice = priceLevel;
        } else {
          position.takeProfitPrice = priceLevel;
        }

        // Setup new monitoring
        if (isStopLoss) {
          this.setupStopLossMonitoring(position);
        } else {
          this.setupTakeProfitMonitoring(position);
        }
      } else {
        if (isStopLoss) {
          position.stopLossPrice = undefined;
        } else {
          position.takeProfitPrice = undefined;
        }
      }

      const levelType = isStopLoss ? "stop-loss" : "take-profit";
      this.context.logger.info(`Position ${levelType} updated`, {
        positionId,
        [`new${isStopLoss ? "StopLoss" : "TakeProfit"}Percent`]: newPercent,
        [`new${isStopLoss ? "StopLoss" : "TakeProfit"}Price`]: isStopLoss
          ? position.stopLossPrice
          : position.takeProfitPrice,
      });

      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const safeError = toSafeError(error);
      return {
        success: false,
        error: safeError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Update position stop-loss
   */
  async updatePositionStopLoss(
    positionId: string,
    newStopLossPercent: number,
  ): Promise<ServiceResponse<void>> {
    return this.updatePositionPriceLevel(positionId, newStopLossPercent, true);
  }

  /**
   * Update position take-profit
   */
  async updatePositionTakeProfit(
    positionId: string,
    newTakeProfitPercent: number,
  ): Promise<ServiceResponse<void>> {
    return this.updatePositionPriceLevel(positionId, newTakeProfitPercent, false);
  }

  private async rehydrateOpenPositions(): Promise<void> {
    const rows = await db
      .select({
        id: snipeTargets.id,
        symbolName: snipeTargets.symbolName,
        entryStrategy: snipeTargets.entryStrategy,
        executionPrice: snipeTargets.executionPrice,
        actualPositionSize: snipeTargets.actualPositionSize,
        stopLossPercent: snipeTargets.stopLossPercent,
        takeProfitCustom: snipeTargets.takeProfitCustom,
        confidenceScore: snipeTargets.confidenceScore,
        createdAt: snipeTargets.createdAt,
      })
      .from(snipeTargets)
      .where(
        and(
          eq(snipeTargets.status, "completed"),
          eq(snipeTargets.executionStatus, "success"),
          gt(snipeTargets.actualPositionSize, 0),
        ),
      );

    if (!rows.length) {
      return;
    }

    this.context.logger.info("Rehydrating open positions", {
      count: rows.length,
    });

    for (const row of rows) {
      if (!row.executionPrice || !row.actualPositionSize) {
        continue;
      }

      // Determine position size (USDT) dynamically when not explicitly set
      // Use actualPositionSize as the quantity, default to 1 USDT if not set
      const _dynamicSizeUsdt =
        row.actualPositionSize && row.actualPositionSize > 0 ? row.actualPositionSize : 1;

      const position: Position = {
        id: `${row.symbolName}-${row.id}-rehydrated-${Date.now()}`,
        symbol: row.symbolName,
        side: "BUY",
        orderId: `rehydrated-${row.id}`,
        entryPrice: row.executionPrice,
        quantity: row.actualPositionSize,
        currentPrice: row.executionPrice,
        stopLossPercent: row.stopLossPercent || undefined,
        takeProfitPercent: row.takeProfitCustom || undefined,
        timestamp: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
        status: "open",
        openTime: row.createdAt ?? new Date(),
        strategy: row.entryStrategy || "normal",
        confidenceScore: row.confidenceScore ?? undefined,
        tags: ["rehydrated"],
        snipeTargetId: row.id,
        userId: row.userId,
      };

      if (row.stopLossPercent && row.stopLossPercent > 0) {
        position.stopLossPrice = row.executionPrice * (1 - row.stopLossPercent / 100);
      }
      if (row.takeProfitCustom && row.takeProfitCustom > 0) {
        position.takeProfitPrice = row.executionPrice * (1 + row.takeProfitCustom / 100);
      }

      this.activePositions.set(position.id, position);
      this.positionByTargetId.set(row.id, position.id);
      if (position.stopLossPrice) {
        this.setupStopLossMonitoring(position);
      }
      if (position.takeProfitPrice) {
        this.setupTakeProfitMonitoring(position);
      }
    }
  }

  /**
   * Execute a market buy order using quote order quantity (splits into multiple orders if needed)
   */
  private async executeQuoteOrderQuantityBuy(
    orderParams: TradeParameters,
    mexcOrderData: any,
    tradeRules: {
      minNotional?: number;
      maxQty?: number;
      minQty?: number;
      stepSize?: number;
      tickSize?: number;
    },
  ): Promise<any | null> {
    // Get current market price to calculate quantity
    const currentPrice = await this.getCurrentMarketPrice(mexcOrderData.symbol);
    if (!currentPrice) {
      throw new Error(`Unable to get current price for ${orderParams.symbol}`);
    }
    let remainingQuote = orderParams.quoteOrderQty!;

    // If exchange imposes minNotional, ensure we meet it
    const minNotional = tradeRules.minNotional || 0;
    const maxQtyPerOrder = tradeRules.maxQty || Infinity;
    const minQtyPerOrder = tradeRules.minQty || 0;

    let totalExecutedQty = 0;
    let totalQuoteSpent = 0;
    let lastOrderResult: any = null;

    while (remainingQuote > 0) {
      // Implicit per-order notional cap via maxQty → convert using currentPrice
      const maxNotionalPerOrder = Number.isFinite(maxQtyPerOrder)
        ? maxQtyPerOrder * currentPrice
        : Infinity;
      const perOrderQuoteCap = Math.min(maxNotionalPerOrder, remainingQuote);

      // If remaining is below minNotional and minQty, break
      if (
        this.isInsufficientRemainingQuote(
          perOrderQuoteCap,
          minNotional,
          minQtyPerOrder,
          currentPrice,
        )
      ) {
        break;
      }

      // Compute a compliant quantity for this order
      const desiredQty = perOrderQuoteCap / currentPrice;
      let qty = this.adjustQuantity(desiredQty, tradeRules);

      // Ensure meets minimums
      const minQtyFromNotional = minNotional > 0 ? minNotional / currentPrice : 0;
      const requiredMinQty = Math.max(minQtyPerOrder, minQtyFromNotional);
      if (qty < requiredMinQty) {
        qty = this.adjustQuantity(requiredMinQty, tradeRules);
      }

      if (!qty || qty <= 0) break;

      const chunkOrder = {
        ...mexcOrderData,
        quantity: this.formatQuantity(qty, {
          lotSizeDecimals: tradeRules.stepSize
            ? Math.abs(Math.log10(tradeRules.stepSize))
            : undefined,
          baseAssetPrecision: tradeRules.stepSize
            ? Math.abs(Math.log10(tradeRules.stepSize))
            : undefined,
        }),
      };
      let placeRes = await this.context.mexcService.placeOrder(chunkOrder);

      // Retry once as MARKET if we somehow hit price-limit on LIMIT (defensive)
      if (
        !placeRes.success &&
        chunkOrder.type === "LIMIT" &&
        this.isPriceLimitError(placeRes.error)
      ) {
        const marketOrderData = { ...chunkOrder };
        delete (marketOrderData as any).price;
        marketOrderData.type = "MARKET";
        placeRes = await this.context.mexcService.placeOrder(marketOrderData);
      }

      if (!placeRes.success) {
        // Stop on first failure to avoid partial loops without visibility
        lastOrderResult = placeRes;
        break;
      }

      lastOrderResult = placeRes;
      const executedQty = Number(placeRes.data?.executedQty ?? placeRes.data?.quantity ?? qty);
      const spentQuote = Number(placeRes.data?.cummulativeQuoteQty ?? executedQty * currentPrice);
      totalExecutedQty += executedQty;
      totalQuoteSpent += spentQuote;
      remainingQuote = Math.max(0, remainingQuote - spentQuote);

      // If the remaining budget is too small to form a valid order, stop
      if (
        this.isInsufficientRemainingQuote(remainingQuote, minNotional, minQtyPerOrder, currentPrice)
      ) {
        break;
      }
      // If exchange reports zero fill and zero cost, avoid infinite loop
      if (this.hasZeroFill(executedQty, spentQuote)) break;
    }

    // Synthesize a single result representing the aggregate
    if (lastOrderResult) {
      // Mutate the last result to carry aggregate totals
      if (!lastOrderResult.data) lastOrderResult.data = {};
      lastOrderResult.data.executedQty = totalExecutedQty.toString?.() ?? totalExecutedQty;
      lastOrderResult.data.cummulativeQuoteQty = totalQuoteSpent.toString?.() ?? totalQuoteSpent;
      return lastOrderResult;
    }

    return null;
  }

  /**
   * Check if a price limit error occurred
   */
  private isPriceLimitError(error: string | undefined): boolean {
    if (!error) return false;
    return (
      error.includes("Order price cannot exceed") ||
      error.includes("30010") ||
      error.includes("price limit")
    );
  }

  /**
   * Check if remaining quote is insufficient for a valid order
   */
  private isInsufficientRemainingQuote(
    remainingQuote: number,
    minNotional: number,
    minQtyPerOrder: number,
    currentPrice: number,
  ): boolean {
    if (remainingQuote <= 0.0000001) return true;
    if (minNotional > 0 && remainingQuote < minNotional) return true;
    if (minQtyPerOrder > 0 && minQtyPerOrder * currentPrice > remainingQuote) return true;
    return false;
  }

  /**
   * Check if order execution resulted in zero fill
   */
  private hasZeroFill(executedQty: number, spentQuote: number): boolean {
    return (!executedQty || executedQty <= 0) && (!spentQuote || spentQuote <= 0);
  }
}
