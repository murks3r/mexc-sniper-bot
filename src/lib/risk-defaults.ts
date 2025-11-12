/**
 * Risk Defaults Configuration and Resolution (Server-Side Only)
 *
 * Centralized system for resolving stop loss and take profit defaults with proper validation.
 * Ensures no target is created without safe risk parameters.
 *
 * Resolution Priority:
 * 1. Explicit values from input (if valid and within bounds)
 * 2. User preferences from database (if userId provided)
 * 3. Global DefaultRiskConfig defaults
 *
 * NOTE: This module imports database functions and should only be used server-side.
 * For client-side code, import from risk-defaults-config.ts instead.
 */

import { getUserPreferences } from "@/src/db";
import { getLogger } from "@/src/lib/unified-logger";
import { type DefaultRiskConfig, defaultRiskConfig } from "./risk-defaults-config";

const logger = getLogger("risk-defaults");

/**
 * Input parameters for risk resolution
 */
export interface ResolveRiskParamsInput {
  stopLossPercent?: number | null;
  takeProfitLevel?: number | null;
  takeProfitCustom?: number | null;
}

/**
 * Resolved risk parameters with all values guaranteed to be present and valid
 */
export interface ResolvedRiskParams {
  stopLossPercent: number;
  takeProfitLevel: number;
  takeProfitCustom: number | null;
  takeProfitPercent: number; // Resolved from level or custom
}

/**
 * User preferences type for risk resolution
 */
interface UserPreferencesForRisk {
  stopLossPercent?: number | null;
  takeProfitLevel1?: number | null;
  takeProfitLevel2?: number | null;
  takeProfitLevel3?: number | null;
  takeProfitLevel4?: number | null;
  takeProfitCustom?: number | null;
  defaultTakeProfitLevel?: number | null;
}

/**
 * Clamp a value to a range
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Resolve take profit percentage from level or custom value
 */
function resolveTakeProfitPercent(
  level: number,
  custom: number | null | undefined,
  userPrefs?: UserPreferencesForRisk | null,
  defaults: DefaultRiskConfig = defaultRiskConfig,
): number {
  // If custom is provided and valid, use it (clamped to bounds)
  if (custom !== null && custom !== undefined && !Number.isNaN(custom)) {
    return clamp(custom, defaults.minTakeProfitPercent, defaults.maxTakeProfitPercent);
  }

  // Map level to actual percentage
  const levelToUse = level >= 1 && level <= 4 ? level : defaults.defaultTakeProfitLevel;

  // Try user preferences first
  if (userPrefs) {
    switch (levelToUse) {
      case 1:
        if (userPrefs.takeProfitLevel1 !== null && userPrefs.takeProfitLevel1 !== undefined) {
          return clamp(
            userPrefs.takeProfitLevel1,
            defaults.minTakeProfitPercent,
            defaults.maxTakeProfitPercent,
          );
        }
        break;
      case 2:
        if (userPrefs.takeProfitLevel2 !== null && userPrefs.takeProfitLevel2 !== undefined) {
          return clamp(
            userPrefs.takeProfitLevel2,
            defaults.minTakeProfitPercent,
            defaults.maxTakeProfitPercent,
          );
        }
        break;
      case 3:
        if (userPrefs.takeProfitLevel3 !== null && userPrefs.takeProfitLevel3 !== undefined) {
          return clamp(
            userPrefs.takeProfitLevel3,
            defaults.minTakeProfitPercent,
            defaults.maxTakeProfitPercent,
          );
        }
        break;
      case 4:
        if (userPrefs.takeProfitLevel4 !== null && userPrefs.takeProfitLevel4 !== undefined) {
          return clamp(
            userPrefs.takeProfitLevel4,
            defaults.minTakeProfitPercent,
            defaults.maxTakeProfitPercent,
          );
        }
        break;
    }
  }

  // Fall back to global defaults
  switch (levelToUse) {
    case 1:
      return defaults.defaultTakeProfitLadder.L1;
    case 2:
      return defaults.defaultTakeProfitLadder.L2;
    case 3:
      return defaults.defaultTakeProfitLadder.L3;
    case 4:
      return defaults.defaultTakeProfitLadder.L4;
    default:
      return defaults.defaultTakeProfitLadder.L2; // Default to level 2
  }
}

/**
 * Resolve risk parameters with priority: explicit → user preferences → global defaults
 *
 * @param input - Input parameters (may be partial)
 * @param userId - Optional user ID to fetch user preferences
 * @param defaults - Optional custom defaults (uses global defaults if not provided)
 * @returns Resolved risk parameters with all values guaranteed to be present and valid
 */
export async function resolveRiskParams(
  input: ResolveRiskParamsInput,
  userId?: string,
  defaults: DefaultRiskConfig = defaultRiskConfig,
): Promise<ResolvedRiskParams> {
  // Fetch user preferences if userId is provided
  let userPrefs: UserPreferencesForRisk | null = null;
  if (userId) {
    try {
      const prefs = await getUserPreferences(userId);
      if (prefs) {
        userPrefs = {
          stopLossPercent: prefs.stopLossPercent,
          takeProfitLevel1: prefs.takeProfitLevel1,
          takeProfitLevel2: prefs.takeProfitLevel2,
          takeProfitLevel3: prefs.takeProfitLevel3,
          takeProfitLevel4: prefs.takeProfitLevel4,
          takeProfitCustom: prefs.takeProfitCustom,
          defaultTakeProfitLevel: prefs.defaultTakeProfitLevel,
        };
      }
    } catch (error) {
      logger.warn("Failed to fetch user preferences, using defaults", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Resolve stop loss percent
  let stopLossPercent: number;
  if (
    input.stopLossPercent !== null &&
    input.stopLossPercent !== undefined &&
    !Number.isNaN(input.stopLossPercent)
  ) {
    // Use explicit value, clamped to bounds
    stopLossPercent = clamp(
      input.stopLossPercent,
      defaults.minStopLossPercent,
      defaults.maxStopLossPercent,
    );
    logger.debug("Using explicit stopLossPercent", { value: stopLossPercent });
  } else if (userPrefs?.stopLossPercent !== null && userPrefs?.stopLossPercent !== undefined) {
    // Use user preference, clamped to bounds
    stopLossPercent = clamp(
      userPrefs.stopLossPercent,
      defaults.minStopLossPercent,
      defaults.maxStopLossPercent,
    );
    logger.debug("Using user preference stopLossPercent", { value: stopLossPercent, userId });
  } else {
    // Use global default
    stopLossPercent = defaults.defaultStopLossPercent;
    logger.debug("Using global default stopLossPercent", { value: stopLossPercent });
  }

  // Resolve take profit level
  let takeProfitLevel: number;
  if (
    input.takeProfitLevel !== null &&
    input.takeProfitLevel !== undefined &&
    !Number.isNaN(input.takeProfitLevel) &&
    input.takeProfitLevel >= 1 &&
    input.takeProfitLevel <= 4
  ) {
    takeProfitLevel = Math.round(input.takeProfitLevel);
    logger.debug("Using explicit takeProfitLevel", { value: takeProfitLevel });
  } else if (
    userPrefs?.defaultTakeProfitLevel !== null &&
    userPrefs?.defaultTakeProfitLevel !== undefined
  ) {
    const userLevel = Math.round(userPrefs.defaultTakeProfitLevel);
    takeProfitLevel =
      userLevel >= 1 && userLevel <= 4 ? userLevel : defaults.defaultTakeProfitLevel;
    logger.debug("Using user preference defaultTakeProfitLevel", {
      value: takeProfitLevel,
      userId,
    });
  } else {
    takeProfitLevel = defaults.defaultTakeProfitLevel;
    logger.debug("Using global default takeProfitLevel", { value: takeProfitLevel });
  }

  // Resolve take profit custom value
  let takeProfitCustom: number | null = null;
  if (
    input.takeProfitCustom !== null &&
    input.takeProfitCustom !== undefined &&
    !Number.isNaN(input.takeProfitCustom)
  ) {
    // Use explicit custom value, clamped to bounds
    takeProfitCustom = clamp(
      input.takeProfitCustom,
      defaults.minTakeProfitPercent,
      defaults.maxTakeProfitPercent,
    );
    logger.debug("Using explicit takeProfitCustom", { value: takeProfitCustom });
  } else if (
    userPrefs?.takeProfitCustom !== null &&
    userPrefs?.takeProfitCustom !== undefined &&
    !Number.isNaN(userPrefs.takeProfitCustom)
  ) {
    // Use user preference custom value, clamped to bounds
    takeProfitCustom = clamp(
      userPrefs.takeProfitCustom,
      defaults.minTakeProfitPercent,
      defaults.maxTakeProfitPercent,
    );
    logger.debug("Using user preference takeProfitCustom", { value: takeProfitCustom, userId });
  }
  // If no custom value, leave as null (will use level-based resolution)

  // Resolve take profit percentage from level or custom
  const takeProfitPercent = resolveTakeProfitPercent(
    takeProfitLevel,
    takeProfitCustom,
    userPrefs,
    defaults,
  );

  logger.debug("Resolved risk parameters", {
    stopLossPercent,
    takeProfitLevel,
    takeProfitCustom,
    takeProfitPercent,
    userId,
    usedUserPrefs: !!userPrefs,
  });

  return {
    stopLossPercent,
    takeProfitLevel,
    takeProfitCustom,
    takeProfitPercent,
  };
}

/**
 * Synchronous version that doesn't fetch user preferences
 * Useful when user preferences are already available or not needed
 */
export function resolveRiskParamsSync(
  input: ResolveRiskParamsInput,
  userPrefs?: UserPreferencesForRisk | null,
  defaults: DefaultRiskConfig = defaultRiskConfig,
): ResolvedRiskParams {
  // Resolve stop loss percent
  let stopLossPercent: number;
  if (
    input.stopLossPercent !== null &&
    input.stopLossPercent !== undefined &&
    !Number.isNaN(input.stopLossPercent)
  ) {
    stopLossPercent = clamp(
      input.stopLossPercent,
      defaults.minStopLossPercent,
      defaults.maxStopLossPercent,
    );
  } else if (userPrefs?.stopLossPercent !== null && userPrefs?.stopLossPercent !== undefined) {
    stopLossPercent = clamp(
      userPrefs.stopLossPercent,
      defaults.minStopLossPercent,
      defaults.maxStopLossPercent,
    );
  } else {
    stopLossPercent = defaults.defaultStopLossPercent;
  }

  // Resolve take profit level
  let takeProfitLevel: number;
  if (
    input.takeProfitLevel !== null &&
    input.takeProfitLevel !== undefined &&
    !Number.isNaN(input.takeProfitLevel) &&
    input.takeProfitLevel >= 1 &&
    input.takeProfitLevel <= 4
  ) {
    takeProfitLevel = Math.round(input.takeProfitLevel);
  } else if (
    userPrefs?.defaultTakeProfitLevel !== null &&
    userPrefs?.defaultTakeProfitLevel !== undefined
  ) {
    const userLevel = Math.round(userPrefs.defaultTakeProfitLevel);
    takeProfitLevel =
      userLevel >= 1 && userLevel <= 4 ? userLevel : defaults.defaultTakeProfitLevel;
  } else {
    takeProfitLevel = defaults.defaultTakeProfitLevel;
  }

  // Resolve take profit custom value
  let takeProfitCustom: number | null = null;
  if (
    input.takeProfitCustom !== null &&
    input.takeProfitCustom !== undefined &&
    !Number.isNaN(input.takeProfitCustom)
  ) {
    takeProfitCustom = clamp(
      input.takeProfitCustom,
      defaults.minTakeProfitPercent,
      defaults.maxTakeProfitPercent,
    );
  } else if (
    userPrefs?.takeProfitCustom !== null &&
    userPrefs?.takeProfitCustom !== undefined &&
    !Number.isNaN(userPrefs.takeProfitCustom)
  ) {
    takeProfitCustom = clamp(
      userPrefs.takeProfitCustom,
      defaults.minTakeProfitPercent,
      defaults.maxTakeProfitPercent,
    );
  }

  // Resolve take profit percentage from level or custom
  const takeProfitPercent = resolveTakeProfitPercent(
    takeProfitLevel,
    takeProfitCustom,
    userPrefs,
    defaults,
  );

  return {
    stopLossPercent,
    takeProfitLevel,
    takeProfitCustom,
    takeProfitPercent,
  };
}
