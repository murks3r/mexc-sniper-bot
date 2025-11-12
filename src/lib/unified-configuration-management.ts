/**
 * Unified Configuration Management System
 *
 * Consolidates all configuration patterns across the application into a single,
 * type-safe, and maintainable configuration system.
 *
 * ELIMINATES REDUNDANCY:
 * - Multiple config interfaces across 151+ files
 * - Scattered environment variable access
 * - Duplicate validation logic
 * - Inconsistent default values
 *
 * PROVIDES:
 * - Type-safe configuration access
 * - Environment-specific overrides
 * - Validation and error handling
 * - Hot reloading capabilities
 * - Configuration change notifications
 */

export * from "./config/config-helpers";
export {
  getConfig,
  getConfigSection,
  getConfigSummary,
  getConfigValue,
  isDevelopment,
  isFeatureEnabled,
  isProduction,
  isTest,
  subscribeToConfig,
  validateConfig,
} from "./config/config-helpers";
export * from "./config/configuration-loader";
export * from "./config/configuration-manager";
export { ConfigurationManager } from "./config/configuration-manager";

// Re-export main types and functions for backward compatibility
export type { Configuration } from "./config/configuration-schema";
// Export all configuration modules
export * from "./config/configuration-schema";
export * from "./config/configuration-validation";
export {
  getConfigHealth,
  getMexcCredentials,
  hasMexcCredentials,
  validateMexcConfig,
  validateTradingConfig,
} from "./config/configuration-validation";
