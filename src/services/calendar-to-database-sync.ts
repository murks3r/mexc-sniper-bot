/**
 * Calendar to Database Sync Service
 *
 * Automatically syncs qualifying MEXC calendar launches to database as snipe targets.
 * This creates a single source of truth and solves rate limiting issues.
 */

import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { snipeTargets, user } from "@/src/db/schema";
import { resolveRiskParams } from "@/src/lib/risk-defaults";
import { createSimpleLogger } from "@/src/lib/unified-logger";
import {
  isSymbolApiTradable,
  qualifyAndCacheSymbol,
} from "@/src/services/symbol-qualification.service";

interface CalendarEntry {
  vcoinId: string;
  vcoinNameFull: string;
  firstOpenTime: number; // Timestamp number
  symbol?: string;
}

interface SyncResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export class CalendarToDatabaseSyncService {
  private static instance: CalendarToDatabaseSyncService | null = null;
  private isRunning = false;
  private lastSyncTime: Date | null = null;
  private logger = createSimpleLogger("CalendarSync");

  private constructor() {}

  static getInstance(): CalendarToDatabaseSyncService {
    if (!CalendarToDatabaseSyncService.instance) {
      CalendarToDatabaseSyncService.instance = new CalendarToDatabaseSyncService();
    }
    return CalendarToDatabaseSyncService.instance;
  }

  /**
   * Ensure system user exists for system-level targets
   */
  private async ensureSystemUser(): Promise<void> {
    try {
      const existingUser = await db.select().from(user).where(eq(user.id, "system")).limit(1);

      if (existingUser.length === 0) {
        await db.insert(user).values({
          id: "system",
          email: "system@mexc-sniper-bot.local",
          name: "System User",
          emailVerified: true,
        });
        this.logger.info("✅ Created system user for calendar sync");
      }
    } catch (error) {
      this.logger.error(
        "Failed to ensure system user exists",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error(
        `System user creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Sync qualifying calendar launches to database
   */
  async syncCalendarToDatabase(
    userId = "system",
    options: {
      timeWindowHours?: number;
      forceSync?: boolean;
      dryRun?: boolean;
    } = {},
  ): Promise<SyncResult> {
    const { timeWindowHours = 24, forceSync = false, dryRun = false } = options;

    if (this.isRunning && !forceSync) {
      return {
        success: false,
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: ["Sync already running"],
      };
    }

    this.isRunning = true;
    const result: SyncResult = {
      success: true,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    try {
      this.logger.info("🔄 Starting calendar-to-database sync", {
        userId,
        timeWindowHours,
        dryRun,
      });

      // 0. Ensure system user exists (for system-level targets)
      if (userId === "system" && !dryRun) {
        await this.ensureSystemUser();
      }

      // 1. Fetch calendar data
      const calendarEntries = await this.fetchCalendarData();
      if (!calendarEntries || calendarEntries.length === 0) {
        throw new Error("No calendar data available");
      }

      // 2. Filter qualifying launches (within time window)
      const qualifyingLaunches = this.filterQualifyingLaunches(calendarEntries, timeWindowHours);
      result.processed = qualifyingLaunches.length;

      this.logger.info("📅 Found calendar launches", {
        total: calendarEntries.length,
        qualifying: qualifyingLaunches.length,
      });

      // 3. Process each qualifying launch
      for (const launch of qualifyingLaunches) {
        try {
          await this.processLaunch(launch, userId, dryRun, result);
        } catch (error) {
          const errorMsg = `Failed to process launch ${launch.vcoinId}: ${error instanceof Error ? error.message : "Unknown error"}`;
          result.errors.push(errorMsg);
          this.logger.error(errorMsg);
        }
      }

      // 4. Cleanup old targets (older than time window)
      if (!dryRun) {
        await this.cleanupOldTargets(timeWindowHours, result);
      }

      this.lastSyncTime = new Date();

      this.logger.info("✅ Sync completed", {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
      });
    } catch (error) {
      result.success = false;
      const errorMsg = error instanceof Error ? error.message : "Unknown sync error";
      result.errors.push(errorMsg);
      this.logger.error("❌ Calendar sync failed", { error: errorMsg });
    } finally {
      this.isRunning = false;
    }

    try {
      const [{ count }] = (await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(snipeTargets)
        .where(eq(snipeTargets.userId, userId))) as { count: number }[];
      this.logger.info("Snipe targets summary after sync", {
        userId,
        totalTargetsForUser: Number(count) || 0,
      });
    } catch (summaryError) {
      this.logger.warn("Failed to fetch snipe targets summary after sync", {
        userId,
        error: summaryError instanceof Error ? summaryError.message : "Unknown summary error",
      });
    }

    return result;
  }

  /**
   * Fetch calendar data from MEXC API
   */
  private async fetchCalendarData(): Promise<CalendarEntry[]> {
    try {
      const response = await fetch("http://localhost:3008/api/mexc/calendar");
      if (!response.ok) {
        throw new Error(`Calendar API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(`Calendar API failed: ${result.error}`);
      }

      return result.data || [];
    } catch (error) {
      this.logger.error(
        "Failed to fetch calendar data",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Filter calendar entries for qualifying launches
   * Ensures tomorrow's listings are always included (minimum 48 hour window)
   */
  private filterQualifyingLaunches(
    entries: CalendarEntry[],
    timeWindowHours: number,
  ): CalendarEntry[] {
    const now = Date.now();
    // Ensure at least 48 hours to cover tomorrow's listings
    const minWindowHours = Math.max(timeWindowHours, 48);
    const timeWindow = minWindowHours * 60 * 60 * 1000; // Convert to milliseconds

    return entries.filter((entry) => {
      try {
        // Parse launch time (firstOpenTime is already a timestamp in milliseconds)
        const launchTime = entry.firstOpenTime;

        // Include launches that are:
        // 1. In the future (not already launched)
        // 2. Within the specified time window (minimum 48h to cover tomorrow)
        const isUpcoming = launchTime > now;
        const isWithinWindow = launchTime < now + timeWindow;

        // Also check if it's specifically tomorrow's listing (always include)
        const listingDate = new Date(launchTime);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        listingDate.setHours(0, 0, 0, 0);
        const isTomorrow = listingDate.getTime() === tomorrow.getTime();

        return (
          ((isUpcoming && isWithinWindow) || isTomorrow) && entry.vcoinId && entry.vcoinNameFull
        );
      } catch (_error) {
        this.logger.warn(`Invalid launch time for ${entry.vcoinId}`, {
          firstOpenTime: entry.firstOpenTime,
        });
        return false;
      }
    });
  }

  /**
   * Process individual launch entry
   *
   * SLICE 1.2 INTEGRATION: Qualification Step Added
   * Before creating/updating a target, we now verify the symbol is API-tradable.
   */
  private async processLaunch(
    launch: CalendarEntry,
    userId: string,
    dryRun: boolean,
    result: SyncResult,
  ): Promise<void> {
    const symbolName = launch.symbol || `${launch.vcoinNameFull}USDT`;

    // SLICE 1.2: Qualify the symbol FIRST (Assessment Zone Blocking)
    // This is THE CRITICAL FIX - prevents error 10007
    this.logger.debug(`🔍 Qualifying symbol ${symbolName} before processing`, {
      vcoinId: launch.vcoinId,
    });

    const qualificationResult = await qualifyAndCacheSymbol(symbolName);

    if (!qualificationResult.isApiTradable) {
      // Symbol is in Assessment Zone or not API-tradable
      this.logger.warn(`⛔ Symbol ${symbolName} is NOT API-tradable - skipping`, {
        vcoinId: launch.vcoinId,
        reason: qualificationResult.reason,
      });
      result.skipped++;
      return; // DO NOT create a snipe target for this symbol
    }

    this.logger.info(`✅ Symbol ${symbolName} is API-tradable - proceeding`, {
      vcoinId: launch.vcoinId,
    });

    // Check if target already exists
    const existingTarget = await db
      .select()
      .from(snipeTargets)
      .where(and(eq(snipeTargets.vcoinId, launch.vcoinId), eq(snipeTargets.userId, userId)))
      .limit(1);

    if (existingTarget.length > 0) {
      // Update existing target
      if (!dryRun) {
        await db
          .update(snipeTargets)
          .set({
            symbolName,
            targetExecutionTime: new Date(launch.firstOpenTime),
            status: "ready", // Set to "ready" so targets are immediately eligible for execution
            confidenceScore: 85.0, // High confidence for calendar launches
            riskLevel: "medium",
            updatedAt: new Date(),
          })
          .where(eq(snipeTargets.id, existingTarget[0].id));
      }
      result.updated++;
      this.logger.debug("Updated target", {
        vcoinNameFull: launch.vcoinNameFull,
        vcoinId: launch.vcoinId,
      });
    } else {
      // Create new target
      if (!dryRun) {
        this.logger.debug("Inserting target", {
          vcoinId: launch.vcoinId,
          symbolName,
          userId,
        });
        try {
          // Resolve risk parameters using centralized defaults
          // No explicit values provided, so will use user preferences or global defaults
          const riskParams = await resolveRiskParams({}, userId);

          const insertResult = await db.insert(snipeTargets).values({
            userId,
            vcoinId: launch.vcoinId,
            symbolName,
            positionSizeUsdt: 1, // Minimal default - dynamic sizing will determine actual amount at execution time
            stopLossPercent: riskParams.stopLossPercent,
            takeProfitLevel: riskParams.takeProfitLevel,
            takeProfitCustom: riskParams.takeProfitCustom,
            targetExecutionTime: new Date(launch.firstOpenTime),
            status: "ready", // Set status to "ready" so targets are immediately eligible for execution
            confidenceScore: 85.0, // High confidence for calendar launches
            riskLevel: "medium",
          });
          this.logger.debug("Target inserted successfully", {
            insertResult,
            riskParams,
          });
        } catch (insertError) {
          this.logger.error(
            `Database insert failed for ${launch.vcoinId}`,
            {},
            insertError instanceof Error ? insertError : new Error(String(insertError)),
          );
          throw insertError;
        }
      }
      result.created++;
      this.logger.debug("Created target", {
        vcoinNameFull: launch.vcoinNameFull,
        vcoinId: launch.vcoinId,
      });
    }
  }

  /**
   * Cleanup old targets that are past the time window
   * Transitions "active" targets to "ready" when execution time passes
   * Marks "ready" targets as "failed" if they remain unexecuted past a grace period
   */
  private async cleanupOldTargets(timeWindowHours: number, result: SyncResult): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
      const now = new Date();

      // Delete old targets with status "pending"
      const _deletedResult = await db
        .delete(snipeTargets)
        .where(
          and(lt(snipeTargets.targetExecutionTime, cutoffTime), eq(snipeTargets.status, "pending")),
        );

      // Transition "active" targets to "ready" when their execution time arrives
      // This allows them to be picked up by the auto-sniping service
      const transitionToReady = await db
        .update(snipeTargets)
        .set({
          status: "ready",
          updatedAt: new Date(),
        })
        .where(and(eq(snipeTargets.status, "active"), lt(snipeTargets.targetExecutionTime, now)))
        .returning({ id: snipeTargets.id, symbolName: snipeTargets.symbolName });

      if (transitionToReady.length > 0) {
        this.logger.info("Transitioned active targets to ready for execution", {
          count: transitionToReady.length,
          targets: transitionToReady.map((t) => `${t.symbolName} (id: ${t.id})`),
        });
        result.updated += transitionToReady.length;
      }

      // Mark "ready" targets as "failed" if they remain unexecuted 2 hours past execution time
      // These are targets that were not executed by the auto-sniping service
      const staleReadyTargets = await db
        .update(snipeTargets)
        .set({
          status: "failed",
          errorMessage: "Target execution time passed without execution by auto-sniping service",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(snipeTargets.status, "ready"),
            lt(
              snipeTargets.targetExecutionTime,
              new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours grace period
            ),
          ),
        )
        .returning({ id: snipeTargets.id, symbolName: snipeTargets.symbolName });

      if (staleReadyTargets.length > 0) {
        this.logger.warn("Marked stale ready targets as failed", {
          count: staleReadyTargets.length,
          targets: staleReadyTargets.map((t) => `${t.symbolName} (id: ${t.id})`),
        });
      }

      this.logger.info("Cleaned up old targets", {
        cutoff: cutoffTime.toISOString(),
        transitionedToReady: transitionToReady.length,
        markedAsFailed: staleReadyTargets.length,
      });
    } catch (error) {
      this.logger.error(
        "Failed to cleanup old targets",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      result.errors.push(
        `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime?.toISOString() || null,
    };
  }

  /**
   * Manual trigger for sync
   */
  async triggerSync(
    userId = "system",
    options: {
      timeWindowHours?: number;
      forceSync?: boolean;
    } = {},
  ): Promise<SyncResult> {
    this.logger.info("Manual sync triggered");
    return this.syncCalendarToDatabase(userId, { ...options, forceSync: true });
  }
}

// Export singleton instance
export const calendarSyncService = CalendarToDatabaseSyncService.getInstance();
