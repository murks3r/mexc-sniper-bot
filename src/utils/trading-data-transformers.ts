/**
 * Simple Trading Data Transformers
 */

export function normalizeVcoinId(vcoinId: string | number): string {
  return vcoinId.toString();
}

interface TradingTargetInput {
  vcoinId?: string | number;
  id?: string | number;
  symbolName?: string;
  symbol?: string;
  listingDate?: string;
  listing_date?: string;
  isReady?: boolean;
  is_ready?: boolean;
  [key: string]: unknown;
}

/**
 * Validate trading target data
 */
export function validateTradingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const obj = target as Record<string, unknown>;
  // Basic validation - check for required fields
  const requiredFields = ["vcoinId", "symbolName"];
  return requiredFields.every((field) => obj[field] != null);
}

/**
 * Transform trading target data
 */
export function transformTradingTarget(target: TradingTargetInput): {
  vcoinId: string;
  symbolName: string;
  listingDate?: string;
  isReady?: boolean;
} {
  return {
    vcoinId: normalizeVcoinId(target.vcoinId || target.id || ""),
    symbolName: target.symbolName || target.symbol || "",
    listingDate: target.listingDate || target.listing_date,
    isReady: Boolean(target.isReady || target.is_ready),
  };
}

/**
 * Safely get property from object with fallback
 */
export function safeGetProperty<T>(obj: unknown, key: string, fallback: T): T {
  if (!obj || typeof obj !== "object") {
    return fallback;
  }

  const record = obj as Record<string, unknown>;
  return record[key] !== undefined ? (record[key] as T) : fallback;
}
