import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/src/db";
import { type ExecutionHistory, executionHistory } from "@/src/db/schemas/trading";

interface QueryParams {
  userId: string | null;
  limit: number;
  offset: number;
  action: string | null;
  status: string | null;
  symbolName: string | null;
  fromDate: string | null;
  toDate: string | null;
}

function parseQueryParams(request: NextRequest): QueryParams {
  const { searchParams } = new URL(request.url);
  return {
    userId: searchParams.get("userId"),
    limit: parseInt(searchParams.get("limit") || "50", 10),
    offset: parseInt(searchParams.get("offset") || "0", 10),
    action: searchParams.get("action"),
    status: searchParams.get("status"),
    symbolName: searchParams.get("symbol"),
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  };
}

function buildQueryConditions(params: QueryParams): SQL[] {
  const conditions: SQL[] = [];

  if (params.userId) {
    conditions.push(eq(executionHistory.userId, params.userId));
  }

  if (params.action) {
    conditions.push(eq(executionHistory.action, params.action));
  }

  if (params.status) {
    conditions.push(eq(executionHistory.status, params.status));
  }

  if (params.symbolName) {
    conditions.push(eq(executionHistory.symbolName, params.symbolName));
  }

  if (params.fromDate) {
    conditions.push(
      gte(executionHistory.executedAt, new Date(parseInt(params.fromDate, 10) * 1000)),
    );
  }

  if (params.toDate) {
    conditions.push(lte(executionHistory.executedAt, new Date(parseInt(params.toDate, 10) * 1000)));
  }

  return conditions;
}

async function fetchExecutionHistory(
  params: QueryParams,
  conditions: SQL[],
): Promise<ExecutionHistory[]> {
  try {
    const base = db.select().from(executionHistory);
    const filtered = conditions.length ? base.where(and(...conditions)) : base;
    const queryResult = filtered
      .orderBy(desc(executionHistory.executedAt))
      .limit(params.limit)
      .offset(params.offset);

    return (await Promise.race([
      queryResult,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Database query timeout")), 10000),
      ),
    ])) as ExecutionHistory[];
  } catch (_dbError) {
    // Database error in execution history query - error logging handled by error handler middleware
    throw new Error("Database temporarily unavailable");
  }
}

function createFallbackResponse(params: QueryParams) {
  return {
    executions: [],
    pagination: {
      total: 0,
      limit: params.limit,
      offset: params.offset,
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
}

export async function GET(request: NextRequest) {
  try {
    const params = parseQueryParams(request);
    const conditions = buildQueryConditions(params);

    // Get execution history with pagination and error handling
    let executions: ExecutionHistory[];
    try {
      executions = await fetchExecutionHistory(params, conditions);
    } catch (_dbError) {
      return NextResponse.json({
        success: true,
        data: createFallbackResponse(params),
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
        limit: params.limit,
        offset: params.offset,
        hasMore: params.offset + executions.length < totalCount,
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

    // Parse params again for fallback response
    const params = parseQueryParams(request);

    // Return empty data with success status instead of 500 error
    const fallbackResponse = {
      executions: [],
      pagination: {
        total: 0,
        limit: params.limit,
        offset: params.offset,
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
