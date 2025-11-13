/**
 * API Validation Schemas
 *
 * This module provides validation schemas for common API request patterns.
 * These schemas work with the api-middleware system to provide consistent validation.
 */

import type { ValidationFunction, ValidationSchema } from "./api-middleware";
import { defaultRiskConfig } from "./risk-defaults-config";
import { Validators } from "./validators";

// =======================
// User Preferences Schemas
// =======================

export const UserPreferencesQuerySchema: ValidationSchema = {
  userId: "required",
};

export const UserPreferencesUpdateSchema: ValidationSchema = {
  userId: "required",
  defaultBuyAmountUsdt: (value: unknown) =>
    value !== undefined ? Validators.buyAmountUsdt(Number(value)) : undefined,
  maxConcurrentSnipes: (value: unknown) =>
    value !== undefined ? Validators.maxConcurrentSnipes(Number(value)) : undefined,
  takeProfitLevel1: (value: unknown) =>
    value !== undefined
      ? Validators.takeProfitLevel(Number(value), "Take profit level 1")
      : undefined,
  takeProfitLevel2: (value: unknown) =>
    value !== undefined
      ? Validators.takeProfitLevel(Number(value), "Take profit level 2")
      : undefined,
  takeProfitLevel3: (value: unknown) =>
    value !== undefined
      ? Validators.takeProfitLevel(Number(value), "Take profit level 3")
      : undefined,
  takeProfitLevel4: (value: unknown) =>
    value !== undefined
      ? Validators.takeProfitLevel(Number(value), "Take profit level 4")
      : undefined,
  takeProfitCustom: (value: unknown) =>
    value !== undefined
      ? Validators.takeProfitLevel(Number(value), "Custom take profit level")
      : undefined,
  stopLossPercent: (value: unknown) =>
    value !== undefined ? Validators.stopLossPercent(Number(value)) : undefined,
  riskTolerance: (value: unknown) =>
    value !== undefined ? Validators.riskTolerance(String(value)) : undefined,
  readyStatePattern: (value: unknown) =>
    value !== undefined ? Validators.readyStatePattern(value) : undefined,
  targetAdvanceHours: (value: unknown) =>
    value !== undefined ? Validators.targetAdvanceHours(Number(value)) : undefined,
  calendarPollIntervalSeconds: (value: unknown) =>
    value !== undefined ? Validators.pollInterval(Number(value), 60, 3600) : undefined,
  symbolsPollIntervalSeconds: (value: unknown) =>
    value !== undefined ? Validators.pollInterval(Number(value), 10, 300) : undefined,
};

// =======================
// API Credentials Schemas
// =======================

export const ApiCredentialsQuerySchema: ValidationSchema = {
  userId: "required",
  provider: (value: unknown) => (typeof value === "string" ? value : "mexc") || "mexc",
};

export const ApiCredentialsCreateSchema: ValidationSchema = {
  userId: "required",
  provider: (value: unknown) => (typeof value === "string" ? value : "mexc") || "mexc",
  apiKey: (value: unknown, field: string) => {
    if (!value || typeof value !== "string") {
      throw new Error(`${field} is required and must be a string`);
    }
    if (value.length < 10) {
      throw new Error(`${field} must be at least 10 characters`);
    }
    if (value.includes(" ")) {
      throw new Error(`${field} cannot contain spaces`);
    }
    return value;
  },
  secretKey: (value: unknown, field: string) => {
    if (!value || typeof value !== "string") {
      throw new Error(`${field} is required and must be a string`);
    }
    if (value.length < 10) {
      throw new Error(`${field} must be at least 10 characters`);
    }
    if (value.includes(" ")) {
      throw new Error(`${field} cannot contain spaces`);
    }
    return value;
  },
  passphrase: (value: unknown) => (typeof value === "string" ? value : undefined),
};

// =======================
// Snipe Targets Schemas
// =======================

export const SnipeTargetsQuerySchema: ValidationSchema = {
  userId: "required",
  status: (value: unknown) => {
    if (
      value &&
      typeof value === "string" &&
      !["pending", "active", "ready", "executing", "completed", "failed", "cancelled"].includes(
        value,
      )
    ) {
      throw new Error(
        "Status must be one of: pending, active, ready, executing, completed, failed, cancelled",
      );
    }
    return value;
  },
};

export const SnipeTargetCreateSchema: ValidationSchema = {
  userId: "required",
  vcoinId: "required",
  symbolName: "required",
  entryStrategy: (value: unknown) => (typeof value === "string" ? value : "market") || "market",
  entryPrice: "number",
  positionSizeUsdt: (value: unknown) => {
    const num = Number(value);
    if (Number.isNaN(num) || num <= 0) {
      throw new Error("Position size must be a positive number");
    }
    return num;
  },
  takeProfitLevel: (value: unknown) => {
    const level = Number(value) || defaultRiskConfig.defaultTakeProfitLevel;
    if (level < 1 || level > 4) {
      throw new Error("Take profit level must be between 1 and 4");
    }
    return level;
  },
  takeProfitCustom: (value: unknown) =>
    value !== undefined && value !== null
      ? Number(value)
      : defaultRiskConfig.defaultTakeProfitLadder.L2, // Default to level 2 (25%)
  stopLossPercent: (value: unknown) =>
    value !== undefined
      ? Validators.stopLossPercent(Number(value))
      : defaultRiskConfig.defaultStopLossPercent,
  priority: (value: unknown) => {
    const priority = Number(value) || 1;
    if (priority < 1 || priority > 10) {
      throw new Error("Priority must be between 1 and 10");
    }
    return priority;
  },
  confidenceScore: (value: unknown) => {
    const score = Number(value) || 0.0;
    if (score < 0 || score > 1) {
      throw new Error("Confidence score must be between 0 and 1");
    }
    return score;
  },
  riskLevel: (value: unknown) => {
    const level = (typeof value === "string" ? value : "medium") || "medium";
    if (!["low", "medium", "high"].includes(level)) {
      throw new Error("Risk level must be low, medium, or high");
    }
    return level;
  },
};

// =======================
// Trading Schemas
// =======================

export const TradingOrderSchema: ValidationSchema = {
  userId: "required",
  symbol: "required",
  side: (value: unknown) => {
    if (typeof value !== "string" || !["buy", "sell", "BUY", "SELL"].includes(value)) {
      throw new Error("Side must be buy or sell");
    }
    return value.toUpperCase();
  },
  type: (value: unknown) => {
    if (typeof value !== "string" || !["market", "limit", "MARKET", "LIMIT"].includes(value)) {
      throw new Error("Type must be market or limit");
    }
    return value.toUpperCase();
  },
  quantity: (value: unknown) => {
    const qty = Number(value);
    if (Number.isNaN(qty) || qty <= 0) {
      throw new Error("Quantity must be a positive number");
    }
    return qty;
  },
  price: (value: unknown) => {
    if (value === undefined || value === null) return undefined;
    const price = Number(value);
    if (Number.isNaN(price) || price <= 0) {
      throw new Error("Price must be a positive number");
    }
    return price;
  },
  snipeTargetId: "string",
  skipLock: (value: unknown) => Boolean(value),
};

// =======================
// Account and Balance Schemas
// =======================

export const AccountBalanceQuerySchema: ValidationSchema = {
  userId: (value: unknown) => (typeof value === "string" ? value : undefined), // Optional for fallback to env credentials
};

// =======================
// Health Check Schemas
// =======================

export const HealthCheckQuerySchema: ValidationSchema = {
  includeDetails: (value: unknown) => Boolean(value),
};

// =======================
// Pagination Schemas
// =======================

export const PaginationSchema: ValidationSchema = {
  page: (value: unknown) => {
    const page = Number(value) || 1;
    if (page < 1) {
      throw new Error("Page must be at least 1");
    }
    return page;
  },
  limit: (value: unknown) => {
    const limit = Number(value) || 20;
    if (limit < 1 || limit > 100) {
      throw new Error("Limit must be between 1 and 100");
    }
    return limit;
  },
};

// =======================
// Custom Validation Functions
// =======================

/**
 * Validates that take profit levels are in ascending order
 */
export const validateTakeProfitLevelsOrder: ValidationFunction = (
  value: unknown,
  _field: string,
  data: Record<string, unknown>,
) => {
  const levels = [
    data.takeProfitLevel1,
    data.takeProfitLevel2,
    data.takeProfitLevel3,
    data.takeProfitLevel4,
  ]
    .filter((level) => level !== undefined)
    .map((level) => Number(level))
    .filter((level) => !Number.isNaN(level));

  for (let i = 1; i < levels.length; i++) {
    if (levels[i] <= levels[i - 1]) {
      throw new Error("Take profit levels must be in ascending order");
    }
  }

  return value;
};

/**
 * Validates trading parameters are consistent (price required for limit orders)
 */
export const validateTradingParameters: ValidationFunction = (
  value: unknown,
  _field: string,
  data: Record<string, unknown>,
) => {
  if (data.type === "LIMIT" && !data.price) {
    throw new Error("Price is required for limit orders");
  }
  return value;
};

/**
 * Validates user ID matches authenticated user
 */
export const validateUserIdMatch = (authenticatedUserId: string): ValidationFunction => {
  return (value: unknown, _field: string) => {
    if (value !== authenticatedUserId) {
      throw new Error("You can only access your own data");
    }
    return value;
  };
};

/**
 * Validates MEXC symbol format
 */
export const validateMexcSymbol: ValidationFunction = (value: unknown, field: string) => {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  // MEXC symbols are typically in format BTCUSDT, ETHUSDT, etc.
  if (!/^[A-Z0-9]+USDT?$/.test(value)) {
    throw new Error(`${field} must be a valid MEXC trading symbol (e.g., BTCUSDT)`);
  }

  return value.toUpperCase();
};

/**
 * Validates ISO date string
 */
export const validateISODate: ValidationFunction = (value: unknown, field: string) => {
  if (!value) return undefined;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid ISO date string`);
  }

  return date.toISOString();
};

/**
 * Validates that a date is in the future
 */
export const validateFutureDate: ValidationFunction = (value: unknown, field: string) => {
  if (!value) return undefined;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }

  if (date.getTime() <= Date.now()) {
    throw new Error(`${field} must be in the future`);
  }

  return date.toISOString();
};

// =======================
// Composite Schemas
// =======================

/**
 * Schema for user preferences with cross-field validation
 */
export const CompleteUserPreferencesSchema: ValidationFunction = (
  data: Record<string, unknown>,
) => {
  // First apply individual field validation
  const schema = UserPreferencesUpdateSchema;
  for (const [field, rule] of Object.entries(schema)) {
    if (data[field] !== undefined && typeof rule === "function") {
      data[field] = rule(data[field], field, data);
    }
  }

  // Then apply cross-field validation
  validateTakeProfitLevelsOrder(null, "", data);

  return data;
};

/**
 * Schema for trading orders with parameter consistency validation
 */
export const CompleteTradingOrderSchema: ValidationFunction = (data: Record<string, unknown>) => {
  // First apply individual field validation
  const schema = TradingOrderSchema;
  for (const [field, rule] of Object.entries(schema)) {
    if (data[field] !== undefined && typeof rule === "function") {
      data[field] = rule(data[field], field, data);
    }
  }

  // Then apply cross-field validation
  validateTradingParameters(null, "", data);

  return data;
};
