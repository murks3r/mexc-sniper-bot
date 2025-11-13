import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, userPreferences } from "@/src/db";
import type { NewUserPreferences } from "@/src/db/schemas/auth";
import { user as authUser } from "@/src/db/schemas/auth";
import { withApiErrorHandling, withDatabaseErrorHandling } from "@/src/lib/api-middleware";
import {
  apiResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  HTTP_STATUS,
} from "@/src/lib/api-response";
import { createSupabaseAdminClient, requireAuth } from "@/src/lib/supabase-auth";

// GET /api/user-preferences?userId=xxx
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  // Derive user from session; fallback to explicit param only if provided
  const user = await requireAuth();
  const { searchParams } = new URL(request.url);
  const paramUserId = searchParams.get("userId");
  const userId =
    paramUserId && typeof paramUserId === "string" && paramUserId.trim().length > 0
      ? paramUserId.trim()
      : user.id;

  const result = await withDatabaseErrorHandling(async () => {
    return await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
  }, "fetch user preferences");

  if (result.length === 0) {
    return apiResponse(
      createSuccessResponse(null, {
        message: "No preferences found for user",
      }),
    );
  }

  const prefs = result[0];

  // Safe pattern parsing with fallbacks
  let patternParts: number[] = [2, 2, 4]; // Default fallback
  try {
    if (prefs.readyStatePattern && typeof prefs.readyStatePattern === "string") {
      const parts = prefs.readyStatePattern.split(",").map(Number);
      if (parts.length >= 3 && parts.every((p: number) => !Number.isNaN(p) && p > 0)) {
        patternParts = parts;
      }
    }
  } catch (_error) {
    // Failed to parse readyStatePattern, using defaults
  }

  // Safe JSON parsing helper
  const safeJsonParse = <T>(jsonString: string | null | undefined, fallback: T): T => {
    if (!jsonString || typeof jsonString !== "string") return fallback;
    try {
      return JSON.parse(jsonString);
    } catch (_error) {
      // Failed to parse JSON field
      return fallback;
    }
  };

  const response = {
    userId: prefs.userId,
    defaultBuyAmountUsdt: prefs.defaultBuyAmountUsdt,
    maxConcurrentSnipes: prefs.maxConcurrentSnipes,
    takeProfitLevels: {
      level1: prefs.takeProfitLevel1,
      level2: prefs.takeProfitLevel2,
      level3: prefs.takeProfitLevel3,
      level4: prefs.takeProfitLevel4,
      custom: prefs.takeProfitCustom || undefined,
    },
    takeProfitSellQuantities: {
      level1: prefs.sellQuantityLevel1 || 25.0,
      level2: prefs.sellQuantityLevel2 || 25.0,
      level3: prefs.sellQuantityLevel3 || 25.0,
      level4: prefs.sellQuantityLevel4 || 25.0,
      custom: prefs.sellQuantityCustom || 100.0,
    },
    takeProfitCustom: prefs.takeProfitCustom,
    defaultTakeProfitLevel: prefs.defaultTakeProfitLevel,
    stopLossPercent: prefs.stopLossPercent,
    riskTolerance: prefs.riskTolerance as "low" | "medium" | "high",
    readyStatePattern: [patternParts[0] || 2, patternParts[1] || 2, patternParts[2] || 4] as [
      number,
      number,
      number,
    ],
    targetAdvanceHours: prefs.targetAdvanceHours,
    calendarPollIntervalSeconds: prefs.calendarPollIntervalSeconds,
    symbolsPollIntervalSeconds: prefs.symbolsPollIntervalSeconds,
    // Enhanced Take Profit Strategy Settings
    takeProfitStrategy: prefs.takeProfitStrategy || "balanced",
    takeProfitLevelsConfig: safeJsonParse(prefs.takeProfitLevelsConfig, null),
    // Legacy Exit Strategy Settings (for backward compatibility)
    selectedExitStrategy: prefs.selectedExitStrategy || "balanced",
    customExitStrategy: safeJsonParse(prefs.customExitStrategy, null),
    autoBuyEnabled: prefs.autoBuyEnabled ?? true,
    autoSellEnabled: prefs.autoSellEnabled ?? true,
    autoSnipeEnabled: prefs.autoSnipeEnabled ?? true,
  };

  return apiResponse(createSuccessResponse(response));
});

// POST /api/user-preferences
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth();
  const body = await request.json();
  const { userId, ...data } = body;

  const validatedUserId =
    userId && typeof userId === "string" && userId.trim().length > 0 ? userId.trim() : user.id;

  const updateData: Partial<NewUserPreferences> = {
    userId: validatedUserId,
    updatedAt: new Date(),
  };

  // Map the structured data to database fields
  if (data.defaultBuyAmountUsdt !== undefined) {
    updateData.defaultBuyAmountUsdt = data.defaultBuyAmountUsdt;
  }
  if (data.maxConcurrentSnipes !== undefined) {
    updateData.maxConcurrentSnipes = data.maxConcurrentSnipes;
  }

  // Handle take profit levels - support both structured and direct field access
  if (data.takeProfitLevels) {
    updateData.takeProfitLevel1 = data.takeProfitLevels.level1;
    updateData.takeProfitLevel2 = data.takeProfitLevels.level2;
    updateData.takeProfitLevel3 = data.takeProfitLevels.level3;
    updateData.takeProfitLevel4 = data.takeProfitLevels.level4;
    updateData.takeProfitCustom = data.takeProfitLevels.custom;
  }

  // Handle take profit sell quantities
  if (data.takeProfitSellQuantities) {
    updateData.sellQuantityLevel1 = data.takeProfitSellQuantities.level1;
    updateData.sellQuantityLevel2 = data.takeProfitSellQuantities.level2;
    updateData.sellQuantityLevel3 = data.takeProfitSellQuantities.level3;
    updateData.sellQuantityLevel4 = data.takeProfitSellQuantities.level4;
    updateData.sellQuantityCustom = data.takeProfitSellQuantities.custom;
  }

  // Support direct field access for individual take profit levels with validation
  if (data.takeProfitLevel1 !== undefined) {
    if (data.takeProfitLevel1 < 0) {
      return apiResponse(
        createValidationErrorResponse("takeProfitLevel1", "Take profit level 1 cannot be negative"),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    updateData.takeProfitLevel1 = data.takeProfitLevel1;
  }
  if (data.takeProfitLevel2 !== undefined) {
    if (data.takeProfitLevel2 < 0) {
      return apiResponse(
        createValidationErrorResponse("takeProfitLevel2", "Take profit level 2 cannot be negative"),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    updateData.takeProfitLevel2 = data.takeProfitLevel2;
  }
  if (data.takeProfitLevel3 !== undefined) {
    if (data.takeProfitLevel3 < 0) {
      return apiResponse(
        createValidationErrorResponse("takeProfitLevel3", "Take profit level 3 cannot be negative"),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    updateData.takeProfitLevel3 = data.takeProfitLevel3;
  }
  if (data.takeProfitLevel4 !== undefined) {
    if (data.takeProfitLevel4 < 0) {
      return apiResponse(
        createValidationErrorResponse("takeProfitLevel4", "Take profit level 4 cannot be negative"),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    updateData.takeProfitLevel4 = data.takeProfitLevel4;
  }
  if (data.takeProfitCustom !== undefined) {
    if (data.takeProfitCustom < 0) {
      return apiResponse(
        createValidationErrorResponse(
          "takeProfitCustom",
          "Custom take profit level cannot be negative",
        ),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    updateData.takeProfitCustom = data.takeProfitCustom;
  }

  if (data.defaultTakeProfitLevel !== undefined) {
    updateData.defaultTakeProfitLevel = data.defaultTakeProfitLevel;
  }
  if (data.stopLossPercent !== undefined) {
    updateData.stopLossPercent = data.stopLossPercent;
  }
  if (data.riskTolerance !== undefined) {
    updateData.riskTolerance = data.riskTolerance;
  }
  if (data.readyStatePattern !== undefined) {
    updateData.readyStatePattern = data.readyStatePattern.join(",");
  }
  if (data.targetAdvanceHours !== undefined) {
    updateData.targetAdvanceHours = data.targetAdvanceHours;
  }
  if (data.calendarPollIntervalSeconds !== undefined) {
    updateData.calendarPollIntervalSeconds = data.calendarPollIntervalSeconds;
  }
  if (data.symbolsPollIntervalSeconds !== undefined) {
    updateData.symbolsPollIntervalSeconds = data.symbolsPollIntervalSeconds;
  }

  // Safe JSON stringification helper
  const safeJsonStringify = (obj: unknown): string | null => {
    if (obj === undefined || obj === null) return null;
    try {
      return JSON.stringify(obj);
    } catch (_error) {
      // Failed to stringify JSON object
      return null;
    }
  };

  // Enhanced Take Profit Strategy Settings
  if (data.takeProfitStrategy !== undefined) {
    updateData.takeProfitStrategy = data.takeProfitStrategy;
  }
  if (data.takeProfitLevelsConfig !== undefined) {
    const stringified = safeJsonStringify(data.takeProfitLevelsConfig);
    if (stringified !== null) {
      updateData.takeProfitLevelsConfig = stringified;
    }
  }

  // Legacy Exit Strategy Settings (for backward compatibility)
  if (data.selectedExitStrategy !== undefined) {
    updateData.selectedExitStrategy = data.selectedExitStrategy;
  }
  if (data.customExitStrategy !== undefined) {
    const stringified = safeJsonStringify(data.customExitStrategy);
    if (stringified !== null) {
      updateData.customExitStrategy = stringified;
    }
  }
  if (data.autoBuyEnabled !== undefined) {
    updateData.autoBuyEnabled = data.autoBuyEnabled;
  }
  if (data.autoSellEnabled !== undefined) {
    updateData.autoSellEnabled = data.autoSellEnabled;
  }
  if (data.autoSnipeEnabled !== undefined) {
    updateData.autoSnipeEnabled = data.autoSnipeEnabled;
  }

  // Try to update first
  const result = await withDatabaseErrorHandling(async () => {
    // Remove Date fields that will be handled by database defaults
    const { createdAt, ...updateDataWithoutDates } = updateData;
    return await db
      .update(userPreferences)
      .set(updateDataWithoutDates as Partial<typeof userPreferences.$inferInsert>)
      .where(eq(userPreferences.userId, validatedUserId))
      .returning();
  }, "update user preferences");

  if (result.length === 0) {
    // Check if user exists before creating preferences
    const existingUser = await withDatabaseErrorHandling(async () => {
      return await db.select().from(authUser).where(eq(authUser.id, validatedUserId)).limit(1);
    }, "check user existence");

    if (existingUser.length === 0) {
      // Check if this is a test environment and user ID looks like a test user
      const isTestEnvironment =
        process.env.NODE_ENV === "test" ||
        process.env.PLAYWRIGHT_TEST === "true" ||
        validatedUserId.includes("test") ||
        validatedUserId.startsWith("test-");

      if (isTestEnvironment) {
        // Auto-create test user

        const testUserData = {
          id: validatedUserId,
          email: `${validatedUserId}@test.example.com`,
          name: `Test User ${validatedUserId}`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await withDatabaseErrorHandling(async () => {
          const result = await db.insert(authUser).values(testUserData).returning();
          return result;
        }, "create test user");
      } else {
        // Production environment - auto-create real authenticated user

        const supabase = createSupabaseAdminClient();
        const { data: userData, error } = await supabase.auth.admin.getUserById(validatedUserId);

        if (error) {
          // Failed to fetch user data - error logging handled by error handler middleware
          return apiResponse(
            createValidationErrorResponse(
              "userId",
              `Failed to fetch user data for ${validatedUserId}: ${error.message}`,
            ),
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
          );
        }

        if (!userData?.user) {
          // User not found - error logging handled by error handler middleware
          return apiResponse(
            createValidationErrorResponse(
              "userId",
              `User with ID ${validatedUserId} not found in Supabase auth.`,
            ),
            HTTP_STATUS.NOT_FOUND,
          );
        }

        const realUserData = {
          id: userData.user.id,
          email: userData.user.email || `user-${validatedUserId}@app.com`,
          name:
            userData.user.user_metadata?.name ||
            userData.user.user_metadata?.full_name ||
            `User ${validatedUserId.substring(0, 8)}`,
          emailVerified: !!userData.user.email_confirmed_at,
          createdAt: new Date(userData.user.created_at),
          updatedAt: new Date(userData.user.updated_at),
        };

        try {
          await withDatabaseErrorHandling(async () => {
            const result = await db.insert(authUser).values(realUserData).returning();
            return result;
          }, "create authenticated user");
        } catch (userCreationError) {
          // Failed to create authenticated user - error logging handled by error handler middleware
          // Return detailed error for debugging
          return apiResponse(
            createValidationErrorResponse(
              "userId",
              `Failed to create user ${validatedUserId}: ${userCreationError instanceof Error ? userCreationError.message : "Unknown error"}`,
            ),
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
          );
        }
      }
    }

    // If no rows were updated, create a new record
    const newPrefs: NewUserPreferences = {
      userId: validatedUserId,
      defaultBuyAmountUsdt: data.defaultBuyAmountUsdt || 100.0,
      maxConcurrentSnipes: data.maxConcurrentSnipes || 3,
      takeProfitLevel1: data.takeProfitLevel1 || data.takeProfitLevels?.level1 || 5.0,
      takeProfitLevel2: data.takeProfitLevel2 || data.takeProfitLevels?.level2 || 10.0,
      takeProfitLevel3: data.takeProfitLevel3 || data.takeProfitLevels?.level3 || 15.0,
      takeProfitLevel4: data.takeProfitLevel4 || data.takeProfitLevels?.level4 || 25.0,
      takeProfitCustom: data.takeProfitCustom || data.takeProfitLevels?.custom,
      defaultTakeProfitLevel: data.defaultTakeProfitLevel || 2,
      stopLossPercent: data.stopLossPercent || 5.0,
      riskTolerance: data.riskTolerance || "medium",
      readyStatePattern: data.readyStatePattern?.join(",") || "2,2,4",
      targetAdvanceHours: data.targetAdvanceHours || 3.5,
      calendarPollIntervalSeconds: data.calendarPollIntervalSeconds || 300,
      symbolsPollIntervalSeconds: data.symbolsPollIntervalSeconds || 30,
      // Exit Strategy Settings with defaults
      selectedExitStrategy: data.selectedExitStrategy || "balanced",
      customExitStrategy: data.customExitStrategy
        ? safeJsonStringify(data.customExitStrategy)
        : null,
      autoBuyEnabled: data.autoBuyEnabled ?? true,
      autoSellEnabled: data.autoSellEnabled ?? true,
      autoSnipeEnabled: data.autoSnipeEnabled ?? true,
      ...updateData,
    };

    await withDatabaseErrorHandling(async () => {
      // Remove Date fields that will be handled by database defaults
      const { createdAt, updatedAt, ...newPrefsWithoutDates } = newPrefs;
      return await db
        .insert(userPreferences)
        .values(newPrefsWithoutDates as typeof userPreferences.$inferInsert);
    }, "insert user preferences");
  }

  return apiResponse(
    createSuccessResponse(data, {
      message: "User preferences updated successfully",
    }),
  );
});
