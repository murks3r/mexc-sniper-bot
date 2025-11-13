/**
 * SniperConfigLoader
 *
 * Loads and validates sniper configuration from JSON file with:
 * - Schema validation (Zod)
 * - Environment variable override precedence
 * - Hot reload support
 * - Default values
 */

import { existsSync, readFileSync, watchFile } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createSimpleLogger } from "@/src/lib/unified-logger";

const ConfigSchema = z.object({
  maxConcurrentRequests: z.number().int().positive().default(5),
  requestTimeout: z.number().int().positive().default(5000),
  enabled: z.boolean().default(true),
  retryConfig: z
    .object({
      maxRetries: z.number().int().nonnegative().default(3),
      baseDelay: z.number().int().nonnegative().default(1000),
      maxDelay: z.number().int().positive().default(30000),
    })
    .optional(),
  executionWindow: z
    .object({
      preWindowBufferMs: z.number().int().nonnegative().default(1000),
      postWindowBufferMs: z.number().int().nonnegative().default(2000),
    })
    .optional(),
});

export type SniperConfig = z.infer<typeof ConfigSchema>;

interface LoaderOptions {
  watch?: boolean;
}

export class SniperConfigLoader {
  private readonly logger = createSimpleLogger("sniper-config-loader");
  private readonly configPath: string;
  private config: SniperConfig;
  private watchHandle: ReturnType<typeof watchFile> | null = null;

  constructor(configPath: string, options: LoaderOptions = {}) {
    this.configPath = configPath;
    this.config = this.loadConfig();

    if (options.watch) {
      this.startWatching();
    }
  }

  /**
   * Load configuration from file and environment variables
   */
  private loadConfig(): SniperConfig {
    let fileConfig: Partial<SniperConfig> = {};

    // Try to load from file
    if (existsSync(this.configPath)) {
      try {
        const fileContent = readFileSync(this.configPath, "utf-8");
        fileConfig = JSON.parse(fileContent);
        this.logger.debug("Config loaded from file", { path: this.configPath });
      } catch (error) {
        this.logger.error("Failed to load config file", {
          path: this.configPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      this.logger.warn("Config file not found, using defaults", {
        path: this.configPath,
      });
    }

    // Apply environment variable overrides
    const envConfig: Partial<SniperConfig> = {};

    if (process.env.SNIPER_MAX_CONCURRENT_REQUESTS) {
      envConfig.maxConcurrentRequests = parseInt(process.env.SNIPER_MAX_CONCURRENT_REQUESTS, 10);
    }

    if (process.env.SNIPER_REQUEST_TIMEOUT) {
      envConfig.requestTimeout = parseInt(process.env.SNIPER_REQUEST_TIMEOUT, 10);
    }

    if (process.env.SNIPER_ENABLED !== undefined) {
      envConfig.enabled = process.env.SNIPER_ENABLED === "true";
    }

    // Merge: env vars override file config
    const mergedConfig = { ...fileConfig, ...envConfig };

    // Validate and parse with defaults
    try {
      const validated = ConfigSchema.parse(mergedConfig);
      this.logger.info("Config validated successfully", {
        maxConcurrentRequests: validated.maxConcurrentRequests,
        requestTimeout: validated.requestTimeout,
        enabled: validated.enabled,
      });
      return validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error("Invalid config schema", {
          errors: error.errors,
        });
        throw new Error(`Invalid config schema: ${error.errors.map((e) => e.message).join(", ")}`);
      }
      throw error;
    }
  }

  /**
   * Start watching config file for changes
   */
  private startWatching(): void {
    if (this.watchHandle) {
      return; // Already watching
    }

    if (!existsSync(this.configPath)) {
      this.logger.warn("Cannot watch non-existent config file", {
        path: this.configPath,
      });
      return;
    }

    this.watchHandle = watchFile(this.configPath, { interval: 1000 }, () => {
      this.logger.info("Config file changed, reloading...", {
        path: this.configPath,
      });
      try {
        this.config = this.loadConfig();
        this.logger.info("Config reloaded successfully");
      } catch (error) {
        this.logger.error("Failed to reload config", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Keep using previous config on error
      }
    });

    this.logger.debug("Started watching config file", { path: this.configPath });
  }

  /**
   * Manually reload configuration
   */
  reload(): void {
    this.config = this.loadConfig();
  }

  /**
   * Get current configuration
   */
  getConfig(): SniperConfig {
    return { ...this.config };
  }

  /**
   * Stop watching config file
   */
  stopWatching(): void {
    if (this.watchHandle) {
      watchFile.unwatchFile(this.configPath);
      this.watchHandle = null;
      this.logger.debug("Stopped watching config file");
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopWatching();
  }
}

// Singleton instance for default config path
let defaultLoader: SniperConfigLoader | null = null;

/**
 * Load sniper configuration (singleton pattern)
 * This function provides a simple API for loading config
 */
export async function loadSniperConfig(): Promise<{
  async?: {
    enabled: boolean;
    maxConcurrency: number;
    requestTimeoutMs: number;
  };
  execution?: {
    retryAttempts: number;
    retryDelayMs: number;
  };
  takeProfit?: {
    checkIntervalMs: number;
    takeProfitPercent: number;
    stopLossPercent: number;
  };
  balanceGuard?: {
    minBalanceBufferPercent: number;
    checkIntervalMs: number;
  };
}> {
  if (!defaultLoader) {
    const configPath = join(process.cwd(), "config", "sniper-config.json");
    defaultLoader = new SniperConfigLoader(configPath);
  }

  const config = defaultLoader.getConfig();

  // Transform to expected structure
  return {
    async: {
      enabled: config.enabled,
      maxConcurrency: config.maxConcurrentRequests,
      requestTimeoutMs: config.requestTimeout,
    },
    execution: config.retryConfig
      ? {
          retryAttempts: config.retryConfig.maxRetries,
          retryDelayMs: config.retryConfig.baseDelay,
        }
      : undefined,
    takeProfit: undefined, // Not in current config schema
    balanceGuard: undefined, // Not in current config schema
  };
}
