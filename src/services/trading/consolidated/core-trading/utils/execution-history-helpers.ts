/**
 * Helper functions for saving execution history
 */

import { saveExecutionHistory as dbSaveExecutionHistory } from "@/src/db/execution-history-helpers";
import type { Position, ServiceResponse } from "../types";

/**
 * Save execution history for a closed position
 */
export async function savePositionCloseHistory(
  position: Position,
  closeResult: ServiceResponse<any>,
  userId: string,
  snipeTargetId: number,
  vcoinId: string | number | null,
): Promise<void> {
  const closeExecutedAt = new Date();
  const exitPrice = position.currentPrice || position.entryPrice;

  await dbSaveExecutionHistory({
    userId,
    snipeTargetId,
    vcoinId: vcoinId ? String(vcoinId) : null,
    symbolName: position.symbol,
    orderType: (closeResult.data?.type || "MARKET").toString().toLowerCase(),
    orderSide: "sell",
    requestedQuantity: position.quantity,
    requestedPrice: null,
    executedQuantity: Number(
      closeResult.data?.executedQty ?? closeResult.data?.quantity ?? position.quantity,
    ),
    executedPrice: Number(closeResult.data?.price ?? exitPrice),
    totalCost: Number(closeResult.data?.cummulativeQuoteQty ?? exitPrice * position.quantity),
    fees: closeResult.data?.fees ? Number(closeResult.data.fees) : null,
    exchangeOrderId: closeResult.data?.orderId ? String(closeResult.data.orderId) : null,
    exchangeStatus: (closeResult.data?.status || "FILLED").toString(),
    exchangeResponse: closeResult,
    executionLatencyMs: (closeResult as any).executionTime || null,
    slippagePercent: null,
    status: "success",
    requestedAt: new Date(),
    executedAt: closeExecutedAt,
  });
}
