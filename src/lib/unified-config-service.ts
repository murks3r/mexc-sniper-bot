/**
 * Unified Configuration Validation Service for MEXC Sniper Bot
 *
 * This service consolidates all environment variable validation and configuration
 * management across the application into a single, centralized system.
 */

// Re-export main types and classes for backward compatibility
export type {
  AppConfig,
  AuthConfig,
  CacheConfig,
  DatabaseConfig,
  ExternalServicesConfig,
  MasterConfig,
  MexcConfig,
  OpenAIConfig,
  SecurityConfig,
} from "./config-service/config-schemas";
// Export all configuration service modules
export * from "./config-service/config-schemas";
export type { ConfigOverrides, ConfigValidationResult } from "./config-service/config-service";
export * from "./config-service/config-service";
export { UnifiedConfigService } from "./config-service/config-service";
