/**
 * Generic position monitoring utilities
 */

import type { Position } from "../types";

/**
 * Check if a price level should trigger based on position side
 */
export function shouldTriggerPriceLevel(
  position: Position,
  currentPrice: number,
  triggerPrice: number | null | undefined,
  isStopLoss: boolean,
): boolean {
  if (!triggerPrice || triggerPrice <= 0) {
    return false;
  }

  if (position.side === "BUY") {
    return isStopLoss ? currentPrice <= triggerPrice : currentPrice >= triggerPrice;
  }

  // For SELL positions, logic is reversed
  return isStopLoss ? currentPrice >= triggerPrice : currentPrice <= triggerPrice;
}

/**
 * Calculate realized P&L for a closed position
 */
export function calculateRealizedPnL(position: Position, exitPrice: number): number {
  const entryValue = position.entryPrice * position.quantity;
  const exitValue = exitPrice * position.quantity;

  return position.side === "BUY" ? exitValue - entryValue : entryValue - exitValue;
}



