import { and, eq } from "drizzle-orm";
import { apiCredentials, db } from "@/src/db";
import { getEncryptionService } from "./secure-encryption-service";

export interface DecryptedCredentials {
  apiKey: string;
  secretKey: string;
  passphrase?: string;
  provider: string;
  isActive: boolean;
  lastUsed?: Date;
}

/**
 * Get decrypted API credentials for a specific user and provider
 */
export async function getUserCredentials(
  userId: string,
  provider = "mexc",
): Promise<DecryptedCredentials | null> {
  try {
    // Query the database for user credentials
    const result = await db
      .select()
      .from(apiCredentials)
      .where(and(eq(apiCredentials.userId, userId), eq(apiCredentials.provider, provider)))
      .limit(1);

    if (result.length === 0) {
      // No credentials found - this is expected behavior, not an error
      return null;
    }

    const creds = result[0];

    if (!creds.isActive) {
      // Credentials found but inactive - this is expected behavior
      return null;
    }

    // Check if encryption service is available
    let encryptionService;
    try {
      encryptionService = getEncryptionService();
    } catch (encryptionError) {
      // Encryption service error - will be thrown and handled by caller
      throw new Error(
        "Encryption service unavailable - check ENCRYPTION_MASTER_KEY environment variable",
      );
    }

    // Decrypt the credentials
    let apiKey: string;
    let secretKey: string;
    let passphrase: string | undefined;

    try {
      apiKey = encryptionService.decrypt(creds.encryptedApiKey);
      secretKey = encryptionService.decrypt(creds.encryptedSecretKey);

      if (creds.encryptedPassphrase) {
        passphrase = encryptionService.decrypt(creds.encryptedPassphrase);
      }
    } catch (decryptError) {
      // Failed to decrypt credentials - will throw error below
      throw new Error("Failed to decrypt API credentials - encryption key may be incorrect");
    }

    // Update last used timestamp
    await db
      .update(apiCredentials)
      .set({ lastUsed: new Date() })
      .where(eq(apiCredentials.id, creds.id));

    return {
      apiKey,
      secretKey,
      passphrase,
      provider: creds.provider,
      isActive: creds.isActive,
      lastUsed: creds.lastUsed || undefined,
    };
  } catch (error) {
    // Error getting credentials - rethrow to be handled by caller
    throw error;
  }
}

/**
 * Check if user has active credentials for a provider
 */
export async function hasUserCredentials(userId: string, provider = "mexc"): Promise<boolean> {
  try {
    const result = await db
      .select({ id: apiCredentials.id })
      .from(apiCredentials)
      .where(
        and(
          eq(apiCredentials.userId, userId),
          eq(apiCredentials.provider, provider),
          eq(apiCredentials.isActive, true),
        ),
      )
      .limit(1);

    return result.length > 0;
  } catch (error) {
    // Error checking credentials - will be thrown and handled by caller
    return false;
  }
}
