import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { user as authUser } from "@/src/db/schemas/auth";

export interface UpsertAuthUserData {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Upsert auth user - handles insert or update with conflict resolution
 * This eliminates duplicate code blocks across auth server functions
 */
export async function upsertAuthUser(userData: UpsertAuthUserData): Promise<void> {
  const now = new Date();
  const dataToInsert = {
    id: userData.id,
    email: userData.email,
    name: userData.name,
    emailVerified: userData.emailVerified,
    createdAt: userData.createdAt || now,
    updatedAt: userData.updatedAt || now,
  };

  try {
    await db.insert(authUser).values(dataToInsert);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      // Unique violation - update existing record
      await db
        .update(authUser)
        .set({
          email: dataToInsert.email,
          name: dataToInsert.name,
          emailVerified: dataToInsert.emailVerified,
          updatedAt: now,
        })
        .where(eq(authUser.id, dataToInsert.id));
    } else {
      throw error;
    }
  }
}

/**
 * Check if auth user exists
 */
export async function authUserExists(userId: string): Promise<boolean> {
  const existing = await db.select().from(authUser).where(eq(authUser.id, userId)).limit(1);

  return existing.length > 0;
}
