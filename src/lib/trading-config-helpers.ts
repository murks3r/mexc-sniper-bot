/**
 * Trading Configuration Helpers
 * Centralized logic for handling trading configuration with environment variable support
 */

/**
 * Get paper trading mode with environment variable override
 * Priority: MEXC_PAPER_TRADING env var > PAPER_TRADING_MODE env var > default (false)
 */
export function getPaperTradingDefault(): boolean {
  // Check MEXC_PAPER_TRADING first (primary env var)
  if (process.env.MEXC_PAPER_TRADING !== undefined) {
    return process.env.MEXC_PAPER_TRADING === "true";
  }

  // Check PAPER_TRADING_MODE as fallback
  if (process.env.PAPER_TRADING_MODE !== undefined) {
    return process.env.PAPER_TRADING_MODE === "true";
  }

  // Default to real trading (false) for production
  return false;
}

/**
 * Get auto-sniping enabled default with environment override
 */
export function getAutoSnipingDefault(): boolean {
  if (process.env.AUTO_SNIPING_ENABLED !== undefined) {
    return process.env.AUTO_SNIPING_ENABLED !== "false";
  }

  // Default to enabled for production
  return true;
}

/**
 * Get environment-aware trading configuration defaults
 */
export function getTradingConfigDefaults() {
  return {
    paperTradingMode: getPaperTradingDefault(),
    enablePaperTrading: getPaperTradingDefault(),
    autoSnipingEnabled: getAutoSnipingDefault(),
  };
}

/**
 * Environment variable keys used for trading configuration
 */
export const TRADING_ENV_VARS = {
  MEXC_PAPER_TRADING: "MEXC_PAPER_TRADING",
  PAPER_TRADING_MODE: "PAPER_TRADING_MODE",
  AUTO_SNIPING_ENABLED: "AUTO_SNIPING_ENABLED",
} as const;

/**
 * Log current trading configuration for debugging
 */
export function logTradingConfig() {
  const config = getTradingConfigDefaults();
  console.info("[Trading Config]", {
    paperTradingMode: config.paperTradingMode,
    autoSnipingEnabled: config.autoSnipingEnabled,
    environmentVariables: {
      MEXC_PAPER_TRADING: process.env.MEXC_PAPER_TRADING,
      PAPER_TRADING_MODE: process.env.PAPER_TRADING_MODE,
      AUTO_SNIPING_ENABLED: process.env.AUTO_SNIPING_ENABLED,
    },
  });
}
