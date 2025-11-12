/**
 * Configuration Helper Functions
 *
 * Convenience functions for accessing configuration
 */

import { ConfigurationManager } from "./configuration-manager";
import type { Configuration } from "./configuration-schema";

export function getConfig(): Configuration {
  return ConfigurationManager.getInstance().getConfig();
}

export function getConfigSection<K extends keyof Configuration>(section: K): Configuration[K] {
  return ConfigurationManager.getInstance().getSection(section);
}

export function getConfigValue<T>(path: string): T {
  return ConfigurationManager.getInstance().getValue<T>(path);
}

export function subscribeToConfig(key: string, callback: (config: Configuration) => void): void {
  ConfigurationManager.getInstance().subscribe(key, callback);
}

export function validateConfig(): { valid: boolean; errors: string[] } {
  return ConfigurationManager.getInstance().validate();
}

export function getConfigSummary(): Record<string, any> {
  return ConfigurationManager.getInstance().getSummary();
}

export function isDevelopment(): boolean {
  return getConfigValue<string>("app.environment") === "development";
}

export function isProduction(): boolean {
  return getConfigValue<string>("app.environment") === "production";
}

export function isTest(): boolean {
  return getConfigValue<string>("app.environment") === "test";
}

export function isFeatureEnabled(feature: keyof Configuration["trading"]["autoSniping"]): boolean {
  return getConfigValue<boolean>(`trading.autoSniping.${feature}`);
}
