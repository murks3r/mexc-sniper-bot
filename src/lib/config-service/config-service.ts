/**
 * Configuration Service
 *
 * Main service for configuration validation and management
 */

import { getUnifiedCache } from "../unified-cache-system";
import {
  AppConfigSchema,
  AuthConfigSchema,
  CacheConfigSchema,
  DatabaseConfigSchema,
  ExternalServicesConfigSchema,
  type MasterConfig,
  MasterConfigSchema,
  MexcConfigSchema,
  OpenAIConfigSchema,
  SecurityConfigSchema,
} from "./config-schemas";

export interface ConfigValidationResult {
  valid: boolean;
  config?: MasterConfig;
  errors: Array<{
    path: string;
    message: string;
    value?: any;
  }>;
  warnings: Array<{
    path: string;
    message: string;
    suggestion?: string;
  }>;
  missing: string[];
  deprecated: string[];
  security: {
    exposedSecrets: string[];
    weakPasswords: string[];
    insecureSettings: string[];
  };
}

export interface ConfigOverrides {
  [key: string]: any;
}

export class UnifiedConfigService {
  private static instance: UnifiedConfigService | null = null;
  private cachedConfig: MasterConfig | null = null;
  private lastValidation = 0;
  private cache = getUnifiedCache();

  private constructor() {}

  static getInstance(): UnifiedConfigService {
    if (!UnifiedConfigService.instance) {
      UnifiedConfigService.instance = new UnifiedConfigService();
    }
    return UnifiedConfigService.instance;
  }

  async validateAndLoad(overrides: ConfigOverrides = {}): Promise<ConfigValidationResult> {
    const cacheKey = `config:validation:${JSON.stringify(overrides)}`;

    const cached = await this.cache.get<ConfigValidationResult>(cacheKey, "config");
    if (cached && Date.now() - this.lastValidation < 60000) {
      return cached;
    }

    try {
      const envVars = this.getEnvironmentVariables();
      const mergedVars = { ...envVars, ...overrides };

      const validationResult = MasterConfigSchema.safeParse(mergedVars);

      if (!validationResult.success) {
        const result: ConfigValidationResult = {
          valid: false,
          errors: validationResult.error.errors.map((error) => ({
            path: error.path.join("."),
            message: error.message,
            value: error.code,
          })),
          warnings: [],
          missing: [],
          deprecated: [],
          security: {
            exposedSecrets: [],
            weakPasswords: [],
            insecureSettings: [],
          },
        };

        await this.cache.set(cacheKey, result, "config", 60000);
        this.lastValidation = Date.now();
        return result;
      }

      const config = validationResult.data;
      const securityScan = this.performSecurityScan(mergedVars);
      const warnings = this.generateWarnings(config);

      const result: ConfigValidationResult = {
        valid: true,
        config,
        errors: [],
        warnings,
        missing: [],
        deprecated: [],
        security: securityScan,
      };

      this.cachedConfig = config;
      await this.cache.set(cacheKey, result, "config", 60000);
      this.lastValidation = Date.now();

      return result;
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            path: "general",
            message: error instanceof Error ? error.message : "Unknown validation error",
          },
        ],
        warnings: [],
        missing: [],
        deprecated: [],
        security: {
          exposedSecrets: [],
          weakPasswords: [],
          insecureSettings: [],
        },
      };
    }
  }

  private getEnvironmentVariables(): Record<string, string> {
    const envVars: Record<string, string> = {};

    const schemaKeys = [
      ...Object.keys(DatabaseConfigSchema.shape),
      ...Object.keys(AuthConfigSchema.shape),
      ...Object.keys(MexcConfigSchema.shape),
      ...Object.keys(OpenAIConfigSchema.shape),
      ...Object.keys(SecurityConfigSchema.shape),
      ...Object.keys(AppConfigSchema.shape),
      ...Object.keys(ExternalServicesConfigSchema.shape),
      ...Object.keys(CacheConfigSchema.shape),
    ];

    for (const key of schemaKeys) {
      if (process.env[key] !== undefined) {
        envVars[key] = process.env[key];
      }
    }

    return envVars;
  }

  private performSecurityScan(envVars: Record<string, any>): ConfigValidationResult["security"] {
    const exposedSecrets: string[] = [];
    const weakPasswords: string[] = [];
    const insecureSettings: string[] = [];

    const secretKeys = ["SECRET", "KEY", "PASSWORD", "TOKEN"];
    const weakPatterns = /^(password|123456|admin|test)/i;

    for (const [key, value] of Object.entries(envVars)) {
      if (typeof value === "string") {
        if (secretKeys.some((secret) => key.includes(secret)) && value.length < 16) {
          weakPasswords.push(key);
        }

        if (value.match(weakPatterns)) {
          weakPasswords.push(key);
        }
      }
    }

    if (envVars.NODE_ENV === "production" && envVars.LOG_LEVEL === "debug") {
      insecureSettings.push("Debug logging in production");
    }

    return {
      exposedSecrets,
      weakPasswords,
      insecureSettings,
    };
  }

  private generateWarnings(config: MasterConfig): ConfigValidationResult["warnings"] {
    const warnings: ConfigValidationResult["warnings"] = [];

    if (!config.MEXC_API_KEY || !config.MEXC_SECRET_KEY) {
      warnings.push({
        path: "mexc",
        message: "MEXC API credentials not configured - trading features will be limited",
        suggestion: "Set MEXC_API_KEY and MEXC_SECRET_KEY environment variables",
      });
    }

    if (config.DATABASE_POOL_SIZE > 20) {
      warnings.push({
        path: "database",
        message: "High database pool size may impact performance",
        suggestion: "Consider reducing DATABASE_POOL_SIZE to 10-15",
      });
    }

    return warnings;
  }

  async getConfig(): Promise<MasterConfig | null> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const result = await this.validateAndLoad();
    return result.config || null;
  }

  async refreshCache(): Promise<void> {
    this.cachedConfig = null;
    this.lastValidation = 0;
    await this.cache.clear("config");
  }
}
