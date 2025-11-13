/**
 * Database Operations Utility
 *
 * Consolidates repetitive database operations and update patterns.
 * Provides standardized methods for common database tasks with error handling.
 */

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/src/db";
import { snipeTargets } from "@/src/db/schemas/trading";
import { toSafeError } from "@/src/lib/error-type-utils";
import type { AutoSnipeTarget } from "../types";

export class DatabaseOperations {
  private static logger = {
    info: (_message: string, _context?: any) => {
      // Logging handled by structured logger
    },
    warn: (_message: string, _context?: any) => {
      // Logging handled by structured logger
    },
    error: (_message: string, _context?: any) => {
      // Logging handled by structured logger
    },
    debug: (_message: string, _context?: any) => {
      // Logging handled by structured logger
    },
  };

  /**
   * Get ready snipe targets from database with standardized query
   */
  static async getReadySnipeTargets(limit: number = 10): Promise<AutoSnipeTarget[]> {
    try {
      const now = new Date();
      const targets = await db
        .select()
        .from(snipeTargets)
        .where(
          and(
            eq(snipeTargets.status, "ready"),
            or(isNull(snipeTargets.targetExecutionTime), lt(snipeTargets.targetExecutionTime, now)),
          ),
        )
        .orderBy(snipeTargets.priority, snipeTargets.createdAt)
        .limit(limit);

      return targets as AutoSnipeTarget[];
    } catch (error) {
      const safeError = toSafeError(error);
      DatabaseOperations.logger.error("Failed to fetch ready snipe targets", safeError);
      return [];
    }
  }

  /**
   * Update snipe target status with standardized error handling
   */
  static async updateSnipeTargetStatus(
    targetId: number,
    status: string,
    errorMessage?: string,
    additionalFields?: Record<string, any>,
  ): Promise<boolean> {
    try {
      const updateData: Record<string, any> = {
        status,
        updatedAt: new Date(),
        ...additionalFields,
      };

      if (status === "executing") {
        updateData.actualExecutionTime = new Date();
      }

      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }

      await db.update(snipeTargets).set(updateData).where(eq(snipeTargets.id, targetId));

      return true;
    } catch (error) {
      const safeError = toSafeError(error);
      DatabaseOperations.logger.error("Failed to update snipe target status", {
        targetId,
        status,
        error: safeError,
      });
      return false;
    }
  }

  /**
   * Batch update multiple snipe targets
   */
  static async batchUpdateSnipeTargets(
    updates: Array<{
      id: number;
      status: string;
      errorMessage?: string;
      additionalFields?: Record<string, any>;
    }>,
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const update of updates) {
      const result = await DatabaseOperations.updateSnipeTargetStatus(
        update.id,
        update.status,
        update.errorMessage,
        update.additionalFields,
      );

      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    DatabaseOperations.logger.info("Batch update completed", {
      total: updates.length,
      success,
      failed,
    });

    return { success, failed };
  }

  /**
   * Get snipe targets by status with optional filtering
   */
  static async getSnipeTargetsByStatus(
    status: string,
    limit: number = 50,
    additionalFilters?: any,
  ): Promise<AutoSnipeTarget[]> {
    try {
      const whereClause = additionalFilters
        ? and(eq(snipeTargets.status, status), additionalFilters)
        : eq(snipeTargets.status, status);

      const targets = await db
        .select()
        .from(snipeTargets)
        .where(whereClause)
        .orderBy(snipeTargets.createdAt)
        .limit(limit)
        .execute();

      return targets as AutoSnipeTarget[];
    } catch (error) {
      const safeError = toSafeError(error);
      DatabaseOperations.logger.error("Failed to fetch snipe targets by status", {
        status,
        error: safeError,
      });
      return [];
    }
  }

  /**
   * Get snipe target by ID
   */
  static async getSnipeTargetById(targetId: number): Promise<AutoSnipeTarget | null> {
    try {
      const targets = await db
        .select()
        .from(snipeTargets)
        .where(eq(snipeTargets.id, targetId))
        .limit(1)
        .execute();

      return targets.length > 0 ? (targets[0] as AutoSnipeTarget) : null;
    } catch (error) {
      const safeError = toSafeError(error);
      DatabaseOperations.logger.error("Failed to fetch snipe target by ID", {
        targetId,
        error: safeError,
      });
      return null;
    }
  }

  /**
   * Create a new snipe target
   */
  static async createSnipeTarget(
    targetData: Partial<AutoSnipeTarget>,
  ): Promise<AutoSnipeTarget | null> {
    try {
      // Resolve risk parameters using centralized defaults
      const { resolveRiskParams } = await import("@/src/lib/risk-defaults");
      const riskParams = await resolveRiskParams(
        {
          stopLossPercent: targetData.stopLossPercent ?? undefined,
          takeProfitLevel: targetData.takeProfitLevel ?? undefined,
          takeProfitCustom: targetData.takeProfitCustom ?? undefined,
        },
        targetData.userId,
      );

      // Validate required fields
      if (!targetData.userId) {
        throw new Error("userId is required to create a snipe target");
      }
      if (!targetData.symbolName && !targetData.symbol) {
        throw new Error("symbolName or symbol is required to create a snipe target");
      }
      if (!targetData.vcoinId) {
        throw new Error("vcoinId is required to create a snipe target");
      }
      if (!targetData.positionSizeUsdt && !targetData.quantity && !targetData.amount) {
        throw new Error(
          "positionSizeUsdt, quantity, or amount is required to create a snipe target",
        );
      }

      // Map AutoSnipeTarget properties to database schema
      const dbTarget: {
        userId: string;
        symbolName: string;
        vcoinId: string;
        positionSizeUsdt: number;
        stopLossPercent: number;
        takeProfitLevel: number;
        takeProfitCustom?: number;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        entryStrategy?: string;
        entryPrice?: number;
        targetExecutionTime?: Date;
        confidenceScore?: number;
        priority?: number;
        maxRetries?: number;
        currentRetries?: number;
        riskLevel?: string;
      } = {
        // Required fields
        userId: targetData.userId,
        symbolName: (targetData.symbol || targetData.symbolName) as string,
        vcoinId: targetData.vcoinId as string,
        positionSizeUsdt: (targetData.quantity ||
          targetData.amount ||
          targetData.positionSizeUsdt) as number,
        stopLossPercent: riskParams.stopLossPercent,
        takeProfitLevel: riskParams.takeProfitLevel,
        takeProfitCustom: riskParams.takeProfitCustom,
        status: targetData.status || "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
        // Optional fields
        entryStrategy: (targetData.orderType || targetData.entryStrategy) as string | undefined,
        entryPrice: (targetData.price || targetData.targetPrice || targetData.entryPrice) as
          | number
          | undefined,
        targetExecutionTime: targetData.scheduledAt
          ? new Date(targetData.scheduledAt)
          : targetData.targetExecutionTime,
        confidenceScore: (targetData.confidence || targetData.confidenceScore) as
          | number
          | undefined,
        priority: targetData.priority,
        maxRetries: targetData.maxRetries,
        currentRetries: targetData.currentRetries,
        riskLevel: targetData.riskLevel,
      };

      const result = await db.insert(snipeTargets).values(dbTarget).returning();

      return result.length > 0 ? (result[0] as AutoSnipeTarget) : null;
    } catch (error) {
      const safeError = toSafeError(error);
      DatabaseOperations.logger.error("Failed to create snipe target", {
        targetData: { ...targetData, id: undefined },
        error: safeError,
      });
      return null;
    }
  }

  /**
   * Delete old completed snipe targets for cleanup
   */
  static async cleanupOldSnipeTargets(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await db
        .delete(snipeTargets)
        .where(
          and(
            or(
              eq(snipeTargets.status, "completed"),
              eq(snipeTargets.status, "failed"),
              eq(snipeTargets.status, "cancelled"),
            ),
            lt(snipeTargets.updatedAt, cutoffDate),
          ),
        )
        .execute();

      // For Drizzle, result contains metadata about the operation
      const deletedCount =
        typeof result === "object" && result && "rowCount" in result ? (result as any).rowCount : 0;

      DatabaseOperations.logger.info("Cleanup completed", {
        deletedTargets: deletedCount,
        olderThanDays,
      });

      return deletedCount;
    } catch (error) {
      const safeError = toSafeError(error);
      DatabaseOperations.logger.error("Failed to cleanup old snipe targets", {
        olderThanDays,
        error: safeError,
      });
      return 0;
    }
  }

  /**
   * Get snipe target statistics
   */
  static async getSnipeTargetStats(): Promise<{
    total: number;
    pending: number;
    ready: number;
    executing: number;
    completed: number;
    failed: number;
  }> {
    try {
      // For simplicity, we'll get all targets and count them
      // In a real implementation, you'd use aggregation queries for better performance
      const allTargets = await db
        .select({
          id: snipeTargets.id,
          status: snipeTargets.status,
        })
        .from(snipeTargets)
        .execute();

      const stats = {
        total: allTargets.length,
        pending: allTargets.filter((t: any) => t.status === "pending").length,
        ready: allTargets.filter((t: any) => t.status === "ready").length,
        executing: allTargets.filter((t: any) => t.status === "executing").length,
        completed: allTargets.filter((t: any) => t.status === "completed").length,
        failed: allTargets.filter((t: any) => t.status === "failed").length,
      };

      return stats;
    } catch (error) {
      const safeError = toSafeError(error);
      DatabaseOperations.logger.error("Failed to get snipe target statistics", safeError);
      return {
        total: 0,
        pending: 0,
        ready: 0,
        executing: 0,
        completed: 0,
        failed: 0,
      };
    }
  }

  /**
   * Generic database operation with error handling
   */
  static async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>,
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      const safeError = toSafeError(error);
      DatabaseOperations.logger.error(`Database operation failed: ${operationName}`, {
        ...context,
        error: safeError,
      });
      return null;
    }
  }
}
