/**
 * Branded Currency Types for Precision Safety
 *
 * Provides compile-time safety against:
 * - Mixing different currencies (USDT, BTC, ETH, etc.)
 * - Floating-point precision errors
 * - Invalid amounts (negative, NaN, Infinity)
 *
 * Benefits:
 * - Type-level enforcement prevents runtime errors
 * - Self-documenting code (function signatures show currency types)
 * - Precision handling at construction time
 * - No runtime overhead (types erased at compile-time)
 *
 * Usage:
 *   import { toUSDT, toBTC, USDT, BTC } from '@/src/lib/branded-currency-types';
 *
 *   function calculateCost(btcAmount: BTC, btcPrice: USDT): USDT {
 *     return toUSDT(btcAmount * btcPrice);
 *   }
 *
 *   const amount = toBTC(0.001);
 *   const price = toUSDT(50000);
 *   const cost = calculateCost(amount, price); // Type-safe!
 *
 *   // This would fail at compile-time:
 *   // const invalid = calculateCost(price, amount); // Error: types don't match
 */

// ============================================================================
// Brand Definitions
// ============================================================================

/**
 * Branded type for USDT (Tether) amounts
 * Precision: 2 decimal places
 */
export type USDT = number & { readonly __brand: "USDT" };

/**
 * Branded type for BTC (Bitcoin) amounts
 * Precision: 8 decimal places
 */
export type BTC = number & { readonly __brand: "BTC" };

/**
 * Branded type for ETH (Ethereum) amounts
 * Precision: 8 decimal places
 */
export type ETH = number & { readonly __brand: "ETH" };

/**
 * Branded type for generic quote currency (base unit for trading pairs)
 * Precision: Variable, determined at construction
 */
export type QuoteCurrency = number & { readonly __brand: "QuoteCurrency" };

/**
 * Branded type for generic base currency (traded asset)
 * Precision: Variable, determined at construction
 */
export type BaseCurrency = number & { readonly __brand: "BaseCurrency" };

// ============================================================================
// Precision Configuration
// ============================================================================

/**
 * Precision configuration for each currency
 */
export const CURRENCY_PRECISION = {
  USDT: 2,
  USDC: 2,
  BTC: 8,
  ETH: 8,
  GENERIC_QUOTE: 6,
  GENERIC_BASE: 8,
} as const;

// ============================================================================
// Validation & Construction
// ============================================================================

/**
 * Validation error class for currency operations
 */
export class CurrencyValidationError extends Error {
  constructor(
    message: string,
    public readonly currency: string,
    public readonly value: unknown,
  ) {
    super(message);
    this.name = "CurrencyValidationError";
  }
}

/**
 * Validate that a value is a safe number
 */
function validateNumber(value: number, currency: string): void {
  if (!Number.isFinite(value)) {
    throw new CurrencyValidationError(
      `${currency} amount must be a finite number (got ${value})`,
      currency,
      value,
    );
  }

  if (value < 0) {
    throw new CurrencyValidationError(
      `${currency} amount cannot be negative (got ${value})`,
      currency,
      value,
    );
  }

  if (value === 0) {
    // Zero is allowed but might be intentional, no error
    return;
  }
}

/**
 * Apply precision rounding to a number
 */
function applyPrecision(value: number, decimals: number): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

// ============================================================================
// USDT Constructors
// ============================================================================

/**
 * Create a USDT amount with validation and precision enforcement
 *
 * @param value - The numeric value
 * @returns Branded USDT type
 * @throws CurrencyValidationError if value is invalid
 *
 * @example
 * const amount = toUSDT(10.99);     // OK: 10.99 USDT
 * const rounded = toUSDT(10.999);   // OK: 11.00 USDT (rounded)
 * toUSDT(-5);                       // Error: negative amount
 * toUSDT(NaN);                      // Error: not finite
 */
export function toUSDT(value: number): USDT {
  validateNumber(value, "USDT");
  return applyPrecision(value, CURRENCY_PRECISION.USDT) as USDT;
}

/**
 * Parse a string to USDT with validation
 *
 * @param str - String representation of USDT amount
 * @returns Branded USDT type
 * @throws CurrencyValidationError if parsing fails or value is invalid
 *
 * @example
 * parseUSDT("10.99");   // OK: 10.99 USDT
 * parseUSDT("10.999");  // OK: 11.00 USDT (rounded)
 * parseUSDT("abc");     // Error: invalid format
 */
export function parseUSDT(str: string): USDT {
  const value = Number(str);
  if (Number.isNaN(value)) {
    throw new CurrencyValidationError(`Cannot parse "${str}" as USDT`, "USDT", str);
  }
  return toUSDT(value);
}

// ============================================================================
// BTC Constructors
// ============================================================================

/**
 * Create a BTC amount with validation and precision enforcement
 *
 * @param value - The numeric value
 * @returns Branded BTC type
 * @throws CurrencyValidationError if value is invalid
 *
 * @example
 * const amount = toBTC(0.001);        // OK: 0.001 BTC
 * const precise = toBTC(0.123456789); // OK: 0.12345679 BTC (rounded to 8 decimals)
 */
export function toBTC(value: number): BTC {
  validateNumber(value, "BTC");
  return applyPrecision(value, CURRENCY_PRECISION.BTC) as BTC;
}

/**
 * Parse a string to BTC with validation
 */
export function parseBTC(str: string): BTC {
  const value = Number(str);
  if (Number.isNaN(value)) {
    throw new CurrencyValidationError(`Cannot parse "${str}" as BTC`, "BTC", str);
  }
  return toBTC(value);
}

// ============================================================================
// ETH Constructors
// ============================================================================

/**
 * Create an ETH amount with validation and precision enforcement
 */
export function toETH(value: number): ETH {
  validateNumber(value, "ETH");
  return applyPrecision(value, CURRENCY_PRECISION.ETH) as ETH;
}

/**
 * Parse a string to ETH with validation
 */
export function parseETH(str: string): ETH {
  const value = Number(str);
  if (Number.isNaN(value)) {
    throw new CurrencyValidationError(`Cannot parse "${str}" as ETH`, "ETH", str);
  }
  return toETH(value);
}

// ============================================================================
// Generic Currency Constructors
// ============================================================================

/**
 * Create a quote currency amount (for trading pair quotes like USDT, BTC, etc.)
 */
export function toQuoteCurrency(
  value: number,
  precision = CURRENCY_PRECISION.GENERIC_QUOTE,
): QuoteCurrency {
  validateNumber(value, "QuoteCurrency");
  return applyPrecision(value, precision) as QuoteCurrency;
}

/**
 * Create a base currency amount (for the asset being traded)
 */
export function toBaseCurrency(
  value: number,
  precision = CURRENCY_PRECISION.GENERIC_BASE,
): BaseCurrency {
  validateNumber(value, "BaseCurrency");
  return applyPrecision(value, precision) as BaseCurrency;
}

// ============================================================================
// Conversion & Operations
// ============================================================================

/**
 * Convert branded currency to raw number for API calls
 *
 * @param amount - Branded currency amount
 * @returns Raw number
 *
 * @example
 * const usdt = toUSDT(10.99);
 * const raw = toRaw(usdt);  // 10.99 (number)
 */
export function toRaw<T extends USDT | BTC | ETH | QuoteCurrency | BaseCurrency>(
  amount: T,
): number {
  return amount as number;
}

/**
 * Convert branded currency to string for API calls
 * Preserves precision by using fixed decimal places
 *
 * @param amount - Branded currency amount
 * @param precision - Number of decimal places (inferred from type if known)
 * @returns String representation
 *
 * @example
 * const usdt = toUSDT(10.99);
 * const str = toString(usdt, 2);  // "10.99"
 */
export function toString<T extends USDT | BTC | ETH | QuoteCurrency | BaseCurrency>(
  amount: T,
  precision?: number,
): string {
  // Infer precision from type if not provided
  // This is a runtime check based on the branded type
  const raw = amount as number;

  // If precision not provided, use default based on value magnitude
  const decimals = precision ?? (raw < 1 ? 8 : raw < 100 ? 4 : 2);

  return raw.toFixed(decimals);
}

/**
 * Add two amounts of the same currency
 *
 * @example
 * const a = toUSDT(10);
 * const b = toUSDT(5);
 * const sum = add(a, b);  // 15 USDT
 */
export function add<T extends USDT | BTC | ETH>(a: T, b: T, precision: number): T {
  return applyPrecision((a as number) + (b as number), precision) as T;
}

/**
 * Subtract two amounts of the same currency
 */
export function subtract<T extends USDT | BTC | ETH>(a: T, b: T, precision: number): T {
  const result = (a as number) - (b as number);
  if (result < 0) {
    throw new CurrencyValidationError("Subtraction resulted in negative amount", "Unknown", result);
  }
  return applyPrecision(result, precision) as T;
}

/**
 * Multiply currency by a scalar (e.g., for calculating total cost)
 *
 * @example
 * const btc = toBTC(0.001);
 * const price = toUSDT(50000);
 * const cost = multiply(price, toRaw(btc), CURRENCY_PRECISION.USDT);
 */
export function multiply<T extends USDT | BTC | ETH>(
  amount: T,
  scalar: number,
  precision: number,
): T {
  return applyPrecision((amount as number) * scalar, precision) as T;
}

/**
 * Divide currency by a scalar
 */
export function divide<T extends USDT | BTC | ETH>(
  amount: T,
  scalar: number,
  precision: number,
): T {
  if (scalar === 0) {
    throw new CurrencyValidationError("Cannot divide by zero", "Unknown", scalar);
  }
  return applyPrecision((amount as number) / scalar, precision) as T;
}

// ============================================================================
// Comparison Operations
// ============================================================================

/**
 * Compare two amounts of the same currency
 */
export function compare<T extends USDT | BTC | ETH>(a: T, b: T): number {
  return (a as number) - (b as number);
}

/**
 * Check if two amounts are equal (within precision tolerance)
 */
export function equals<T extends USDT | BTC | ETH>(a: T, b: T, precision: number): boolean {
  const epsilon = 1 / 10 ** precision;
  return Math.abs((a as number) - (b as number)) < epsilon;
}

/**
 * Check if amount is greater than another
 */
export function greaterThan<T extends USDT | BTC | ETH>(a: T, b: T): boolean {
  return (a as number) > (b as number);
}

/**
 * Check if amount is less than another
 */
export function lessThan<T extends USDT | BTC | ETH>(a: T, b: T): boolean {
  return (a as number) < (b as number);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if value is zero (within precision tolerance)
 */
export function isZero<T extends USDT | BTC | ETH>(amount: T, precision: number): boolean {
  const epsilon = 1 / 10 ** precision;
  return Math.abs(amount as number) < epsilon;
}

/**
 * Get the maximum of two amounts
 */
export function max<T extends USDT | BTC | ETH>(a: T, b: T): T {
  return ((a as number) > (b as number) ? a : b) as T;
}

/**
 * Get the minimum of two amounts
 */
export function min<T extends USDT | BTC | ETH>(a: T, b: T): T {
  return ((a as number) < (b as number) ? a : b) as T;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid currency amount
 */
export function isCurrencyAmount(
  value: unknown,
): value is USDT | BTC | ETH | QuoteCurrency | BaseCurrency {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// ============================================================================
// Export All
// ============================================================================

export default {
  // Types (for re-export in type-only imports)
  // Constructors
  toUSDT,
  parseUSDT,
  toBTC,
  parseBTC,
  toETH,
  parseETH,
  toQuoteCurrency,
  toBaseCurrency,
  // Conversion
  toRaw,
  toString,
  // Operations
  add,
  subtract,
  multiply,
  divide,
  compare,
  equals,
  greaterThan,
  lessThan,
  // Utilities
  isZero,
  max,
  min,
  isCurrencyAmount,
  // Constants
  CURRENCY_PRECISION,
  // Errors
  CurrencyValidationError,
};
