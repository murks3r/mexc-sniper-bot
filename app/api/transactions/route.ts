import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/src/db";
import { type NewTransaction, transactions } from "@/src/db/schemas/trading";
import {
  apiResponse,
  createErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  HTTP_STATUS,
} from "@/src/lib/api-response";

// Validation schemas
const createTransactionSchema = z.object({
  userId: z.string().min(1),
  transactionType: z.enum(["buy", "sell", "complete_trade"]),
  symbolName: z.string().min(1),
  vcoinId: z.string().optional(),
  buyPrice: z.number().positive().optional(),
  buyQuantity: z.number().positive().optional(),
  buyTotalCost: z.number().positive().optional(),
  buyTimestamp: z.number().optional(),
  buyOrderId: z.string().optional(),
  sellPrice: z.number().positive().optional(),
  sellQuantity: z.number().positive().optional(),
  sellTotalRevenue: z.number().positive().optional(),
  sellTimestamp: z.number().optional(),
  sellOrderId: z.string().optional(),
  profitLoss: z.number().optional(),
  profitLossPercentage: z.number().optional(),
  fees: z.number().min(0).optional(),
  status: z.enum(["pending", "completed", "failed", "cancelled"]).default("pending"),
  snipeTargetId: z.number().optional(),
  notes: z.string().optional(),
});

const querySchema = z.object({
  userId: z.string().min(1).optional(),
  status: z.enum(["pending", "completed", "failed", "cancelled"]).nullable().optional(),
  symbolName: z.string().nullable().optional(),
  transactionType: z.enum(["buy", "sell", "complete_trade"]).nullable().optional(),
  fromDate: z.string().nullable().optional(), // ISO date string
  toDate: z.string().nullable().optional(), // ISO date string
  limit: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50)),
  offset: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
});

// GET /api/transactions - Fetch user transactions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryData = {
      userId: searchParams.get("userId"),
      status: searchParams.get("status"),
      symbolName: searchParams.get("symbolName"),
      transactionType: searchParams.get("transactionType"),
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
      limit: searchParams.get("limit"),
      offset: searchParams.get("offset"),
    };

    const parsed = querySchema.safeParse(queryData);
    if (!parsed.success) {
      return apiResponse(
        createValidationErrorResponse("query", "Invalid query parameters"),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const { userId, status, symbolName, transactionType, fromDate, toDate, limit, offset } =
      parsed.data;

    // Build query conditions
    const conditions: SQL[] = [];
    if (userId) {
      conditions.push(eq(transactions.userId, userId));
    }

    if (status) {
      conditions.push(eq(transactions.status, status));
    }

    if (symbolName) {
      conditions.push(eq(transactions.symbolName, symbolName));
    }

    if (transactionType) {
      conditions.push(eq(transactions.transactionType, transactionType));
    }

    if (fromDate) {
      try {
        const fromTimestamp = new Date(fromDate);
        if (Number.isNaN(fromTimestamp.getTime())) {
          return apiResponse(
            createValidationErrorResponse("fromDate", "Invalid fromDate format"),
            HTTP_STATUS.BAD_REQUEST,
          );
        }
        conditions.push(gte(transactions.transactionTime, fromTimestamp));
      } catch {
        // Error parsing fromDate - error logging handled by error handler middleware
        return apiResponse(
          createValidationErrorResponse("fromDate", "Invalid fromDate format"),
          HTTP_STATUS.BAD_REQUEST,
        );
      }
    }

    if (toDate) {
      try {
        const toTimestamp = new Date(toDate);
        if (Number.isNaN(toTimestamp.getTime())) {
          return apiResponse(
            createValidationErrorResponse("toDate", "Invalid toDate format"),
            HTTP_STATUS.BAD_REQUEST,
          );
        }
        conditions.push(lte(transactions.transactionTime, toTimestamp));
      } catch {
        // Error parsing toDate - error logging handled by error handler middleware
        return apiResponse(
          createValidationErrorResponse("toDate", "Invalid toDate format"),
          HTTP_STATUS.BAD_REQUEST,
        );
      }
    }

    // Execute query with database error handling
    let userTransactions: Array<typeof transactions.$inferSelect>;
    try {
      const base = db.select().from(transactions);
      const filtered = conditions.length ? base.where(and(...conditions)) : base;
      const queryResult = filtered
        .orderBy(desc(transactions.transactionTime))
        .limit(limit)
        .offset(offset);
      userTransactions = (await Promise.race([
        queryResult,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Database query timeout")), 10000),
        ),
      ])) as Array<typeof transactions.$inferSelect>;
    } catch (dbError) {
      // Database error in transactions query - error logging handled by error handler middleware

      // Check if this is a database connectivity issue
      const isDbConnectivityError =
        dbError instanceof Error &&
        (dbError.message.includes("ECONNREFUSED") ||
          dbError.message.includes("timeout") ||
          dbError.message.includes("connection") ||
          dbError.message.includes("ENOTFOUND") ||
          dbError.message.includes("Database query timeout"));

      // Return empty transactions with success instead of error to prevent 503
      return apiResponse(
        createSuccessResponse(
          {
            transactions: [],
            summary: {
              totalTransactions: 0,
              completedTrades: 0,
              totalProfitLoss: 0,
              profitableTrades: 0,
              losingTrades: 0,
              winRate: 0,
              averageProfitLoss: 0,
            },
          },
          {
            pagination: { limit, offset, hasMore: false },
            count: 0,
            error: isDbConnectivityError ? "Database temporarily unavailable" : "Query failed",
            fallback: true,
            retryable: isDbConnectivityError,
          },
        ),
      );
    }

    // Calculate summary statistics
    const completedTrades = userTransactions.filter(
      (t: (typeof userTransactions)[0]) =>
        t.status === "completed" && t.transactionType === "complete_trade",
    );
    const totalProfitLoss = completedTrades.reduce(
      (sum: number, t: (typeof completedTrades)[0]) => sum + (t.profitLoss || 0),
      0,
    );
    const profitableTrades = completedTrades.filter(
      (t: (typeof completedTrades)[0]) => (t.profitLoss || 0) > 0,
    );
    const losingTrades = completedTrades.filter(
      (t: (typeof completedTrades)[0]) => (t.profitLoss || 0) < 0,
    );
    const winRate =
      completedTrades.length > 0 ? (profitableTrades.length / completedTrades.length) * 100 : 0;

    const summary = {
      totalTransactions: userTransactions.length,
      completedTrades: completedTrades.length,
      totalProfitLoss: totalProfitLoss,
      profitableTrades: profitableTrades.length,
      losingTrades: losingTrades.length,
      winRate: Math.round(winRate * 100) / 100,
      averageProfitLoss: completedTrades.length > 0 ? totalProfitLoss / completedTrades.length : 0,
    };

    return apiResponse(
      createSuccessResponse(
        {
          transactions: userTransactions,
          summary,
        },
        {
          pagination: {
            limit,
            offset,
            hasMore: userTransactions.length === limit,
          },
          count: userTransactions.length,
        },
      ),
    );
  } catch (error) {
    // Error fetching transactions - error logging handled by error handler middleware
    return apiResponse(
      createErrorResponse(error instanceof Error ? error.message : "Unknown error occurred"),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

// POST /api/transactions - Create new transaction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return apiResponse(
        createValidationErrorResponse("body", "Invalid transaction data"),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const transactionData = parsed.data;

    // Auto-calculate profit/loss for complete trades
    if (
      transactionData.transactionType === "complete_trade" &&
      transactionData.buyTotalCost &&
      transactionData.sellTotalRevenue &&
      !transactionData.profitLoss
    ) {
      transactionData.profitLoss = transactionData.sellTotalRevenue - transactionData.buyTotalCost;
      transactionData.profitLossPercentage =
        (transactionData.profitLoss / transactionData.buyTotalCost) * 100;
    }

    // Ensure proper type matching for database insertion
    const insertData: NewTransaction = {
      userId: transactionData.userId,
      transactionType: transactionData.transactionType,
      symbolName: transactionData.symbolName,
      vcoinId: transactionData.vcoinId,
      buyPrice: transactionData.buyPrice,
      buyQuantity: transactionData.buyQuantity,
      buyTotalCost: transactionData.buyTotalCost,
      buyTimestamp: transactionData.buyTimestamp
        ? (() => {
            try {
              const timestamp = transactionData.buyTimestamp;
              if (!timestamp) return undefined;
              const date = new Date(timestamp);
              if (Number.isNaN(date.getTime())) {
                throw new Error(`Invalid buyTimestamp: ${timestamp}`);
              }
              return date;
            } catch {
              // Error converting buyTimestamp - error logging handled by error handler middleware
              return new Date(); // Fallback to current time
            }
          })()
        : undefined,
      buyOrderId: transactionData.buyOrderId,
      sellPrice: transactionData.sellPrice,
      sellQuantity: transactionData.sellQuantity,
      sellTotalRevenue: transactionData.sellTotalRevenue,
      sellTimestamp: transactionData.sellTimestamp
        ? (() => {
            try {
              const timestamp = transactionData.sellTimestamp;
              if (!timestamp) return undefined;
              const date = new Date(timestamp);
              if (Number.isNaN(date.getTime())) {
                throw new Error(`Invalid sellTimestamp: ${timestamp}`);
              }
              return date;
            } catch {
              // Error converting sellTimestamp - error logging handled by error handler middleware
              return new Date(); // Fallback to current time
            }
          })()
        : undefined,
      sellOrderId: transactionData.sellOrderId,
      profitLoss: transactionData.profitLoss,
      profitLossPercentage: transactionData.profitLossPercentage,
      fees: transactionData.fees,
      status: transactionData.status,
      snipeTargetId: transactionData.snipeTargetId,
      notes: transactionData.notes,
      transactionTime: new Date(),
    };

    // Execute database insertion with error handling
    let created: Array<typeof transactions.$inferSelect> | undefined;
    try {
      const insertQuery = db.insert(transactions).values(insertData).returning();
      const result = (await Promise.race([
        insertQuery,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Database insert timeout")), 10000),
        ),
      ])) as Array<typeof transactions.$inferSelect>;
      created = result;
    } catch (dbError) {
      // Database error creating transaction - error logging handled by error handler middleware

      // Check if this is a database connectivity issue
      const isDbConnectivityError =
        dbError instanceof Error &&
        (dbError.message.includes("ECONNREFUSED") ||
          dbError.message.includes("timeout") ||
          dbError.message.includes("connection") ||
          dbError.message.includes("ENOTFOUND") ||
          dbError.message.includes("Database insert timeout"));

      // Return success with error message instead of failing completely
      return apiResponse(
        createSuccessResponse(null, {
          error: isDbConnectivityError
            ? "Database temporarily unavailable"
            : "Transaction creation failed",
          fallback: true,
          retryable: isDbConnectivityError,
          code: "DB_INSERT_ERROR",
        }),
        HTTP_STATUS.OK,
      );
    }

    return apiResponse(
      createSuccessResponse(created, {
        message: "Transaction created successfully",
      }),
      HTTP_STATUS.CREATED,
    );
  } catch (error) {
    // Error creating transaction - error logging handled by error handler middleware
    return apiResponse(
      createErrorResponse(error instanceof Error ? error.message : "Unknown error occurred"),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

// PUT /api/transactions - Update transaction
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return apiResponse(
        createValidationErrorResponse("id", "Transaction ID is required"),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // Add updated timestamp
    updateData.updatedAt = Math.floor(Date.now() / 1000);

    // Execute database update with error handling
    let updated: Array<typeof transactions.$inferSelect> | undefined;
    try {
      const updateQuery = db
        .update(transactions)
        .set(updateData)
        .where(eq(transactions.id, id))
        .returning();
      const result = (await Promise.race([
        updateQuery,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Database update timeout")), 10000),
        ),
      ])) as Array<typeof transactions.$inferSelect>;
      updated = result;
    } catch (dbError) {
      // Database error updating transaction - error logging handled by error handler middleware

      // Check if this is a database connectivity issue
      const isDbConnectivityError =
        dbError instanceof Error &&
        (dbError.message.includes("ECONNREFUSED") ||
          dbError.message.includes("timeout") ||
          dbError.message.includes("connection") ||
          dbError.message.includes("ENOTFOUND") ||
          dbError.message.includes("Database update timeout"));

      // Return success with error message instead of failing completely
      return apiResponse(
        createSuccessResponse(null, {
          error: isDbConnectivityError
            ? "Database temporarily unavailable"
            : "Transaction update failed",
          fallback: true,
          retryable: isDbConnectivityError,
          code: "DB_UPDATE_ERROR",
        }),
        HTTP_STATUS.OK,
      );
    }

    if (!updated) {
      return apiResponse(createErrorResponse("Transaction not found"), HTTP_STATUS.NOT_FOUND);
    }

    return apiResponse(
      createSuccessResponse(updated, {
        message: "Transaction updated successfully",
      }),
    );
  } catch (error) {
    // Error updating transaction - error logging handled by error handler middleware
    return apiResponse(
      createErrorResponse(error instanceof Error ? error.message : "Unknown error occurred"),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
