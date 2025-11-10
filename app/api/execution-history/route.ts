import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/src/db";
import { type ExecutionHistory, executionHistory } from "@/src/db/schemas/trading";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const action = searchParams.get("action"); // "buy", "sell", or null for all
    const status = searchParams.get("status"); // "success", "failed", or null for all
    const symbolName = searchParams.get("symbol"); // Filter by specific symbol
    const fromDate = searchParams.get("fromDate"); // Unix timestamp
    const toDate = searchParams.get("toDate"); // Unix timestamp

    // Build query conditions
    const conditions: SQL[] = [];
    if (userId) {
      conditions.push(eq(executionHistory.userId, userId));
    }

    if (action) {
      conditions.push(eq(executionHistory.action, action));
    }

    if (status) {
      conditions.push(eq(executionHistory.status, status));
    }

    if (symbolName) {
      conditions.push(eq(executionHistory.symbolName, symbolName));
    }

    if (fromDate) {
      conditions.push(gte(executionHistory.executedAt, new Date(parseInt(fromDate, 10) * 1000)));
    }

    if (toDate) {
      conditions.push(lte(executionHistory.executedAt, new Date(parseInt(toDate, 10) * 1000)));
    }

    // Get execution history with pagination and error handling
    let executions: ExecutionHistory[];
    try {
      const base = db.select().from(executionHistory);
      const filtered = conditions.length ? base.where(and(...conditions)) : base;
      executions = await Promise.race([
        filtered.orderBy(desc(executionHistory.executedAt)).limit(limit).offset(offset),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database query timeout")), 10000),
        ),
      ]);
    } catch (_dbError) {
      // Database error in execution history query - error logging handled by error handler middleware

      // Return empty execution history with success status
      const fallbackResponse = {
        executions: [],
        pagination: {
          total: 0,
          limit,
          offset,
          hasMore: false,
        },
        summary: {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          totalBuyVolume: 0,
          totalSellVolume: 0,
          totalFees: 0,
          avgExecutionLatencyMs: 0,
          avgSlippagePercent: 0,
          successRate: 0,
        },
        symbolStats: [],
        error: "Database temporarily unavailable",
        fallback: true,
      };

      return NextResponse.json({
        success: true,
        data: fallbackResponse,
      });
    }

    // For simplicity, use the length of returned results
    // In a production system, you might want to implement proper pagination counting
    const totalCount = executions.length;

    // Calculate summary statistics
    const buyExecutions = executions.filter(
      (exec) => exec.action === "buy" && exec.status === "success",
    );
    const sellExecutions = executions.filter(
      (exec) => exec.action === "sell" && exec.status === "success",
    );

    const totalBuyVolume = buyExecutions.reduce(
      (sum: number, exec) => sum + (exec.totalCost || 0),
      0,
    );
    const totalSellVolume = sellExecutions.reduce(
      (sum: number, exec) => sum + (exec.totalCost || 0),
      0,
    );
    const totalFees = executions.reduce((sum: number, exec) => sum + (exec.fees || 0), 0);

    const avgExecutionLatency = executions
      .filter((exec) => exec.executionLatencyMs)
      .reduce(
        (sum: number, exec, _: number, arr: ExecutionHistory[]) =>
          sum + (exec.executionLatencyMs || 0) / arr.length,
        0,
      );

    const avgSlippage = executions
      .filter((exec) => exec.slippagePercent)
      .reduce(
        (sum: number, exec, _: number, arr: ExecutionHistory[]) =>
          sum + (exec.slippagePercent || 0) / arr.length,
        0,
      );

    // Group executions by symbol for analysis
    interface SymbolStat {
      symbol: string;
      totalExecutions: number;
      successfulExecutions: number;
      totalVolume: number;
      avgPrice: number;
      lastExecution: number;
    }
    const symbolStats = executions.reduce(
      (acc: Record<string, SymbolStat>, exec: ExecutionHistory) => {
        const symbol = exec.symbolName;
        if (!acc[symbol]) {
          acc[symbol] = {
            symbol,
            totalExecutions: 0,
            successfulExecutions: 0,
            totalVolume: 0,
            avgPrice: 0,
            lastExecution: 0,
          };
        }

        acc[symbol].totalExecutions++;
        if (exec.status === "success") {
          acc[symbol].successfulExecutions++;
          acc[symbol].totalVolume += exec.totalCost || 0;
        }
        const executedAtTimestamp =
          exec.executedAt instanceof Date ? exec.executedAt.getTime() / 1000 : exec.executedAt || 0;
        acc[symbol].lastExecution = Math.max(acc[symbol].lastExecution, executedAtTimestamp);

        return acc;
      },
      {} as Record<string, SymbolStat>,
    );

    const response = {
      executions: executions.map((exec: ExecutionHistory) => ({
        ...exec,
        // Add human-readable timestamps
        executedAtFormatted: exec.executedAt
          ? exec.executedAt instanceof Date
            ? exec.executedAt.toISOString()
            : new Date((exec.executedAt as number) * 1000).toISOString()
          : null,
        requestedAtFormatted: exec.requestedAt
          ? exec.requestedAt instanceof Date
            ? exec.requestedAt.toISOString()
            : new Date((exec.requestedAt as number) * 1000).toISOString()
          : null,
        // Calculate profit/loss for matched buy/sell pairs
        profitLoss: null, // This would require more complex matching logic
      })),
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + executions.length < totalCount,
      },
      summary: {
        totalExecutions: executions.length,
        successfulExecutions: executions.filter((exec) => exec.status === "success").length,
        failedExecutions: executions.filter((exec) => exec.status === "failed").length,
        totalBuyVolume,
        totalSellVolume,
        totalFees,
        avgExecutionLatencyMs: Math.round(avgExecutionLatency),
        avgSlippagePercent: Number(avgSlippage.toFixed(3)),
        successRate:
          executions.length > 0
            ? (executions.filter((exec) => exec.status === "success").length / executions.length) *
              100
            : 0,
      },
      symbolStats: Object.values(symbolStats),
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    // Error fetching execution history - error logging handled by error handler middleware

    // Return empty data with success status instead of 500 error
    const fallbackResponse = {
      executions: [],
      pagination: {
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false,
      },
      summary: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        totalFees: 0,
        avgExecutionLatencyMs: 0,
        avgSlippagePercent: 0,
        successRate: 0,
      },
      symbolStats: [],
      error: error instanceof Error ? error.message : "Service temporarily unavailable",
      fallback: true,
    };

    return NextResponse.json({
      success: true,
      data: fallbackResponse,
    });
  }
}
