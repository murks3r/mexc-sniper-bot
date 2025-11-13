import { sql } from "drizzle-orm";
import { boolean, decimal, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// ===========================================
// MEXC SYMBOLS SCHEMA MODULE
// ===========================================

/**
 * MEXC Symbols Table - Trading Rules Cache
 *
 * This table stores the trading rules from MEXC's exchangeInfo API
 * to enable fast, local validation of orders without API calls.
 *
 * Implements Slice 1.3: Database Verrijking from the optimization plan.
 *
 * Key purpose: Prevent Assessment Zone trading (error 10007) and
 * precision errors (error 30002) by caching and validating rules locally.
 */
export const mexcSymbols = pgTable(
  "mexc_symbols",
  {
    symbol: text("symbol").primaryKey(), // e.g., "NEWTOKENUSDT"
    status: text("status").notNull(), // "TRADING", "HALT", "BREAK"

    // Trading Permissions (Slice 1.2: Assessment Zone Blocking)
    isApiTradable: boolean("is_api_tradable").notNull().default(false), // Core field - filters Assessment Zone tokens
    isSpotTradingAllowed: boolean("is_spot_trading_allowed").default(false),
    isMarginTradingAllowed: boolean("is_margin_trading_allowed").default(false),

    // Zone Classification
    listingZone: text("listing_zone"), // "ASSESSMENT", "INNOVATION", "MAIN" - for future enhancement

    // Asset Information
    baseAsset: text("base_asset").notNull(), // e.g., "NEWTOKEN"
    quoteAsset: text("quote_asset").notNull(), // e.g., "USDT"

    // Precision Fields (Slice 2.1: Prevents error 30002)
    // Maps to exchangeInfo response fields per Table 1 in optimization plan
    baseAssetPrecision: integer("base_asset_precision").notNull(), // Decimals for quantity (e.g., 8)
    quotePrecision: integer("quote_precision").notNull(), // Decimals for price (e.g., 4)
    quoteAssetPrecision: integer("quote_asset_precision").notNull(), // Alternate quote precision

    // Minimum Order Size (Slice 2.1: LOT_SIZE equivalent)
    baseSizePrecision: decimal("base_size_precision").notNull(), // Min quantity in base asset (e.g., 0.01)

    // Minimum Notional Value (Slice 2.1: MIN_NOTIONAL equivalent)
    quoteAmountPrecision: decimal("quote_amount_precision").notNull(), // Min order value for LIMIT (e.g., 5.0 USDT)
    quoteAmountPrecisionMarket: decimal("quote_amount_precision_market").notNull(), // Min order value for MARKET

    // Order Types Supported
    orderTypes: text("order_types"), // JSON array: ["LIMIT", "MARKET", "STOP_LOSS_LIMIT"]

    // Additional Trading Rules (for future enhancement)
    maxOrderQty: decimal("max_order_qty"), // Maximum order quantity
    maxOrderValue: decimal("max_order_value"), // Maximum order value

    // Cache Metadata
    lastQualifiedAt: timestamp("last_qualified_at").notNull().default(sql`CURRENT_TIMESTAMP`), // When this symbol was last validated
    exchangeInfoFetchedAt: timestamp("exchange_info_fetched_at").notNull(), // Source data timestamp

    // Timestamps
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    // Performance indexes for qualification queries
    isApiTradableIdx: index("mexc_symbols_is_api_tradable_idx").on(table.isApiTradable),
    statusIdx: index("mexc_symbols_status_idx").on(table.status),
    baseAssetIdx: index("mexc_symbols_base_asset_idx").on(table.baseAsset),
    quoteAssetIdx: index("mexc_symbols_quote_asset_idx").on(table.quoteAsset),
    lastQualifiedIdx: index("mexc_symbols_last_qualified_idx").on(table.lastQualifiedAt),

    // Compound index for trading readiness check (most common query)
    tradingReadinessIdx: index("mexc_symbols_trading_readiness_idx").on(
      table.isApiTradable,
      table.status,
      table.isSpotTradingAllowed,
    ),
  }),
);

// TypeScript types
export type MexcSymbol = typeof mexcSymbols.$inferSelect;
export type NewMexcSymbol = typeof mexcSymbols.$inferInsert;
