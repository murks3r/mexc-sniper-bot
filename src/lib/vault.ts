/**
 * AWS SSM Parameter Store Vault
 *
 * Loads configuration from AWS SSM Parameter Store and injects
 * parameters into process.env before any other app logic runs.
 *
 * Path prefix: /app/mexc-sniper-bot/
 *
 * @module vault
 */

import {
  SSMClient,
  GetParametersByPathCommand,
  type Parameter,
} from "@aws-sdk/client-ssm";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SSM_PATH_PREFIX = "/app/mexc-sniper-bot/";
const AWS_REGION = process.env.AWS_REGION || "eu-central-1";

/**
 * Explicit mapping from SSM parameter paths (relative to the prefix)
 * to the environment variable names used throughout the codebase.
 *
 * This is intentionally explicit rather than auto-derived so that
 * NEXT_PUBLIC_ prefixes and other naming conventions are preserved.
 */
const PATH_TO_ENV: Record<string, string> = {
  // OpenAI
  "openai/api-key": "OPENAI_API_KEY",

  // MEXC
  "api-key": "MEXC_API_KEY",
  "secret-key": "MEXC_SECRET_KEY",
  "base-url": "MEXC_BASE_URL",

  // Clerk (auth)
  "clerk/publishable-key": "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "clerk/secret-key": "CLERK_SECRET_KEY",

  // Supabase
  "supabase/url": "NEXT_PUBLIC_SUPABASE_URL",
  "supabase/anon-key": "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "supabase/service-role-key": "SUPABASE_SERVICE_ROLE_KEY",

  // Database
  "database/url": "DATABASE_URL",

  // Redis
  "redis/url": "REDIS_URL",
  "redis/host": "REDIS_HOST",
  "redis/port": "REDIS_PORT",
  "redis/password": "REDIS_PASSWORD",

  // Inngest
  "inngest/event-key": "INNGEST_EVENT_KEY",
  "inngest/signing-key": "INNGEST_SIGNING_KEY",

  // Security
  "security/encryption-master-key": "ENCRYPTION_MASTER_KEY",
  "security/auth-secret": "AUTH_SECRET",

  // App
  "app/node-env": "NODE_ENV",
  "app/port": "PORT",
  "app/log-level": "LOG_LEVEL",
};

// ---------------------------------------------------------------------------
// SSM Client (lazy singleton)
// ---------------------------------------------------------------------------

let _client: SSMClient | null = null;

function getClient(): SSMClient {
  if (!_client) {
    _client = new SSMClient({ region: AWS_REGION });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Core loader
// ---------------------------------------------------------------------------

/**
 * Fetches all SSM parameters under the configured path prefix,
 * maps them to env var names, and sets them on `process.env`.
 *
 * Handles pagination automatically (SSM returns max 10 params per page).
 *
 * Parameters that already exist in `process.env` are **not** overwritten,
 * allowing local overrides (e.g. for development).
 *
 * @param overwrite - If `true`, SSM values will overwrite existing env vars.
 *                    Defaults to `false`.
 */
export async function loadConfig(overwrite = false): Promise<void> {
  const client = getClient();
  const allParams: Parameter[] = [];
  let nextToken: string | undefined;

  // --- Paginated fetch ---------------------------------------------------
  do {
    const command = new GetParametersByPathCommand({
      Path: SSM_PATH_PREFIX,
      Recursive: true,
      WithDecryption: true,
      NextToken: nextToken,
    });

    const response = await client.send(command);

    if (response.Parameters) {
      allParams.push(...response.Parameters);
    }

    nextToken = response.NextToken;
  } while (nextToken);

  if (allParams.length === 0) {
    console.warn(
      `⚠️  Keine SSM-Parameter unter "${SSM_PATH_PREFIX}" gefunden. ` +
        "Stelle sicher, dass die IAM-Rolle korrekt konfiguriert ist.",
    );
    return;
  }

  // --- Map & inject ------------------------------------------------------
  let injected = 0;
  let skipped = 0;
  const unmapped: string[] = [];

  for (const param of allParams) {
    if (!param.Name || param.Value === undefined) continue;

    const relativePath = param.Name.replace(SSM_PATH_PREFIX, "");
    const envKey = PATH_TO_ENV[relativePath];

    if (!envKey) {
      // Fallback: auto-derive key  (path → UPPER_SNAKE_CASE)
      const derived = relativePath.replace(/\//g, "_").replace(/-/g, "_").toUpperCase();
      if (!overwrite && process.env[derived] !== undefined) {
        skipped++;
      } else {
        process.env[derived] = param.Value;
        injected++;
      }
      unmapped.push(`${param.Name} → ${derived} (auto)`);
      continue;
    }

    if (!overwrite && process.env[envKey] !== undefined) {
      skipped++;
      continue;
    }

    process.env[envKey] = param.Value;
    injected++;
  }

  console.log(
    `✅ AWS SSM Parameter geladen: ${injected} injected, ${skipped} skipped (already set).`,
  );

  if (unmapped.length > 0) {
    console.warn(
      `⚠️  ${unmapped.length} Parameter ohne explizites Mapping (auto-derived):`,
      unmapped,
    );
  }
}

// ---------------------------------------------------------------------------
// Utility: check if SSM loading is enabled
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the app should load config from SSM.
 *
 * SSM loading is enabled when:
 * - `SSM_CONFIG_ENABLED` env var is explicitly set to `"true"`, OR
 * - the app is running in a production-like environment AND
 *   `SSM_CONFIG_ENABLED` is not explicitly `"false"`.
 *
 * This allows local development to keep using `.env` files without
 * requiring AWS credentials.
 */
export function isSsmEnabled(): boolean {
  const explicit = process.env.SSM_CONFIG_ENABLED;
  if (explicit === "true") return true;
  if (explicit === "false") return false;

  // Auto-enable in production / staging when not explicitly disabled
  const env = process.env.NODE_ENV;
  return env === "production" || env === "staging";
}
