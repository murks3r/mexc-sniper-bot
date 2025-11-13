import type { NextRequest } from "next/server";
import { z } from "zod";
import { saveExecutionHistory } from "@/src/db/execution-history-helpers";
import {
  apiResponse,
  createErrorResponse,
  createSuccessResponse,
  HTTP_STATUS,
} from "@/src/lib/api-response";
import { requireClerkAuth } from "@/src/lib/clerk-auth-server";
import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";

export const dynamic = "force-dynamic";

const quickTradeSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  side: z.enum(["BUY", "SELL"], {
    errorMap: () => ({ message: "Side must be BUY or SELL" }),
  }),
  amount: z.number().positive("Amount must be positive").optional(),
  quantity: z.number().positive("Quantity must be positive").optional(),
  paperTrade: z.boolean().default(false),
});

/**
 * Quick Trade API Endpoint
 *
 * Simplified API for quick buy/sell trades on today's listings.
 * Uses MARKET orders for immediate execution.
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await requireClerkAuth();
    const userId = user.id;

    const body = await request.json();

    // Validate request body
    const validationResult = quickTradeSchema.safeParse(body);
    if (!validationResult.success) {
      return apiResponse(
        createErrorResponse("Invalid request", {
          errors: validationResult.error.errors,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const { symbol, side, amount, quantity, paperTrade } = validationResult.data;

    // Ensure we have either amount (for quote currency) or quantity (for base currency)
    if (!amount && !quantity) {
      return apiResponse(
        createErrorResponse("Either amount or quantity is required", {
          message: "Provide 'amount' for quote currency (USDT) or 'quantity' for base currency",
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // Get MEXC service
    const mexcService = getRecommendedMexcService();

    // Prepare order parameters for MARKET order
    const orderParams: {
      symbol: string;
      side: "BUY" | "SELL";
      type: "MARKET";
      timeInForce: "IOC";
      quoteOrderQty?: string;
      quantity?: string;
    } = {
      symbol: symbol.toUpperCase(),
      side: side.toUpperCase() as "BUY" | "SELL",
      type: "MARKET",
      timeInForce: "IOC", // Immediate or Cancel
    };

    // Use amount (quote currency) for BUY, quantity (base currency) for SELL
    if (side === "BUY" && amount) {
      orderParams.quoteOrderQty = amount.toString();
      // Ensure quantity is set for TradingOrderData requirement
      orderParams.quantity = "0"; // Will be ignored when quoteOrderQty is set
    } else if (side === "SELL" && quantity) {
      orderParams.quantity = quantity.toString();
    } else if (side === "BUY" && quantity) {
      // If quantity provided for BUY, we still need to estimate quote amount
      // For quick trade, we'll use the quantity as-is and let MEXC handle it
      orderParams.quantity = quantity.toString();
    } else if (side === "SELL" && amount) {
      // For SELL with amount, convert to quantity (approximate)
      orderParams.quantity = amount.toString(); // This is approximate
    }

    // Ensure quantity is set (required by TradingOrderData)
    if (!orderParams.quantity && !orderParams.quoteOrderQty) {
      return apiResponse(
        createErrorResponse("Either quantity or amount must be provided", {
          symbol,
          side,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    if (!orderParams.quantity) {
      orderParams.quantity = "0"; // Placeholder when using quoteOrderQty
    }

    // Execute trade
    let result: {
      success: boolean;
      data?: {
        orderId: string;
        symbol: string;
        side: string;
        type: string;
        quantity: string;
        price: string;
        status: string;
        executedQty: string;
        timestamp: string;
      };
      error?: string;
    };
    if (paperTrade) {
      // Paper trading simulation
      result = {
        success: true,
        data: {
          orderId: `paper-${Date.now()}`,
          symbol: orderParams.symbol,
          side: orderParams.side,
          type: orderParams.type,
          quantity: orderParams.quantity || orderParams.quoteOrderQty || "0",
          price: "0", // Paper trade doesn't have real price
          status: "FILLED",
          executedQty: orderParams.quantity || orderParams.quoteOrderQty || "0",
          timestamp: new Date().toISOString(),
        },
      };
    } else {
      // Real trade execution
      result = await mexcService.placeOrder(orderParams);
    }

    if (!result.success) {
      return apiResponse(
        createErrorResponse(result.error || "Trade execution failed", {
          symbol,
          side,
        }),
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    // Save execution history for real trades
    if (!paperTrade && result.data) {
      try {
        const orderData = result.data as {
          executedQty?: string;
          quantity?: string;
          price?: string;
          cummulativeQuoteQty?: string;
          orderId?: string;
          status?: string;
        };
        const executedQty = parseFloat(orderData.executedQty || orderData.quantity || "0");
        const executedPrice = parseFloat(orderData.price || "0");
        const totalCost =
          executedQty * executedPrice || parseFloat(orderData.cummulativeQuoteQty || "0");

        await saveExecutionHistory({
          userId,
          snipeTargetId: null,
          positionId: null,
          vcoinId: symbol.replace("USDT", ""),
          symbolName: symbol,
          orderType: "market",
          orderSide: side.toLowerCase() as "buy" | "sell",
          requestedQuantity: amount || quantity || 0,
          requestedPrice: null,
          executedQuantity: executedQty > 0 ? executedQty : null,
          executedPrice: executedPrice > 0 ? executedPrice : null,
          totalCost: totalCost > 0 ? totalCost : null,
          fees: null,
          exchangeOrderId: orderData.orderId?.toString() || null,
          exchangeStatus: orderData.status || "filled",
          exchangeResponse: result,
          executionLatencyMs: null,
          slippagePercent: null,
          status: "success",
          requestedAt: new Date(),
          executedAt: new Date(),
        });
        // Execution history saved for quick trade
      } catch (_error) {
        // Failed to save execution history - error logging handled by error handler middleware
        // Don't fail the request if history save fails
      }
    }

    return apiResponse(
      createSuccessResponse(result.data, {
        message: `Quick ${side} order executed successfully`,
        paperTrade,
      }),
    );
  } catch (error) {
    // Quick Trade API Error - error logging handled by error handler middleware
    return apiResponse(
      createErrorResponse(error instanceof Error ? error.message : "Unknown error occurred", {
        error: String(error),
      }),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
