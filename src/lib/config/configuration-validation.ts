/**
 * Configuration Validation Helpers
 *
 * Specialized validation functions for different configuration sections
 */

import { getConfigSection } from "./config-helpers";
import { ConfigurationManager } from "./configuration-manager";

export function validateMexcConfig(): { valid: boolean; issues: string[] } {
  const mexcConfig = getConfigSection("mexc");
  const issues: string[] = [];

  if (!mexcConfig.apiKey) {
    issues.push("MEXC API key is required");
  }

  if (!mexcConfig.secretKey) {
    issues.push("MEXC secret key is required");
  }

  if (mexcConfig.timeout < 5000) {
    issues.push("MEXC timeout should be at least 5 seconds");
  }

  if (mexcConfig.maxRetries > 5) {
    issues.push("MEXC max retries should not exceed 5");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateTradingConfig(): { valid: boolean; issues: string[] } {
  const tradingConfig = getConfigSection("trading");
  const issues: string[] = [];

  if (tradingConfig.autoSniping.enabled && !tradingConfig.autoSniping.paperTradingMode) {
    const { apiKey, secretKey } = getMexcCredentials();
    if (!(apiKey && secretKey)) {
      issues.push("Live trading requires MEXC credentials");
    }
  }

  if (tradingConfig.risk.maxPositionSize > 50) {
    issues.push("Max position size above 50% is highly risky");
  }

  if (tradingConfig.risk.stopLossPercentage < 2) {
    issues.push("Stop loss below 2% may trigger too frequently");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function getMexcCredentials(): { apiKey?: string; secretKey?: string } {
  const mexcConfig = getConfigSection("mexc");
  return {
    apiKey: mexcConfig.apiKey,
    secretKey: mexcConfig.secretKey,
  };
}

export function hasMexcCredentials(): boolean {
  const { apiKey, secretKey } = getMexcCredentials();
  return !!(apiKey && secretKey);
}

export function getConfigHealth(): {
  overall: "healthy" | "warning" | "critical";
  checks: Array<{
    name: string;
    status: "pass" | "warn" | "fail";
    message: string;
  }>;
} {
  const checks: Array<{
    name: string;
    status: "pass" | "warn" | "fail";
    message: string;
  }> = [];

  const configValidation = ConfigurationManager.getInstance().validate();
  checks.push({
    name: "Configuration Schema",
    status: configValidation.valid ? "pass" : "fail",
    message: configValidation.valid ? "Valid" : configValidation.errors.join(", "),
  });

  const mexcValidation = validateMexcConfig();
  checks.push({
    name: "MEXC Configuration",
    status: mexcValidation.valid ? "pass" : "warn",
    message: mexcValidation.valid ? "Valid" : mexcValidation.issues.join(", "),
  });

  const tradingValidation = validateTradingConfig();
  checks.push({
    name: "Trading Configuration",
    status: tradingValidation.valid ? "pass" : "warn",
    message: tradingValidation.valid ? "Valid" : tradingValidation.issues.join(", "),
  });

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  let overall: "healthy" | "warning" | "critical";
  if (failCount > 0) {
    overall = "critical";
  } else if (warnCount > 0) {
    overall = "warning";
  } else {
    overall = "healthy";
  }

  return { overall, checks };
}
