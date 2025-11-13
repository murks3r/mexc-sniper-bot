// Minimal configuration helpers for UnifiedMexcServiceV2

import type { MexcApiConfig, MexcCacheConfig } from "../data/modules/mexc-api-types";

export interface UnifiedMexcConfigV2 extends Partial<MexcApiConfig>, Partial<MexcCacheConfig> {
  enableCircuitBreaker?: boolean;
  enableEnhancedFeatures?: boolean;
}

const DEFAULT_CONFIG: Required<UnifiedMexcConfigV2> = {
  apiKey: process.env.MEXC_API_KEY?.trim() || "",
  secretKey: process.env.MEXC_SECRET_KEY?.trim() || "",
  passphrase: process.env.MEXC_API_PASSPHRASE?.trim() || "",
  baseUrl: process.env.MEXC_API_BASE_URL?.trim() || "https://api.mexc.com",
  timeout: 10_000,
  maxRetries: 3,
  retryDelay: 500,
  rateLimitDelay: 100,
  enableCaching: true,
  cacheTTL: 60_000,
  apiResponseTTL: 30_000,
  enableCircuitBreaker: false,
  enableEnhancedFeatures: false,
};

function mergeStrings(preferred?: string, fallback?: string): string {
  if (preferred && preferred.trim().length > 0) {
    return preferred.trim();
  }
  return fallback ? fallback.trim() : "";
}

export function mergeConfig(
  overrides: Partial<UnifiedMexcConfigV2> = {},
): Required<UnifiedMexcConfigV2> {
  return {
    apiKey: mergeStrings(overrides.apiKey, DEFAULT_CONFIG.apiKey),
    secretKey: mergeStrings(overrides.secretKey, DEFAULT_CONFIG.secretKey),
    passphrase: mergeStrings(overrides.passphrase, DEFAULT_CONFIG.passphrase),
    baseUrl: mergeStrings(overrides.baseUrl, DEFAULT_CONFIG.baseUrl),
    timeout: overrides.timeout ?? DEFAULT_CONFIG.timeout,
    maxRetries: overrides.maxRetries ?? DEFAULT_CONFIG.maxRetries,
    retryDelay: overrides.retryDelay ?? DEFAULT_CONFIG.retryDelay,
    rateLimitDelay: overrides.rateLimitDelay ?? DEFAULT_CONFIG.rateLimitDelay,
    enableCaching: overrides.enableCaching ?? DEFAULT_CONFIG.enableCaching,
    cacheTTL: overrides.cacheTTL ?? DEFAULT_CONFIG.cacheTTL,
    apiResponseTTL: overrides.apiResponseTTL ?? DEFAULT_CONFIG.apiResponseTTL,
    enableCircuitBreaker: overrides.enableCircuitBreaker ?? DEFAULT_CONFIG.enableCircuitBreaker,
    enableEnhancedFeatures:
      overrides.enableEnhancedFeatures ?? DEFAULT_CONFIG.enableEnhancedFeatures,
  };
}

export function hasValidCredentials(config: UnifiedMexcConfigV2): boolean {
  return Boolean(config.apiKey?.trim() && config.secretKey && config.secretKey.trim());
}

export function toApiConfig(config: Required<UnifiedMexcConfigV2>): MexcApiConfig {
  return {
    apiKey: config.apiKey,
    secretKey: config.secretKey,
    passphrase: config.passphrase,
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    retryDelay: config.retryDelay,
    rateLimitDelay: config.rateLimitDelay,
  };
}

export function toCacheConfig(config: Required<UnifiedMexcConfigV2>): MexcCacheConfig {
  return {
    enableCaching: config.enableCaching,
    cacheTTL: config.cacheTTL,
    apiResponseTTL: config.apiResponseTTL,
  };
}
