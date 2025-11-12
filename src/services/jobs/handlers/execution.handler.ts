import { EventEmitter } from "node:events";
import { createSimpleLogger } from "@/src/lib/unified-logger";
import { UnifiedMexcServiceV2 } from "@/src/services/api/unified-mexc-service-v2";
import { MarketDataManager } from "@/src/services/data/websocket/market-data-manager";
import type { QueueJob } from "@/src/services/queues/supabase-queues";
import { AutoSnipingModule } from "@/src/services/trading/consolidated/core-trading/auto-sniping";
import { getCoreTrading } from "@/src/services/trading/consolidated/core-trading/base-service";
import type { ModuleContext } from "@/src/services/trading/consolidated/core-trading/types";
import { DatabaseOperations } from "@/src/services/trading/consolidated/core-trading/utils/database-operations";

const logger = createSimpleLogger("execution-handler");

/**
 * Handle execution job
 * Executes a snipe target using the core auto-sniping engine
 */
export async function handleExecutionJob(job: QueueJob) {
  try {
    const payload = job.payload as { targetId?: number; userId?: string };

    if (!payload?.targetId) {
      throw new Error("Missing targetId in execution job payload");
    }

    logger.info("Starting execution job", { targetId: payload.targetId, userId: payload.userId });

    // Get snipe target from database
    const target = await DatabaseOperations.getSnipeTargetById(payload.targetId);

    if (!target) {
      throw new Error(`Snipe target ${payload.targetId} not found`);
    }

    // Get core trading service instance to ensure it's initialized
    const coreTrading = await getCoreTrading();
    await coreTrading.getServiceStatus();

    // Create a module context for the auto-sniping module
    // We'll reuse the MEXC service and other dependencies from the core trading service
    const mexcService = new UnifiedMexcServiceV2({
      apiKey: process.env.MEXC_API_KEY || "",
      secretKey: process.env.MEXC_SECRET_KEY || "",
    });

    const marketDataManager = new MarketDataManager();

    // Create a minimal module context for execution
    const moduleContext: ModuleContext = {
      config: {
        apiKey: process.env.MEXC_API_KEY || "",
        secretKey: process.env.MEXC_SECRET_KEY || "",
        enablePaperTrading: false,
        maxConcurrentPositions: 10,
        defaultStrategy: "normal",
      },
      mexcService,
      tradingStrategy: {
        closePosition: async (_positionId, _reason) => ({
          success: true,
          data: undefined,
          timestamp: new Date().toISOString(),
        }),
      },
      orderExecutor: {
        executePaperSnipe: async (_params) => ({
          success: false,
          error: "Paper trading not supported in job execution",
          timestamp: new Date().toISOString(),
        }),
        executeRealSnipe: async (_params) => ({
          success: false,
          error: "Real trading not supported in job execution",
          timestamp: new Date().toISOString(),
        }),
        createPositionEntry: async (_params, _result) => ({
          id: `position-${Date.now()}`,
          symbol: _params.symbol,
          side: _params.side || "BUY",
          orderId: _result.orderId || `order-${Date.now()}`,
          entryPrice: _params.price || 0,
          quantity: _params.quantity || 0,
          timestamp: new Date().toISOString(),
          status: "open" as const,
          openTime: new Date(),
          strategy: _params.strategy || "default",
          tags: ["job-execution"],
        }),
      },
      positionManager: {
        setupPositionMonitoring: async () => {},
        updatePositionStopLoss: async () => ({
          success: true,
          data: undefined,
          timestamp: new Date().toISOString(),
        }),
        updatePositionTakeProfit: async () => ({
          success: true,
          data: undefined,
          timestamp: new Date().toISOString(),
        }),
        getActivePositions: () => new Map(),
        createPositionEntry: async (_tradeParams, symbol) => ({
          id: `${symbol}-${Date.now()}`,
          symbol,
          side: "BUY",
          orderId: `order-${Date.now()}`,
          entryPrice: 0,
          quantity: 0,
          timestamp: new Date().toISOString(),
          status: "open" as const,
          openTime: new Date(),
          strategy: "default",
          tags: ["job-execution"],
        }),
      },
      marketDataService: {
        getCurrentPrice: async (_symbol) => ({ price: 0 }),
      },
      logger: {
        info: (msg, ctx) => logger.info(msg, ctx),
        warn: (msg, ctx) => logger.warn(msg, ctx),
        error: (msg, ctx) => logger.error(msg, ctx),
        debug: (msg, ctx) => logger.debug(msg, ctx),
      },
      eventEmitter: new EventEmitter(),
    };

    // Create and initialize auto-sniping module
    const autoSnipingModule = new AutoSnipingModule(moduleContext);
    await autoSnipingModule.initialize();

    // Execute the snipe target
    const result = await autoSnipingModule.executeSnipeTarget(target, payload.userId);

    logger.info("Execution job completed", {
      targetId: payload.targetId,
      success: result.success,
      orderId: result.orderId,
    });

    return {
      success: result.success,
      result,
    };
  } catch (error) {
    logger.error("Execution job failed", {}, error as Error);
    throw error;
  }
}
