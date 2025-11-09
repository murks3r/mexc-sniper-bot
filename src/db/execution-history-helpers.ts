import { db } from "@/src/db";
import type { NewExecutionHistory } from "@/src/db/schemas/trading";
import { executionHistory } from "@/src/db/schemas/trading";

type Primitive = string | number | boolean | null | undefined;

export interface SaveExecutionHistoryParams {
  userId: string;
  snipeTargetId?: number | null;
  positionId?: number | null;
  vcoinId: string;
  symbolName: string;
  orderType: string; // "market" | "limit"
  orderSide: string; // "buy" | "sell"

  // Quantities/prices
  requestedQuantity: number; // base-asset qty; if unknown, use executedQuantity or 0
  requestedPrice?: number | null;
  executedQuantity?: number | null;
  executedPrice?: number | null;
  totalCost?: number | null;
  fees?: number | null;

  // Exchange data
  exchangeOrderId?: string | null;
  exchangeStatus?: string | null;
  exchangeResponse?: unknown; // will be JSON.stringified if object

  // Metrics
  executionLatencyMs?: number | null;
  slippagePercent?: number | null;

  // Status & errors
  status: "success" | "partial" | "failed" | "cancelled";
  errorCode?: string | null;
  errorMessage?: string | null;

  // Timestamps
  requestedAt?: Date;
  executedAt?: Date | null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : null;
}

function _coerceDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : undefined;
  }
  return undefined;
}

export async function saveExecutionHistory(params: SaveExecutionHistoryParams): Promise<number> {
  const {
    userId,
    snipeTargetId = null,
    positionId = null,
    vcoinId,
    symbolName,
    orderType,
    orderSide,
    requestedQuantity,
    requestedPrice = null,
    executedQuantity = null,
    executedPrice = null,
    totalCost = null,
    fees = null,
    exchangeOrderId = null,
    exchangeStatus = null,
    exchangeResponse,
    executionLatencyMs = null,
    slippagePercent = null,
    status,
    errorCode = null,
    errorMessage = null,
    requestedAt,
    executedAt,
  } = params;

  const normalized: NewExecutionHistory = {
    userId,
    snipeTargetId,
    positionId,
    vcoinId: String(vcoinId),
    symbolName: String(symbolName),
    action: orderSide === "buy" || orderSide === "sell" ? orderSide : "buy",
    orderType: String(orderType).toLowerCase(),
    orderSide: String(orderSide).toLowerCase(),
    requestedQuantity: toNumber(requestedQuantity) ?? 0,
    requestedPrice: toNumber(requestedPrice),
    executedQuantity: toNumber(executedQuantity),
    executedPrice: toNumber(executedPrice),
    totalCost: toNumber(totalCost),
    fees: toNumber(fees),
    exchangeOrderId: exchangeOrderId ?? null,
    exchangeStatus: exchangeStatus ?? null,
    exchangeResponse:
      exchangeResponse == null
        ? null
        : typeof exchangeResponse === "string"
          ? exchangeResponse
          : JSON.stringify(exchangeResponse as Record<string, Primitive>),
    executionLatencyMs: toNumber(executionLatencyMs) ?? null,
    slippagePercent: toNumber(slippagePercent),
    status,
    errorCode: errorCode ?? null,
    errorMessage: errorMessage ?? null,
    requestedAt: requestedAt ?? new Date(),
    executedAt: executedAt ?? null,
    // createdAt is defaulted by DB
  } as NewExecutionHistory;

  const [inserted] = await db
    .insert(executionHistory)
    .values(normalized)
    .returning({ id: executionHistory.id });
  return inserted.id;
}
