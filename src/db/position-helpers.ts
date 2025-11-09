import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import type { NewPosition } from "@/src/db/schemas/trading";
import { positions } from "@/src/db/schemas/trading";

export interface CreatePositionParams {
  userId: string;
  snipeTargetId: number;
  symbolName: string;
  vcoinId?: string;
  entryPrice: number;
  quantity: number;
  buyExecutionId: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxHoldHours: number;
}

/**
 * Create a new position after a successful buy
 */
export async function createPosition(params: CreatePositionParams): Promise<number> {
  const {
    userId,
    snipeTargetId,
    symbolName,
    vcoinId,
    entryPrice,
    quantity,
    buyExecutionId,
    stopLossPercent,
    takeProfitPercent,
    maxHoldHours,
  } = params;

  const entryTime = new Date();
  const stopLossPrice = entryPrice * (1 - stopLossPercent / 100);
  const takeProfitPrice = entryPrice * (1 + takeProfitPercent / 100);
  const maxHoldUntil = new Date(entryTime.getTime() + maxHoldHours * 60 * 60 * 1000);

  const newPosition: NewPosition = {
    userId,
    snipeTargetId,
    symbolName,
    vcoinId: vcoinId || null,
    entryPrice,
    quantity,
    entryTime,
    buyExecutionId,
    stopLossPrice,
    takeProfitPrice,
    maxHoldUntil,
    status: "open",
  };

  const [inserted] = await db.insert(positions).values(newPosition).returning({ id: positions.id });
  return inserted.id;
}

export interface UpdatePositionOnSellParams {
  positionId: number;
  exitPrice: number;
  sellExecutionId: number;
  realizedPnl: number;
  realizedPnlPercent: number;
}

/**
 * Update position when sold (closed)
 */
export async function updatePositionOnSell(params: UpdatePositionOnSellParams): Promise<void> {
  const { positionId, exitPrice, sellExecutionId, realizedPnl, realizedPnlPercent } = params;

  await db
    .update(positions)
    .set({
      status: "closed",
      exitPrice,
      exitTime: new Date(),
      sellExecutionId,
      realizedPnl,
      realizedPnlPercent,
      updatedAt: new Date(),
    })
    .where(eq(positions.id, positionId));
}
