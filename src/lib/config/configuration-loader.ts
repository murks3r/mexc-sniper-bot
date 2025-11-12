/**
 * Configuration Loader
 *
 * Handles loading configuration from environment variables and defaults
 */

import { type Configuration, ConfigurationSchema } from "./configuration-schema";

export class ConfigurationLoader {
  private static removeUndefined(obj: any): any {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => ConfigurationLoader.removeUndefined(item));
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = ConfigurationLoader.removeUndefined(value);
      }
    }
    return result;
  }

  static loadConfiguration(): Configuration {
    const rawConfig = ConfigurationLoader.buildRawConfig();
    const cleanConfig = ConfigurationLoader.removeUndefined(rawConfig);

    try {
      return ConfigurationSchema.parse(cleanConfig);
    } catch (error) {
      const issuesCount = (error as any)?.issues?.length;
      const details =
        issuesCount && Number.isFinite(issuesCount)
          ? `${issuesCount} validation issues`
          : error instanceof Error
            ? error.message
            : "Unknown validation error";
      console.warn(`Configuration invalid; using defaults (${details})`);

      return ConfigurationSchema.parse({
        app: {},
        mexc: {},
        trading: {},
        database: {},
        cache: {},
        monitoring: {},
        security: {},
      } as any);
    }
  }

  private static buildRawConfig(): any {
    return {
      app: {
        name: process.env.APP_NAME,
        version: process.env.APP_VERSION || process.env.npm_package_version,
        environment: process.env.NODE_ENV,
        server: {
          port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : undefined,
          host: process.env.HOST,
          cors: {
            enabled: process.env.CORS_ENABLED === "true",
            origins: process.env.CORS_ORIGINS?.split(","),
          },
        },
        logging: {
          level: process.env.LOG_LEVEL,
          format: process.env.LOG_FORMAT,
        },
      },
      mexc: {
        apiKey: process.env.MEXC_API_KEY,
        secretKey: process.env.MEXC_SECRET_KEY,
        passphrase: process.env.MEXC_PASSPHRASE,
        baseUrl: process.env.MEXC_BASE_URL,
        websocketUrl: process.env.MEXC_WEBSOCKET_URL,
        timeout: process.env.MEXC_TIMEOUT
          ? Number.parseInt(process.env.MEXC_TIMEOUT, 10)
          : undefined,
        enableCaching: process.env.MEXC_CACHE_ENABLED !== "false",
        enableCircuitBreaker: process.env.MEXC_CIRCUIT_BREAKER_ENABLED !== "false",
      },
      trading: {
        autoSniping: {
          enabled: process.env.AUTO_SNIPING_ENABLED === "true",
          paperTradingMode: process.env.PAPER_TRADING_MODE !== "false",
          maxConcurrentPositions: process.env.MAX_CONCURRENT_POSITIONS
            ? Number.parseInt(process.env.MAX_CONCURRENT_POSITIONS, 10)
            : undefined,
          confidenceThreshold: process.env.CONFIDENCE_THRESHOLD
            ? Number.parseInt(process.env.CONFIDENCE_THRESHOLD, 10)
            : undefined,
        },
        risk: {
          maxPositionSize: process.env.MAX_POSITION_SIZE
            ? Number.parseFloat(process.env.MAX_POSITION_SIZE)
            : undefined,
          stopLossPercentage: process.env.STOP_LOSS_PERCENTAGE
            ? Number.parseFloat(process.env.STOP_LOSS_PERCENTAGE)
            : undefined,
        },
      },
      database: {
        url: process.env.DATABASE_URL,
        queryTimeout: process.env.DB_QUERY_TIMEOUT
          ? Number.parseInt(process.env.DB_QUERY_TIMEOUT, 10)
          : undefined,
        enableQueryLogging: process.env.DB_QUERY_LOGGING === "true",
      },
      cache: {
        redis: {
          url: process.env.REDIS_URL,
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT ? Number.parseInt(process.env.REDIS_PORT, 10) : undefined,
          password: process.env.REDIS_PASSWORD,
        },
      },
      monitoring: {
        metrics: {
          enabled: process.env.METRICS_ENABLED !== "false",
        },
        alerts: {
          enabled: process.env.ALERTS_ENABLED !== "false",
        },
      },
      security: {
        auth: {
          provider: process.env.AUTH_PROVIDER,
          requireMfa: process.env.REQUIRE_MFA === "true",
        },
        api: {
          enableRateLimit: process.env.RATE_LIMIT_ENABLED !== "false",
          requireApiKey: process.env.REQUIRE_API_KEY === "true",
        },
      },
    };
  }
}
