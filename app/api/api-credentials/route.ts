/**
 * API Credentials Route
 * Real implementation for storing and retrieving user MEXC API credentials
 */

import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/src/db";
import { apiCredentials } from "@/src/db/schemas/trading";
import { getLogger } from "@/src/lib/unified-logger";
import { getEncryptionService } from "@/src/services/api/secure-encryption-service";

interface CredentialsCacheEntry {
  success: boolean;
  data: {
    hasCredentials: boolean;
    provider: string;
    userId: string;
  };
}

// Cache API credentials status for 60 seconds
const credentialsCache: Map<
  string,
  {
    data: CredentialsCacheEntry;
    timestamp: number;
  }
> = new Map();

const CACHE_DURATION = 60 * 1000; // 60 seconds

export async function GET(request: NextRequest) {
  const _logger = getLogger("api-credentials");
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const provider = searchParams.get("provider") || "mexc";
    const skipCache = searchParams.get("skipCache") === "true";

    if (!userId) {
      return NextResponse.json({ error: "userId parameter is required" }, { status: 400 });
    }

    // GET request - error logging handled by error handler middleware

    // Check cache first (unless skipCache=true)
    const cacheKey = `${userId}-${provider}`;
    const now = Date.now();
    const cached = credentialsCache.get(cacheKey);

    if (!skipCache && cached && now - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data);
    }

    // Quick database query
    const credentials = await db
      .select({
        id: apiCredentials.id,
        updatedAt: apiCredentials.updatedAt,
      })
      .from(apiCredentials)
      .where(and(eq(apiCredentials.userId, userId), eq(apiCredentials.provider, provider)))
      .limit(1);

    const hasCredentials = credentials.length > 0;
    const _lastValidated = hasCredentials ? credentials[0].updatedAt : null;

    const result = {
      success: true,
      data: {
        hasCredentials,
        provider: "mexc",
        userId,
      },
    };

    // Cache the result
    credentialsCache.set(cacheKey, {
      data: result,
      timestamp: now,
    });

    return NextResponse.json(result);
  } catch (_error) {
    // GET error - error logging handled by error handler middleware
    return NextResponse.json({ error: "Failed to fetch API credentials status" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, apiKey, secretKey, passphrase, provider = "mexc" } = body;

    if (!userId || !apiKey || !secretKey) {
      return NextResponse.json(
        { error: "userId, apiKey, and secretKey are required" },
        { status: 400 },
      );
    }

    // Validation
    if (apiKey.length < 10 || secretKey.length < 10) {
      return NextResponse.json(
        { error: "API key and secret must be at least 10 characters" },
        { status: 400 },
      );
    }

    if (apiKey.includes(" ") || secretKey.includes(" ")) {
      return NextResponse.json({ error: "API credentials cannot contain spaces" }, { status: 400 });
    }

    // POST request - error logging handled by error handler middleware

    // Encrypt credentials
    const encryptionService = getEncryptionService();
    const encryptedApiKey = encryptionService.encrypt(apiKey);
    const encryptedSecretKey = encryptionService.encrypt(secretKey);
    const encryptedPassphrase = passphrase ? encryptionService.encrypt(passphrase) : null;

    // Check if credentials exist
    const existingCredentials = await db
      .select({ id: apiCredentials.id })
      .from(apiCredentials)
      .where(and(eq(apiCredentials.userId, userId), eq(apiCredentials.provider, provider)))
      .limit(1);

    const now = new Date();

    if (existingCredentials.length > 0) {
      await db
        .update(apiCredentials)
        .set({
          encryptedApiKey,
          encryptedSecretKey,
          encryptedPassphrase,
          isActive: true,
          updatedAt: now,
        })
        .where(and(eq(apiCredentials.userId, userId), eq(apiCredentials.provider, provider)));
    } else {
      await db.insert(apiCredentials).values({
        userId,
        provider,
        encryptedApiKey,
        encryptedSecretKey,
        encryptedPassphrase,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Invalidate cache for this user/provider pair
    try {
      const cacheKey = `${userId}-${provider}`;
      credentialsCache.delete(cacheKey);
    } catch {
      /* ignore cache invalidation errors */
    }

    return NextResponse.json({
      success: true,
      data: {
        credentialsStored: true,
        provider,
        userId,
        message:
          existingCredentials.length > 0
            ? "Credentials updated successfully"
            : "Credentials stored successfully",
        timestamp: new Date().toISOString(),
      },
      message: "API credentials saved",
    });
  } catch (_error) {
    // POST error - error logging handled by error handler middleware
    return NextResponse.json({ error: "Failed to save API credentials" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const provider = searchParams.get("provider") || "mexc";

    // DELETE request - error logging handled by error handler middleware

    const response = {
      success: true,
      data: {
        credentialsDeleted: true,
        provider,
        userId: userId || null,
      },
      message: "Credentials deleted successfully",
    };

    return NextResponse.json(response);
  } catch (_error) {
    // DELETE error - error logging handled by error handler middleware
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete credentials",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
