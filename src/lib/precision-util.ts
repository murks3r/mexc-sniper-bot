/**
 * Precision Utility for Order Validation
 *
 * Implements Slice 2.1 from the optimization plan.
 *
 * This class prevents error 30002 ("minimum transaction volume cannot be less than...")
 * by validating and formatting order parameters according to MEXC's trading rules.
 *
 * Key Functions:
 * 1. Truncate (not round) quantity and price to correct decimal places
 * 2. Validate minimum order size (baseSizePrecision)
 * 3. Validate minimum notional value (quoteAmountPrecision)
 * 4. Format parameters as strings for API calls
 */

import type { MexcSymbol } from "@/src/db/schema";
import { createSimpleLogger } from "@/src/lib/unified-logger";

const logger = createSimpleLogger("PrecisionUtil");

export class PrecisionError extends Error {
  constructor(
    message: string,
    public code: "INVALID_QUANTITY" | "INVALID_NOTIONAL" | "INVALID_PRICE",
    public details?: any,
  ) {
    super(message);
    this.name = "PrecisionError";
  }
}

/**
 * Truncate a number to a specific number of decimal places (NEVER round up)
 *
 * Examples:
 * truncate(813.008, 2) => 813.00
 * truncate(0.01234567, 4) => 0.0123
 */
export function truncate(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.floor(value * multiplier) / multiplier;
}

/**
 * Format a number to a fixed number of decimal places as a string
 */
export function toFixed(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

/**
 * Parse decimal string to number safely
 */
export function parseDecimal(value: string | number): number {
  if (typeof value === "number") return value;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  return parsed;
}

/**
 * Validate and format MARKET BUY order parameters
 *
 * For MARKET BUY, MEXC uses quoteOrderQty (the amount in USDT to spend).
 * This is simpler than LIMIT orders - we just need to ensure the amount
 * meets the minimum notional value.
 */
export function validateMarketBuyOrder(
  totalUsdToSpend: number,
  rules: MexcSymbol,
): {
  quoteOrderQty: string;
} {
  const minNotional = parseDecimal(rules.quoteAmountPrecisionMarket);

  // BUGFIX for error 30002
  if (totalUsdToSpend < minNotional) {
    throw new PrecisionError(
      `Order value ${totalUsdToSpend} USDT is below minimum ${minNotional} USDT for MARKET orders`,
      "INVALID_NOTIONAL",
      {
        provided: totalUsdToSpend,
        minimum: minNotional,
        symbol: rules.symbol,
      },
    );
  }

  // For MARKET orders, MEXC handles precision internally
  // We just need to pass the total USDT amount as a string
  return {
    quoteOrderQty: totalUsdToSpend.toString(),
  };
}

/**
 * Validate and format LIMIT BUY order parameters
 *
 * This is more complex as we need to:
 * 1. Format the price to correct decimals
 * 2. Calculate the quantity
 * 3. Format the quantity to correct decimals
 * 4. Validate minimum quantity
 * 5. Validate minimum notional value (quantity * price)
 */
export function validateLimitBuyOrder(
  priceToBid: number,
  usdToSpend: number,
  rules: MexcSymbol,
): {
  price: string;
  quantity: string;
} {
  // STEP 1: Format the price (truncate, never round)
  const formattedPriceNum = truncate(priceToBid, rules.quotePrecision);
  const formattedPrice = toFixed(formattedPriceNum, rules.quotePrecision);

  // STEP 2: Calculate the ideaI quantity
  let quantity = usdToSpend / formattedPriceNum;

  // STEP 3: Format the quantity (truncate)
  let formattedQuantityNum = truncate(quantity, rules.baseAssetPrecision);
  const formattedQuantity = toFixed(formattedQuantityNum, rules.baseAssetPrecision);

  // STEP 4: Validate against minimum quantity
  const minQuantity = parseDecimal(rules.baseSizePrecision);
  if (formattedQuantityNum < minQuantity) {
    throw new PrecisionError(
      `Quantity ${formattedQuantity} is below minimum ${minQuantity} for ${rules.symbol}`,
      "INVALID_QUANTITY",
      {
        provided: formattedQuantity,
        minimum: minQuantity,
        symbol: rules.symbol,
      },
    );
  }

  // STEP 5: Validate against minimum notional value (THE CRITICAL CHECK for error 30002)
  const notionalValue = formattedQuantityNum * formattedPriceNum;
  const minNotional = parseDecimal(rules.quoteAmountPrecision);

  if (notionalValue < minNotional) {
    throw new PrecisionError(
      `Notional value ${notionalValue.toFixed(2)} USDT is below minimum ${minNotional} USDT for ${rules.symbol}`,
      "INVALID_NOTIONAL",
      {
        notionalValue: notionalValue,
        minimum: minNotional,
        quantity: formattedQuantity,
        price: formattedPrice,
        symbol: rules.symbol,
      },
    );
  }

  logger.debug(`Validated LIMIT order`, {
    symbol: rules.symbol,
    price: formattedPrice,
    quantity: formattedQuantity,
    notionalValue: notionalValue.toFixed(2),
    minNotional,
  });

  return {
    price: formattedPrice,
    quantity: formattedQuantity,
  };
}

/**
 * Validate and format LIMIT SELL order parameters
 */
export function validateLimitSellOrder(
  priceToAsk: number,
  quantityToSell: number,
  rules: MexcSymbol,
): {
  price: string;
  quantity: string;
} {
  // STEP 1: Format the price
  const formattedPriceNum = truncate(priceToAsk, rules.quotePrecision);
  const formattedPrice = toFixed(formattedPriceNum, rules.quotePrecision);

  // STEP 2: Format the quantity
  const formattedQuantityNum = truncate(quantityToSell, rules.baseAssetPrecision);
  const formattedQuantity = toFixed(formattedQuantityNum, rules.baseAssetPrecision);

  // STEP 3: Validate minimum quantity
  const minQuantity = parseDecimal(rules.baseSizePrecision);
  if (formattedQuantityNum < minQuantity) {
    throw new PrecisionError(
      `Quantity ${formattedQuantity} is below minimum ${minQuantity} for ${rules.symbol}`,
      "INVALID_QUANTITY",
      {
        provided: formattedQuantity,
        minimum: minQuantity,
        symbol: rules.symbol,
      },
    );
  }

  // STEP 4: Validate notional value
  const notionalValue = formattedQuantityNum * formattedPriceNum;
  const minNotional = parseDecimal(rules.quoteAmountPrecision);

  if (notionalValue < minNotional) {
    throw new PrecisionError(
      `Notional value ${notionalValue.toFixed(2)} USDT is below minimum ${minNotional} USDT for ${rules.symbol}`,
      "INVALID_NOTIONAL",
      {
        notionalValue: notionalValue,
        minimum: minNotional,
        quantity: formattedQuantity,
        price: formattedPrice,
        symbol: rules.symbol,
      },
    );
  }

  logger.debug(`Validated LIMIT SELL order`, {
    symbol: rules.symbol,
    price: formattedPrice,
    quantity: formattedQuantity,
    notionalValue: notionalValue.toFixed(2),
    minNotional,
  });

  return {
    price: formattedPrice,
    quantity: formattedQuantity,
  };
}

/**
 * Validate and format MARKET SELL order parameters
 */
export function validateMarketSellOrder(
  quantityToSell: number,
  rules: MexcSymbol,
): {
  quantity: string;
} {
  // Format the quantity
  const formattedQuantityNum = truncate(quantityToSell, rules.baseAssetPrecision);
  const formattedQuantity = toFixed(formattedQuantityNum, rules.baseAssetPrecision);

  // Validate minimum quantity
  const minQuantity = parseDecimal(rules.baseSizePrecision);
  if (formattedQuantityNum < minQuantity) {
    throw new PrecisionError(
      `Quantity ${formattedQuantity} is below minimum ${minQuantity} for ${rules.symbol}`,
      "INVALID_QUANTITY",
      {
        provided: formattedQuantity,
        minimum: minQuantity,
        symbol: rules.symbol,
      },
    );
  }

  logger.debug(`Validated MARKET SELL order`, {
    symbol: rules.symbol,
    quantity: formattedQuantity,
    minQuantity,
  });

  return {
    quantity: formattedQuantity,
  };
}

/**
 * PrecisionUtil class - Main entry point
 *
 * Usage:
 * ```typescript
 * const util = new PrecisionUtil(tradingRules);
 * const params = util.formatMarketBuy(10.0); // 10 USDT
 * // or
 * const params = util.formatLimitBuy(0.01234, 10.0); // price, usdToSpend
 * ```
 */
export class PrecisionUtil {
  constructor(private rules: MexcSymbol) {}

  /**
   * Format and validate a MARKET BUY order
   */
  formatMarketBuy(totalUsdToSpend: number): { quoteOrderQty: string } {
    return validateMarketBuyOrder(totalUsdToSpend, this.rules);
  }

  /**
   * Format and validate a LIMIT BUY order
   */
  formatLimitBuy(priceToBid: number, usdToSpend: number): { price: string; quantity: string } {
    return validateLimitBuyOrder(priceToBid, usdToSpend, this.rules);
  }

  /**
   * Format and validate a LIMIT SELL order
   */
  formatLimitSell(priceToAsk: number, quantityToSell: number): { price: string; quantity: string } {
    return validateLimitSellOrder(priceToAsk, quantityToSell, this.rules);
  }

  /**
   * Format and validate a MARKET SELL order
   */
  formatMarketSell(quantityToSell: number): { quantity: string } {
    return validateMarketSellOrder(quantityToSell, this.rules);
  }

  /**
   * Get the trading rules
   */
  getRules(): MexcSymbol {
    return this.rules;
  }
}
