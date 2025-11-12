/**
 * Configuration Manager
 *
 * Core configuration management with singleton pattern and change notifications
 */

import { ConfigurationLoader } from "./configuration-loader";
import { type Configuration, ConfigurationSchema } from "./configuration-schema";

export class ConfigurationManager {
  private static instance: ConfigurationManager | null = null;
  private config: Configuration;
  private listeners: Map<string, ((config: Configuration) => void)[]> = new Map();

  private constructor() {
    this.config = ConfigurationLoader.loadConfiguration();
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  public getConfig(): Configuration {
    return this.config;
  }

  public getSection<K extends keyof Configuration>(section: K): Configuration[K] {
    return this.config[section];
  }

  public getValue<T>(path: string): T {
    const keys = path.split(".");
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        throw new Error(`Configuration path '${path}' not found`);
      }
    }

    return value as T;
  }

  public updateConfig(newConfig: Partial<Configuration>): void {
    const merged = { ...this.config, ...newConfig };
    const validated = ConfigurationSchema.parse(merged);

    this.config = validated;
    this.notifyListeners();
  }

  public subscribe(key: string, callback: (config: Configuration) => void): void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)?.push(callback);
  }

  public unsubscribe(key: string): void {
    this.listeners.delete(key);
  }

  public validate(): { valid: boolean; errors: string[] } {
    try {
      ConfigurationSchema.parse(this.config);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error && typeof error === "object" && "errors" in error) {
        const zodError = error as { errors: Array<{ path: string[]; message: string }> };
        return {
          valid: false,
          errors: zodError.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
        };
      }
      return { valid: false, errors: ["Unknown validation error"] };
    }
  }

  public getSummary(): Record<string, any> {
    return {
      environment: this.config.app.environment,
      version: this.config.app.version,
      server: {
        port: this.config.app.server.port,
        host: this.config.app.server.host,
      },
      features: {
        autoSnipingEnabled: this.config.trading.autoSniping.enabled,
        paperTradingMode: this.config.trading.autoSniping.paperTradingMode,
        cachingEnabled: this.config.mexc.enableCaching,
        monitoringEnabled: this.config.monitoring.metrics.enabled,
      },
      credentials: {
        mexcConfigured: !!(this.config.mexc.apiKey && this.config.mexc.secretKey),
        databaseConfigured: !!this.config.database.url,
        cacheConfigured: !!(this.config.cache.redis.url || this.config.cache.redis.host),
      },
    };
  }

  private notifyListeners(): void {
    for (const [key, callbacks] of this.listeners) {
      for (const callback of callbacks) {
        try {
          callback(this.config);
        } catch (error) {
          console.error(`Error in configuration listener '${key}':`, error);
        }
      }
    }
  }
}
