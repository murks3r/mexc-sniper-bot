/**
 * Configuration Schema Definitions
 *
 * Contains all Zod schemas for configuration validation
 */

import { z } from "zod";

/**
 * Core Application Configuration Schema
 */
export const ApplicationConfigSchema = z.object({
  name: z.string().default("MEXC Sniper Bot"),
  version: z.string().default("1.0.0"),
  environment: z.enum(["development", "production", "test"]).default("development"),
  server: z.object({
    port: z.number().min(1000).max(65535).default(3000),
    host: z.string().default("localhost"),
    cors: z.object({
      enabled: z.boolean().default(true),
      origins: z.array(z.string()).default(["http://localhost:3000"]),
    }),
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    format: z.enum(["json", "text"]).default("json"),
    file: z.object({
      enabled: z.boolean().default(false),
      path: z.string().default("./logs/app.log"),
      maxSize: z.string().default("100MB"),
      maxFiles: z.number().default(5),
    }),
  }),
});

/**
 * MEXC API Configuration Schema
 */
export const MexcConfigSchema = z.object({
  apiKey: z.string().optional(),
  secretKey: z.string().optional(),
  passphrase: z.string().optional(),
  baseUrl: z.string().url().default("https://api.mexc.com"),
  websocketUrl: z.string().url().default("wss://wbs.mexc.com/ws"),
  timeout: z.number().min(1000).max(300000).default(30000),
  maxRetries: z.number().min(0).max(10).default(3),
  retryDelay: z.number().min(100).max(10000).default(1000),
  rateLimitDelay: z.number().min(50).max(5000).default(200),
  enableCaching: z.boolean().default(true),
  cacheTTL: z.number().min(1).max(3600).default(300),
  enableCircuitBreaker: z.boolean().default(true),
  circuitBreakerThreshold: z.number().min(1).max(100).default(5),
  circuitBreakerTimeout: z.number().min(1000).max(300000).default(60000),
  websocket: z.object({
    pingInterval: z.number().default(30000),
    pongTimeout: z.number().default(5000),
    reconnectInterval: z.number().default(5000),
    maxReconnectAttempts: z.number().default(10),
  }),
});

/**
 * Trading Configuration Schema
 */
export const TradingConfigSchema = z.object({
  autoSniping: z.object({
    enabled: z.boolean().default(false),
    maxConcurrentPositions: z.number().min(1).max(100).default(5),
    patternDetectionInterval: z.number().min(1000).max(300000).default(5000),
    safetyCheckInterval: z.number().min(1000).max(60000).default(10000),
    confidenceThreshold: z.number().min(0).max(100).default(80),
    paperTradingMode: z.boolean().default(false),
  }),
  risk: z.object({
    maxPositionSize: z.number().min(0.1).max(100).default(10),
    stopLossPercentage: z.number().min(0.1).max(50).default(5),
    takeProfitPercentage: z.number().min(0.1).max(100).default(15),
    maxDailyLoss: z.number().min(0.1).max(50).default(10),
    maxDrawdown: z.number().min(0.1).max(50).default(20),
    maxPortfolioConcentration: z.number().min(1).max(100).default(25),
    maxCorrelatedPositions: z.number().min(1).max(20).default(3),
    emergencyStopLoss: z.number().min(0.1).max(100).default(25),
    criticalVolatilityThreshold: z.number().min(1).max(1000).default(50),
  }),
  orders: z.object({
    defaultOrderType: z.enum(["market", "limit"]).default("limit"),
    slippageTolerance: z.number().min(0.01).max(10).default(0.5),
    maxOrderSize: z.number().min(1).max(1000000).default(10000),
    partialFillHandling: z.enum(["cancel", "keep", "retry"]).default("keep"),
    orderTimeout: z.number().min(1000).max(300000).default(30000),
    cancelTimeout: z.number().min(1000).max(60000).default(10000),
  }),
  patterns: z.object({
    enableReadyStatePattern: z.boolean().default(true),
    enablePreLaunchPattern: z.boolean().default(true),
    enableVolatilityPattern: z.boolean().default(false),
    readyStateConfidence: z.number().min(50).max(100).default(85),
    preLaunchAdvanceHours: z.number().min(0.5).max(12).default(3.5),
    volatilityThreshold: z.number().min(1).max(100).default(20),
    enableAiEnhancement: z.boolean().default(false),
    aiConfidenceBoost: z.number().min(0).max(50).default(10),
  }),
});

/**
 * Database Configuration Schema
 */
export const DatabaseConfigSchema = z.object({
  url: z.string().optional(),
  pool: z.object({
    min: z.number().min(0).max(100).default(2),
    max: z.number().min(1).max(100).default(20),
    acquireTimeoutMillis: z.number().default(60000),
    idleTimeoutMillis: z.number().default(30000),
  }),
  queryTimeout: z.number().min(1000).max(300000).default(30000),
  enableQueryLogging: z.boolean().default(false),
  slowQueryThreshold: z.number().min(100).max(10000).default(1000),
  migrations: z.object({
    autoRun: z.boolean().default(false),
    directory: z.string().default("./src/db/migrations"),
  }),
  enableQueryCache: z.boolean().default(true),
  queryCacheTTL: z.number().default(300),
});

/**
 * Cache Configuration Schema
 */
export const CacheConfigSchema = z.object({
  redis: z.object({
    url: z.string().optional(),
    host: z.string().default("localhost"),
    port: z.number().min(1).max(65535).default(6379),
    password: z.string().optional(),
    db: z.number().min(0).max(15).default(0),
    connectTimeout: z.number().default(10000),
    retryDelayOnFailover: z.number().default(100),
    maxRetriesPerRequest: z.number().default(3),
  }),
  default: z.object({
    ttl: z.number().min(1).max(86400).default(300),
    maxKeys: z.number().min(100).max(1000000).default(10000),
    evictionPolicy: z.enum(["lru", "lfu", "ttl"]).default("lru"),
  }),
  patterns: z.object({
    ttl: z.number().default(60),
    maxKeys: z.number().default(1000),
  }),
  marketData: z.object({
    ttl: z.number().default(30),
    maxKeys: z.number().default(5000),
  }),
  userSessions: z.object({
    ttl: z.number().default(3600),
    maxKeys: z.number().default(10000),
  }),
});

/**
 * Monitoring Configuration Schema
 */
export const MonitoringConfigSchema = z.object({
  healthChecks: z.object({
    enabled: z.boolean().default(true),
    interval: z.number().min(1000).max(300000).default(30000),
    timeout: z.number().min(1000).max(60000).default(10000),
    endpoints: z.array(z.string()).default(["/api/health"]),
  }),
  metrics: z.object({
    enabled: z.boolean().default(true),
    endpoint: z.string().default("/metrics"),
    collectInterval: z.number().default(15000),
    retentionPeriod: z.number().default(86400),
  }),
  performance: z.object({
    enableTracing: z.boolean().default(false),
    sampleRate: z.number().min(0).max(1).default(0.1),
    slowRequestThreshold: z.number().default(1000),
  }),
  alerts: z.object({
    enabled: z.boolean().default(true),
    channels: z.array(z.enum(["email", "slack", "webhook"])).default(["email"]),
    thresholds: z.object({
      errorRate: z.number().min(0).max(1).default(0.05),
      responseTime: z.number().default(2000),
      memoryUsage: z.number().min(0).max(1).default(0.85),
      cpuUsage: z.number().min(0).max(1).default(0.8),
    }),
  }),
});

/**
 * Security Configuration Schema
 */
export const SecurityConfigSchema = z.object({
  auth: z.object({
    provider: z.enum(["supabase", "auth0", "kinde"]).default("supabase"),
    sessionTimeout: z.number().default(3600),
    requireMfa: z.boolean().default(false),
  }),
  api: z.object({
    enableRateLimit: z.boolean().default(true),
    rateLimitWindow: z.number().default(900),
    rateLimitMax: z.number().default(100),
    requireApiKey: z.boolean().default(false),
  }),
  encryption: z.object({
    algorithm: z.string().default("aes-256-gcm"),
    keyRotationInterval: z.number().default(86400 * 30),
  }),
  cors: z.object({
    enabled: z.boolean().default(true),
    allowedOrigins: z.array(z.string()).default(["http://localhost:3000"]),
    allowedMethods: z.array(z.string()).default(["GET", "POST", "PUT", "DELETE"]),
    allowCredentials: z.boolean().default(true),
  }),
});

/**
 * Master Configuration Schema
 */
export const ConfigurationSchema = z.object({
  app: ApplicationConfigSchema,
  mexc: MexcConfigSchema,
  trading: TradingConfigSchema,
  database: DatabaseConfigSchema,
  cache: CacheConfigSchema,
  monitoring: MonitoringConfigSchema,
  security: SecurityConfigSchema,
});

export type Configuration = z.infer<typeof ConfigurationSchema>;
