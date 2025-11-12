/**
 * Configuration Schemas
 *
 * Zod schemas for validating environment variables and configuration
 */

import { z } from "zod";

export const DatabaseConfigSchema = z.object({
  DATABASE_URL: z.string().url("Invalid database URL format"),
  DATABASE_POOL_SIZE: z.coerce.number().min(1).max(100).default(10),
  DATABASE_TIMEOUT: z.coerce.number().min(1000).default(30000),
  DATABASE_SSL: z.coerce.boolean().default(true),
});

export const AuthConfigSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("Invalid Supabase URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "Supabase Anonymous Key is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "Supabase Service Role Key is required").optional(),
  AUTH_SECRET: z.string().min(32, "Auth secret must be at least 32 characters").optional(),
});

export const MexcConfigSchema = z.object({
  MEXC_API_KEY: z.string().min(10, "MEXC API Key must be at least 10 characters").optional(),
  MEXC_SECRET_KEY: z.string().min(20, "MEXC Secret Key must be at least 20 characters").optional(),
  MEXC_BASE_URL: z.string().url().default("https://api.mexc.com"),
  MEXC_TIMEOUT: z.coerce.number().min(1000).default(10000),
  MEXC_RATE_LIMIT: z.coerce.number().min(1).default(50),
});

export const OpenAIConfigSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OpenAI API Key is required"),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  OPENAI_MAX_TOKENS: z.coerce.number().min(1).default(2000),
  OPENAI_TIMEOUT: z.coerce.number().min(1000).default(30000),
});

export const SecurityConfigSchema = z.object({
  ENCRYPTION_MASTER_KEY: z
    .string()
    .min(32, "Encryption key must be at least 32 characters")
    .optional(),
  SECURITY_HEADERS_ENABLED: z.coerce.boolean().default(true),
  CSRF_PROTECTION: z.coerce.boolean().default(true),
  RATE_LIMITING: z.coerce.boolean().default(true),
  CORS_ORIGIN: z.string().default("*"),
});

export const AppConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().min(1).max(65535).default(3008),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  APP_NAME: z.string().default("MEXC Sniper Bot"),
  APP_VERSION: z.string().default("1.0.0"),
});

export const ExternalServicesConfigSchema = z.object({
  VERCEL: z.coerce.boolean().default(false),
  VERCEL_URL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
  WEBHOOK_SECRET: z.string().optional(),
});

export const CacheConfigSchema = z.object({
  CACHE_ENABLED: z.coerce.boolean().default(true),
  CACHE_TTL: z.coerce.number().min(1000).default(300000),
  CACHE_MAX_SIZE: z.coerce.number().min(1).default(10000),
  CACHE_CLEANUP_INTERVAL: z.coerce.number().min(10000).default(60000),
});

export const MasterConfigSchema = z.object({
  ...DatabaseConfigSchema.shape,
  ...AuthConfigSchema.shape,
  ...MexcConfigSchema.shape,
  ...OpenAIConfigSchema.shape,
  ...SecurityConfigSchema.shape,
  ...AppConfigSchema.shape,
  ...ExternalServicesConfigSchema.shape,
  ...CacheConfigSchema.shape,
});

export type MasterConfig = z.infer<typeof MasterConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type MexcConfig = z.infer<typeof MexcConfigSchema>;
export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type ExternalServicesConfig = z.infer<typeof ExternalServicesConfigSchema>;
export type CacheConfig = z.infer<typeof CacheConfigSchema>;
