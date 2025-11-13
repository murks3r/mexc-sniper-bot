/**
 * Symbol Qualification Service
 *
 * Implements Slice 1.2 from the optimization plan: Assessment Zone Blocking.
 *
 * This is THE MOST CRITICAL FIX. It prevents the bot from attempting to trade
 * tokens in the Assessment Zone, which causes error 10007 ("bad symbol").
 *
 * The service:
 * 1. Calls GET /api/v3/exchangeInfo for each new symbol
 * 2. Checks if isSpotTradingAllowed === true
 * 3. Extracts and caches all trading rules (precision, notional, etc.)
 * 4. Marks symbols as is_api_tradable: true/false in the database
 *
 * Only symbols marked as is_api_tradable: true should proceed to execution.
 */

import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { mexcSymbols, type NewMexcSymbol } from "@/src/db/schema";
import { createSimpleLogger } from "@/src/lib/unified-logger";
import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";

const logger = createSimpleLogger("SymbolQualification");

export interface QualificationResult {
  symbol: string;
  isApiTradable: boolean;
  reason?: string; // Why the symbol is not tradable
  tradingRules?: NewMexcSymbol; // Full trading rules if tradable
}

/**
 * Qualify a single symbol by checking MEXC exchangeInfo
 *
 * This implements the "Grote Filter" (Big Filter) from Slice 1.2.
 */
export async function qualifySymbol(symbol: string): Promise<QualificationResult> {
  const startTime = Date.now();

  try {
    logger.info(`🔍 Qualifying symbol: ${symbol}`);

    // Step 1: Call GET /api/v3/exchangeInfo for this specific symbol
    const mexcService = getRecommendedMexcService();

    // The unified service has an exchangeInfo method
    // We need to get the symbol-specific rules
    const exchangeInfoResponse = await mexcService.getAllSymbols();

    if (!exchangeInfoResponse.success || !exchangeInfoResponse.data) {
      logger.error(`Failed to fetch exchangeInfo for ${symbol}`, {
        error: exchangeInfoResponse.error,
      });
      return {
        symbol,
        isApiTradable: false,
        reason: "Failed to fetch exchangeInfo from MEXC API",
      };
    }

    // Step 2: Find this symbol in the response
    const symbolInfo = exchangeInfoResponse.data.symbols?.find(
      (s: any) => s.symbol === symbol.toUpperCase(),
    );

    if (!symbolInfo) {
      logger.warn(`Symbol ${symbol} not found in exchangeInfo`, {
        totalSymbols: exchangeInfoResponse.data.symbols?.length || 0,
      });
      return {
        symbol,
        isApiTradable: false,
        reason: "Symbol not found in MEXC exchangeInfo (may not exist yet)",
      };
    }

    // Step 3: Check the critical flags (Scenario A, B, C from the document)
    const isSpotTradingAllowed = symbolInfo.isSpotTradingAllowed ?? false;
    const status = symbolInfo.status;

    // Scenario C: Success
    if (isSpotTradingAllowed && (status === "TRADING" || status === "1")) {
      logger.info(`✅ Symbol ${symbol} is API-tradable`, {
        status,
        isSpotTradingAllowed,
        executionTimeMs: Date.now() - startTime,
      });

      // Step 4: Extract trading rules for cache (Slice 1.3)
      const tradingRules = extractTradingRules(symbolInfo);

      return {
        symbol,
        isApiTradable: true,
        tradingRules,
      };
    }

    // Scenario A or B: Failure
    const reason = !isSpotTradingAllowed
      ? "isSpotTradingAllowed=false (Assessment Zone or restricted)"
      : `Invalid status: ${status}`;

    logger.warn(`❌ Symbol ${symbol} is NOT API-tradable: ${reason}`, {
      status,
      isSpotTradingAllowed,
      executionTimeMs: Date.now() - startTime,
    });

    return {
      symbol,
      isApiTradable: false,
      reason,
    };
  } catch (error) {
    logger.error(`Failed to qualify symbol ${symbol}`, {
      error: error instanceof Error ? error.message : String(error),
      executionTimeMs: Date.now() - startTime,
    });

    return {
      symbol,
      isApiTradable: false,
      reason: `Exception during qualification: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Extract trading rules from exchangeInfo response
 *
 * Maps MEXC fields to our database schema per Table 1 in the optimization plan.
 */
function extractTradingRules(symbolInfo: any): NewMexcSymbol {
  // Map MEXC exchangeInfo fields to our schema
  return {
    symbol: symbolInfo.symbol,
    status: symbolInfo.status || "UNKNOWN",

    // Trading permissions
    isApiTradable: symbolInfo.isSpotTradingAllowed ?? false,
    isSpotTradingAllowed: symbolInfo.isSpotTradingAllowed ?? false,
    isMarginTradingAllowed: symbolInfo.isMarginTradingAllowed ?? false,

    // Asset info
    baseAsset: symbolInfo.baseAsset || "",
    quoteAsset: symbolInfo.quoteAsset || "",

    // Precision fields (critical for Slice 2.1)
    baseAssetPrecision: symbolInfo.baseAssetPrecision || 8,
    quotePrecision: symbolInfo.quotePrecision || 8,
    quoteAssetPrecision: symbolInfo.quoteAssetPrecision || 8,

    // Minimum order sizes
    baseSizePrecision: symbolInfo.baseSizePrecision?.toString() || "0.00000001",
    quoteAmountPrecision: symbolInfo.quoteAmountPrecision?.toString() || "5.0",
    quoteAmountPrecisionMarket: symbolInfo.quoteAmountPrecisionMarket?.toString() || "5.0",

    // Order types
    orderTypes: JSON.stringify(symbolInfo.orderTypes || ["LIMIT", "MARKET"]),

    // Cache metadata
    exchangeInfoFetchedAt: new Date(),
  };
}

/**
 * Cache trading rules in the database
 *
 * This creates the "single source of truth" for the execution engine.
 * The execution engine should ONLY read from this table, never call
 * exchangeInfo directly during a snipe.
 */
export async function cacheTradingRules(rules: NewMexcSymbol): Promise<void> {
  try {
    // Upsert the rules
    await db
      .insert(mexcSymbols)
      .values(rules)
      .onConflictDoUpdate({
        target: mexcSymbols.symbol,
        set: {
          ...rules,
          updatedAt: new Date(),
        },
      });

    logger.info(`💾 Cached trading rules for ${rules.symbol}`, {
      isApiTradable: rules.isApiTradable,
    });
  } catch (error) {
    logger.error(`Failed to cache trading rules for ${rules.symbol}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get cached trading rules from database
 *
 * This is used by the execution engine (Slice 2.1 and 3.1).
 */
export async function getCachedTradingRules(symbol: string) {
  try {
    const cached = await db.select().from(mexcSymbols).where(eq(mexcSymbols.symbol, symbol)).limit(1);

    if (cached.length === 0) {
      logger.warn(`No cached rules found for ${symbol}`);
      return null;
    }

    return cached[0];
  } catch (error) {
    logger.error(`Failed to get cached rules for ${symbol}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Qualify and cache a symbol in one operation
 *
 * This is the main entry point for the Inngest function.
 */
export async function qualifyAndCacheSymbol(symbol: string): Promise<QualificationResult> {
  const result = await qualifySymbol(symbol);

  if (result.isApiTradable && result.tradingRules) {
    await cacheTradingRules(result.tradingRules);
  } else {
    // Cache the negative result too (to avoid repeated API calls)
    await cacheTradingRules({
      symbol: result.symbol,
      status: "UNKNOWN",
      isApiTradable: false,
      isSpotTradingAllowed: false,
      isMarginTradingAllowed: false,
      baseAsset: "",
      quoteAsset: "",
      baseAssetPrecision: 0,
      quotePrecision: 0,
      quoteAssetPrecision: 0,
      baseSizePrecision: "0",
      quoteAmountPrecision: "0",
      quoteAmountPrecisionMarket: "0",
      orderTypes: "[]",
      exchangeInfoFetchedAt: new Date(),
    });
  }

  return result;
}

/**
 * Check if a symbol is API-tradable from cache
 *
 * Returns true only if:
 * 1. Symbol exists in cache
 * 2. is_api_tradable === true
 * 3. Cache is not stale (< 24 hours old)
 */
export async function isSymbolApiTradable(symbol: string): Promise<boolean> {
  const cached = await getCachedTradingRules(symbol);

  if (!cached) {
    return false;
  }

  // Check if cache is stale (> 24 hours)
  const cacheAge = Date.now() - new Date(cached.lastQualifiedAt).getTime();
  const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours

  if (cacheAge > maxCacheAge) {
    logger.warn(`Cached rules for ${symbol} are stale (${Math.round(cacheAge / 3600000)}h old)`);
    return false;
  }

  return cached.isApiTradable;
}
