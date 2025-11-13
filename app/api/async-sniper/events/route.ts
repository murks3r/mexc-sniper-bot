/**
 * Event Audit Log API
 *
 * Provides recent events from execution history and risk events
 */

import { and, desc, eq, gte } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/src/db";
import { riskEvents } from "@/src/db/schemas/safety";
import { executionHistory } from "@/src/db/schemas/trading";
import { apiAuthWrapper } from "@/src/lib/api-auth";
import { requireClerkAuth } from "@/src/lib/clerk-auth-server";

export const GET = apiAuthWrapper(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const user = await requireClerkAuth();
    const userId = user.id;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const eventType = searchParams.get("type"); // Optional filter

    // Get events from last 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Fetch execution history events
    const executionEvents = await db
      .select()
      .from(executionHistory)
      .where(
        and(
          userId ? eq(executionHistory.userId, userId) : undefined,
          gte(executionHistory.executedAt, twentyFourHoursAgo),
        ),
      )
      .orderBy(desc(executionHistory.executedAt))
      .limit(limit);

    // Fetch risk events
    const riskEventsData = await db
      .select()
      .from(riskEvents)
      .where(
        and(
          userId ? eq(riskEvents.userId, userId) : undefined,
          gte(riskEvents.timestamp, twentyFourHoursAgo),
        ),
      )
      .orderBy(desc(riskEvents.timestamp))
      .limit(limit);

    // Transform execution events
    const transformedExecutionEvents = executionEvents.map((event) => ({
      id: `exec-${event.id}`,
      eventType: event.status === "success" ? "order_filled" : "execution_error",
      timestamp: event.executedAt.toISOString(),
      correlationId: `corr-${event.id}-${Date.now()}`,
      data: {
        orderId: event.id.toString(),
        symbol: event.symbolName,
        status: event.status,
        quantity: event.executedQuantity?.toString(),
        price: event.executedPrice?.toString(),
        profit: undefined, // Not available in executionHistory schema
      },
    }));

    // Transform risk events
    const transformedRiskEvents = riskEventsData.map((event) => ({
      id: `risk-${event.id}`,
      eventType: `risk_${event.eventType}`,
      timestamp: event.timestamp.toISOString(),
      correlationId: `corr-${event.id}`,
      data: {
        eventType: event.eventType,
        severity: event.severity,
        description: event.description,
        actionTaken: event.actionTaken,
      },
    }));

    // Combine and sort by timestamp
    const allEvents = [...transformedExecutionEvents, ...transformedRiskEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    // Filter by type if specified
    const filteredEvents = eventType
      ? allEvents.filter((e) => e.eventType.includes(eventType))
      : allEvents;

    return NextResponse.json({
      success: true,
      data: filteredEvents,
      count: filteredEvents.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});
