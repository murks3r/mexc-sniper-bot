import type { NextRequest } from "next/server";
import { EXECUTION_MODE } from "../config/execution-mode";
import { inngest } from "../inngest/client";
import { createErrorResponse, createSuccessResponse } from "./api-response";

// Type definitions for trigger event data
interface CalendarPollData extends Record<string, unknown> {
  force?: boolean;
  userId?: string;
  timeWindowHours?: number;
}

interface PatternAnalysisData extends Record<string, unknown> {
  symbols?: unknown[];
  userId?: string;
}

interface SymbolWatchData extends Record<string, unknown> {
  vcoinId?: string;
  symbol?: string;
  userId?: string;
}

interface TradingStrategyData extends Record<string, unknown> {
  symbols?: unknown[];
  strategy?: string;
  userId?: string;
}

interface EmergencyStopData extends Record<string, unknown> {
  reason?: string;
  userId?: string;
}

/**
 * Factory function to create consistent trigger handlers
 * Supports hybrid queue architecture with feature flag routing
 */
export function createTriggerHandler<T extends Record<string, unknown> = Record<string, unknown>>(
  eventName: string,
  description: string,
  dataTransform?: (body: T) => Record<string, unknown>,
) {
  return async function POST(request: NextRequest) {
    try {
      // Parse request body if present
      let body: Record<string, unknown> = {};
      try {
        const parsed = await request.json();
        body =
          typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
      } catch {
        // No body or invalid JSON, use empty object
      }

      // Transform data if transformer provided
      const eventData = dataTransform ? dataTransform(body as T) : body;

      let eventId: string | undefined;

      // Send event to Inngest if:
      // - Inngest is primary executor, OR
      // - Inngest fallback is enabled, OR
      // - Dual-run mode is enabled
      if (
        EXECUTION_MODE.primary === "inngest" ||
        EXECUTION_MODE.inngestFallback ||
        EXECUTION_MODE.dualRun
      ) {
        const event = await inngest.send({
          name: eventName,
          data: {
            triggeredBy: "ui",
            timestamp: new Date().toISOString(),
            ...eventData,
          },
        });
        eventId = event.ids[0];
      }

      return createSuccessResponse(
        {
          message: `${description} workflow triggered`,
          eventId,
          executionMode: EXECUTION_MODE.primary,
          fallbackEnabled: EXECUTION_MODE.inngestFallback,
          ...eventData,
        },
        {
          workflow: description,
          eventName,
        },
      );
    } catch (error) {
      return createErrorResponse(error as string, {
        workflow: description,
        eventName,
      });
    }
  };
}

/**
 * Common trigger handlers for MEXC workflows
 */
export const TriggerHandlers = {
  calendarPoll: createTriggerHandler<CalendarPollData>("mexc/calendar.poll", "Calendar polling"),

  patternAnalysis: createTriggerHandler<PatternAnalysisData>(
    "mexc/patterns.analyze",
    "Pattern analysis",
    (body) => ({
      symbols: body.symbols || [],
      userId: body.userId,
    }),
  ),

  symbolWatch: createTriggerHandler<SymbolWatchData>(
    "mexc/symbol.watch",
    "Symbol watch",
    (body) => ({
      vcoinId: body.vcoinId,
      symbol: body.symbol,
      userId: body.userId,
    }),
  ),

  tradingStrategy: createTriggerHandler<TradingStrategyData>(
    "mexc/strategy.create",
    "Trading strategy creation",
    (body) => ({
      symbols: body.symbols || [],
      strategy: body.strategy || "balanced",
      userId: body.userId,
    }),
  ),

  emergency: createTriggerHandler<EmergencyStopData>(
    "mexc/emergency.stop",
    "Emergency stop",
    (body) => ({
      reason: body.reason || "Manual trigger",
      userId: body.userId,
    }),
  ),
};

/**
 * Higher-order function to add authentication to trigger handlers
 */
export function withAuth(
  handler: (request: NextRequest) => Promise<Response>,
  _requiredRole = "user",
) {
  return async (request: NextRequest) => {
    // Extract and validate authentication headers
    const authHeader = request.headers.get("authorization");
    const apiKey = request.headers.get("x-api-key");

    // Check for valid authentication
    if (!authHeader && !apiKey) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // For now, accept any bearer token or API key
    // Future: Implement proper token validation
    const isAuthenticated = authHeader?.startsWith("Bearer ") || Boolean(apiKey);

    if (!isAuthenticated) {
      return new Response(JSON.stringify({ error: "Invalid authentication credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return handler(request);
  };
}

/**
 * Higher-order function to add rate limiting to trigger handlers
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<Response>,
  maxRequests = 10,
  windowMs = 60000,
) {
  const requests = new Map<string, number[]>();

  return async (request: NextRequest) => {
    const clientIP =
      (request as { ip?: string }).ip || request.headers.get("x-forwarded-for") || "unknown";
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create request log for this IP
    const clientRequests = requests.get(clientIP) || [];

    // Remove old requests outside the window
    const recentRequests = clientRequests.filter((timestamp) => timestamp > windowStart);

    // Check if rate limit exceeded
    if (recentRequests.length >= maxRequests) {
      const oldestRequest = Math.min(...recentRequests);
      const _retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
      return createErrorResponse("Rate limit exceeded");
    }

    // Add current request
    recentRequests.push(now);
    requests.set(clientIP, recentRequests);

    // Call the original handler
    return handler(request);
  };
}
