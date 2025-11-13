// Build-safe imports - avoid structured logger to prevent webpack bundling issues

import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";
import { calendarSyncService } from "@/src/services/calendar-to-database-sync";
import {
  type QualificationResult,
  qualifyAndCacheSymbol,
} from "@/src/services/symbol-qualification.service";
import { inngest } from "./client";

// Inngest step interface
interface InngestStep {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
  sleep: (id: string, ms: number) => Promise<void>;
}

// Simplified type definitions (no agents)
interface SyncResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function isSyncResult(value: unknown): value is SyncResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).success === "boolean" &&
    typeof (value as any).processed === "number" &&
    typeof (value as any).created === "number" &&
    typeof (value as any).updated === "number" &&
    typeof (value as any).skipped === "number" &&
    Array.isArray((value as any).errors)
  );
}

// MEXC Calendar polling event data
interface MexcCalendarPollRequestedData {
  trigger?: string;
  force?: boolean;
}

// Removed unused event data interfaces (agent-based workflows removed)

// MEXC Calendar Polling Function - Simplified (no agents)
const USE_INNGEST_FALLBACK = process.env.USE_INNGEST_FALLBACK === "true";

export const pollMexcCalendar = USE_INNGEST_FALLBACK
  ? inngest.createFunction(
      { id: "poll-mexc-calendar" },
      { event: "mexc/calendar.poll" },
      async ({
        event,
        step,
      }: {
        event: { data: MexcCalendarPollRequestedData };
        step: InngestStep;
      }) => {
        const { trigger = "manual", force = false } = event.data;

        // Sync Calendar to Database (direct API call, no agents)
        const syncResult = await step.run("calendar-to-database-sync", async () => {
          return await calendarSyncService.syncCalendarToDatabase("system", {
            timeWindowHours: 72,
            forceSync: force,
            dryRun: false,
          });
        });

        // Type guard for sync result
        if (!isSyncResult(syncResult)) {
          throw new Error("Invalid sync result format");
        }

        if (!syncResult.success) {
          throw new Error(`Calendar sync failed: ${syncResult.errors.join(", ")}`);
        }

        return {
          status: "success",
          trigger,
          sync: {
            processed: syncResult.processed,
            created: syncResult.created,
            updated: syncResult.updated,
            skipped: syncResult.skipped,
            errors: syncResult.errors,
          },
          timestamp: new Date().toISOString(),
          metadata: {
            databaseSynced: syncResult.success,
          },
        };
      },
    )
  : (null as any);

// Removed agent-based workflows: watchMexcSymbol, analyzeMexcPatterns, createMexcTradingStrategy
// These are no longer needed - calendar sync creates targets directly

// Symbol Qualification Function - Slice 1.2: Assessment Zone Blocking
// This is THE MOST CRITICAL FIX - prevents trading Assessment Zone tokens
interface MexcSymbolQualifyData {
  symbol: string;
  vcoinId?: string;
  reason?: string; // Why qualification was triggered
}

function isQualificationResult(value: unknown): value is QualificationResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).symbol === "string" &&
    typeof (value as any).isApiTradable === "boolean"
  );
}

export const qualifyMexcSymbol = USE_INNGEST_FALLBACK
  ? inngest.createFunction(
      { id: "qualify-mexc-symbol", retries: 2 },
      { event: "mexc/symbol.qualify" },
      async ({ event, step }: { event: { data: MexcSymbolQualifyData }; step: InngestStep }) => {
        const { symbol, vcoinId, reason = "calendar-sync" } = event.data;

        // Step 1: Qualify and cache the symbol
        const qualificationResult = await step.run("qualify-and-cache", async () => {
          return await qualifyAndCacheSymbol(symbol);
        });

        // Type guard
        if (!isQualificationResult(qualificationResult)) {
          throw new Error("Invalid qualification result format");
        }

        if (!qualificationResult.isApiTradable) {
          // Return failure result - caller should not proceed with trading
          return {
            status: "not_tradable",
            symbol,
            vcoinId,
            reason: qualificationResult.reason || "Unknown reason",
            timestamp: new Date().toISOString(),
          };
        }

        // Success - symbol is tradable
        return {
          status: "tradable",
          symbol,
          vcoinId,
          isApiTradable: true,
          tradingRules: qualificationResult.tradingRules,
          timestamp: new Date().toISOString(),
        };
      },
    )
  : (null as any);

// Order Monitoring Function - Slice 4.2: Post-Trade Monitoring
// Monitors order status after placement and triggers TP/SL setup when filled
interface MexcOrderMonitorData {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  userId?: string;
}

export const monitorMexcOrder = USE_INNGEST_FALLBACK
  ? inngest.createFunction(
      { id: "monitor-mexc-order", retries: 3 },
      { event: "mexc/order.placed" },
      async ({ event, step }: { event: { data: MexcOrderMonitorData }; step: InngestStep }) => {
        const { orderId, symbol, side } = event.data;

        // Poll order status until filled or timeout
        const MAX_POLLS = 30; // 30 attempts
        const POLL_INTERVAL_MS = 2000; // 2 seconds

        for (let i = 0; i < MAX_POLLS; i++) {
          const orderStatus = await step.run(`check-order-status-${i}`, async () => {
            const mexcService = getRecommendedMexcService();
            // Get order status
            const statusResponse = await mexcService.getOrderStatus(symbol, orderId);

            return statusResponse;
          });

          // Type guard for orderStatus
          const statusResponse = orderStatus as {
            success?: boolean;
            data?: { status?: string; [key: string]: unknown };
          };

          // Check if order is filled
          if (statusResponse.success && statusResponse.data) {
            const status = statusResponse.data.status;

            if (status === "FILLED") {
              // Order is filled - return success
              return {
                status: "filled",
                orderId,
                symbol,
                side,
                fillTime: new Date().toISOString(),
                metadata: statusResponse.data,
              };
            }

            if (status === "CANCELED" || status === "REJECTED" || status === "EXPIRED") {
              // Order failed
              return {
                status: "failed",
                orderId,
                symbol,
                orderStatus: status,
                timestamp: new Date().toISOString(),
              };
            }
          }

          // Wait before next poll (unless last attempt)
          if (i < MAX_POLLS - 1) {
            await step.sleep("wait-before-next-poll", POLL_INTERVAL_MS);
          }
        }

        // Timeout - order status unknown
        return {
          status: "timeout",
          orderId,
          symbol,
          message: "Order monitoring timed out after 60 seconds",
          timestamp: new Date().toISOString(),
        };
      },
    )
  : (null as any);

// Export all functions for Inngest registration
export const functions = [
  // Core trading workflows (simplified - no agents)
  pollMexcCalendar,
  qualifyMexcSymbol, // Slice 1.2: Assessment Zone blocking
  monitorMexcOrder, // Slice 4.2: Order monitoring
  // Removed: watchMexcSymbol, analyzeMexcPatterns, createMexcTradingStrategy (agent-based)
  // Removed: safetyFunctions (agent-based)
];
