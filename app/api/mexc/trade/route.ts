import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/src/db";
import type { NewExecutionHistory } from "@/src/db/schemas/trading";
import { apiCredentials, executionHistory } from "@/src/db/schemas/trading";
import {
  apiResponse,
  createErrorResponse,
  createSuccessResponse,
  HTTP_STATUS,
} from "@/src/lib/api-response";
import { getCachedCredentials } from "@/src/lib/credential-cache";
import { requireAuthFromRequest } from "@/src/lib/supabase-auth-server";
import { getLogger } from "@/src/lib/unified-logger";
import type { OrderParameters } from "@/src/services/api/mexc-client-types";
import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";
import { transactionLockService } from "@/src/services/data/transaction-lock-service";
// Risk management service removed in minimization - manual trade risk assessment disabled
// import { enhancedRiskManagementService } from "@/src/services/risk/enhanced-risk-management-service";

export async function POST(request: NextRequest) {
  const logger = getLogger("mexc-trade-api");
  try {
    // Get authenticated user
    const user = await requireAuthFromRequest(request);
    const userId = user.id;
    logger.info("Trade request received", { email: user.email, userId });

    const body = await request.json();
    const { symbol, side, type, quantity, price, snipeTargetId, skipLock } = body;

    // Get API credentials - try database first, then fallback to environment
    let apiKey: string;
    let secretKey: string;
    let credentialSource: string;

    // Try database credentials first
    const credentials = await db
      .select({
        id: apiCredentials.id,
        encryptedApiKey: apiCredentials.encryptedApiKey,
        encryptedSecretKey: apiCredentials.encryptedSecretKey,
        encryptedPassphrase: apiCredentials.encryptedPassphrase,
        userId: apiCredentials.userId,
        provider: apiCredentials.provider,
        isActive: apiCredentials.isActive,
      })
      .from(apiCredentials)
      .where(
        and(
          eq(apiCredentials.userId, userId),
          eq(apiCredentials.provider, "mexc"),
          eq(apiCredentials.isActive, true),
        ),
      )
      .limit(1);

    if (credentials[0]) {
      // Use database credentials (decrypt them)
      try {
        const decrypted = await getCachedCredentials(
          userId,
          credentials[0].encryptedApiKey,
          credentials[0].encryptedSecretKey,
          credentials[0].encryptedPassphrase,
        );
        apiKey = decrypted.apiKey;
        secretKey = decrypted.secretKey;
        credentialSource = "database";
        logger.info("Using database credentials", { userId });
      } catch (decryptError) {
        logger.error(
          "Failed to decrypt database credentials",
          { userId },
          decryptError instanceof Error ? decryptError : new Error(String(decryptError)),
        );
        // Fall through to environment fallback
      }
    }

    // Fallback to environment variables if database credentials not available
    if (!apiKey || !secretKey) {
      const envApiKey = process.env.MEXC_API_KEY?.trim();
      const envSecretKey = process.env.MEXC_SECRET_KEY?.trim();

      if (envApiKey && envSecretKey) {
        apiKey = envApiKey;
        secretKey = envSecretKey;
        credentialSource = "environment";
        logger.info("Using environment credentials", { userId });
      } else {
        return apiResponse(
          createErrorResponse("No MEXC API credentials found", {
            message: "Please configure MEXC API credentials in settings or environment variables",
            details: {
              databaseCredentials: !!credentials[0],
              environmentCredentials: !!(envApiKey && envSecretKey),
            },
          }),
          HTTP_STATUS.BAD_REQUEST,
        );
      }
    }

    // Validate required parameters
    if (!symbol || !side || !type || !quantity) {
      return apiResponse(
        createErrorResponse("Missing required trading parameters", {
          message: "Symbol, side, type, and quantity are required",
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    logger.info("Processing trade order", { side, symbol, userId });

    // Create resource ID for locking
    const resourceId = `trade:${symbol}:${side}:${snipeTargetId || "manual"}`;

    // Skip lock for certain operations (e.g., emergency sells)
    if (skipLock) {
      logger.warn("Skipping transaction lock", { resourceId, skipLock: true });
    } else {
      // Check if resource is already locked
      const lockStatus = await transactionLockService.getLockStatus(resourceId);
      if (lockStatus.isLocked) {
        logger.info("Resource locked, trade queued", {
          resourceId,
          queueLength: lockStatus.queueLength,
        });
        return apiResponse(
          createErrorResponse("Trade already in progress", {
            message: `Another trade for ${symbol} ${side} is being processed. Queue position: ${lockStatus.queueLength + 1}`,
            lockStatus,
          }),
          HTTP_STATUS.CONFLICT,
        );
      }
    }

    // Initialize service layer
    const mexcService = getRecommendedMexcService({
      apiKey,
      secretKey,
    });

    // Prepare order parameters
    const orderParams: OrderParameters = {
      symbol,
      side: side.toUpperCase() as "BUY" | "SELL",
      type: type.toUpperCase() as "LIMIT" | "MARKET",
      quantity: quantity.toString(),
      ...(price && { price: price.toString() }),
      timeInForce: "IOC", // Immediate or Cancel for safety
    };

    // Enhanced Risk Assessment (if not skipped)
    if (!skipLock) {
      logger.info("Risk assessment started", { userId, symbol, side });

      // Risk assessment disabled in minimization
      logger.warn("Risk assessment disabled in minimized version");
      (orderParams as any).riskMetadata = {
        riskLevel: "unknown",
        riskScore: 0,
        assessmentTime: new Date().toISOString(),
        portfolioImpact: 0,
      };
    } else {
      logger.warn("Risk assessment skipped", { symbol, skipLock: true });

      // Add minimal risk metadata for emergency trades
      (orderParams as any).riskMetadata = {
        riskLevel: "unknown",
        riskScore: 0,
        assessmentTime: new Date().toISOString(),
        portfolioImpact: 0,
        emergencyTrade: true,
      };
    }

    // Execute with lock protection
    const executeTrade = async () => {
      // Check if paper trading is enabled
      const paperTradingEnabled = process.env.MEXC_PAPER_TRADING === "true";

      logger.info("Paper trading mode", { enabled: paperTradingEnabled });

      // Use executeTrade instead of placeOrder to support paper trading
      const orderResponse = await mexcService.executeTrade({
        symbol: orderParams.symbol,
        side: orderParams.side,
        type: orderParams.type as "MARKET" | "LIMIT" | "STOP_LIMIT",
        quantity: parseFloat(orderParams.quantity),
        price: orderParams.price ? parseFloat(orderParams.price) : undefined,
        timeInForce: orderParams.timeInForce,
        paperTrade: paperTradingEnabled, // This enables paper trading simulation
      });

      if (!orderResponse.success) {
        throw new Error(orderResponse.error || "Order placement failed");
      }

      // executeTrade returns the correct format directly
      const orderResult = orderResponse.data;

      if (!orderResult) {
        throw new Error("Order result is missing from response");
      }

      return {
        ...orderResult,
        success: true, // Explicitly mark as successful since orderResponse.success was true
        serviceMetrics: {
          executionTimeMs: orderResponse.executionTime,
          paperTrade: paperTradingEnabled,
          credentialSource,
        },
      };
    };

    // Execute with or without lock
    let result;
    if (skipLock) {
      result = await executeTrade();
    } else {
      const lockResult = await transactionLockService.executeWithLock(
        {
          resourceId,
          ownerId: userId,
          ownerType: "user",
          transactionType: "trade",
          transactionData: {
            symbol,
            side,
            type,
            quantity,
            price,
            snipeTargetId,
          },
          timeoutMs: 30000, // 30 second timeout
          priority: side.toUpperCase() === "SELL" ? 1 : 5, // Prioritize sells
        },
        executeTrade,
      );

      if (!lockResult.success) {
        return apiResponse(
          createErrorResponse(lockResult.error || "Trade execution failed", {
            message: "Trade execution failed",
            lockId: lockResult.lockId,
            executionTimeMs: lockResult.executionTimeMs,
          }),
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      result = lockResult.result;
    }

    const orderResult = result as {
      success: boolean;
      error?: string;
      [key: string]: unknown;
    };

    if (orderResult.success) {
      logger.info("Trading order executed successfully", { orderResult });

      // Save execution history
      try {
        const orderData = orderResult as any; // Type assertion for MEXC order response
        const executionRecord: NewExecutionHistory = {
          userId,
          snipeTargetId: snipeTargetId || null,
          vcoinId: body.vcoinId || symbol,
          symbolName: symbol,
          action: side.toLowerCase() as "buy" | "sell",
          orderType: type.toLowerCase(),
          orderSide: side.toLowerCase(),
          requestedQuantity: parseFloat(quantity),
          requestedPrice: price ? parseFloat(price) : null,
          executedQuantity: orderData.executedQty
            ? parseFloat(orderData.executedQty)
            : parseFloat(quantity),
          executedPrice: orderData.price ? parseFloat(orderData.price) : null,
          totalCost: orderData.cummulativeQuoteQty
            ? parseFloat(orderData.cummulativeQuoteQty)
            : null,
          fees: orderData.fee ? parseFloat(orderData.fee) : null,
          exchangeOrderId: orderData.orderId?.toString() || null,
          exchangeStatus: orderData.status || "filled",
          exchangeResponse: JSON.stringify(orderResult),
          executionLatencyMs: orderData.transactTime
            ? Date.now() - Number(orderData.transactTime)
            : null,
          slippagePercent:
            price && orderData.price
              ? ((parseFloat(orderData.price) - parseFloat(price)) / parseFloat(price)) * 100
              : null,
          status: "success",
          requestedAt: new Date(),
          executedAt: orderData.transactTime
            ? new Date(Number(orderData.transactTime))
            : new Date(),
        };

        await db.insert(executionHistory).values(executionRecord);
        logger.info("Execution history saved", { orderId: orderResult.orderId });
      } catch (error) {
        logger.error(
          "Failed to save execution history",
          {},
          error instanceof Error ? error : new Error(String(error)),
        );
        // Don't fail the trade response if history save fails
      }

      return apiResponse(
        createSuccessResponse(orderResult, {
          message: "Order placed successfully",
        }),
        HTTP_STATUS.CREATED,
      );
    } else {
      logger.error("Trading order failed", { orderResult });

      return apiResponse(
        createErrorResponse(orderResult.error || "Order placement failed", {
          message: "Order placement failed",
          details: orderResult,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
  } catch (error) {
    logger.error(
      "Trading API error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );

    // Check for authentication errors
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return apiResponse(
        createErrorResponse("Authentication required", {
          message: "Please sign in to execute trades",
          code: "AUTHENTICATION_REQUIRED",
        }),
        HTTP_STATUS.UNAUTHORIZED,
      );
    }

    return apiResponse(
      createErrorResponse(error instanceof Error ? error.message : "Unknown error occurred"),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
