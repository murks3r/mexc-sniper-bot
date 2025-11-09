"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useToast } from "../ui/use-toast";

interface Trade {
  id: number;
  symbolName: string;
  buyPrice: number;
  buyQuantity: number;
  buyTotalCost: number;
  sellPrice: number | null;
  sellQuantity: number | null;
  sellTotalRevenue: number | null;
  profitLoss: number | null;
  profitLossPercentage: number | null;
  status: "pending" | "completed" | "failed";
  buyTimestamp: string;
  sellTimestamp: string | null;
}

type RawExecution = Record<string, any> & {
  id: number;
  snipeTargetId: number | null;
  symbolName: string;
  action?: string;
  orderSide?: string;
  executedPrice?: number | string | null;
  executedQuantity?: number | string | null;
  requestedQuantity?: number | string | null;
  totalCost?: number | string | null;
  status?: string;
  executedAt?: string | null;
  requestedAt?: string | null;
  createdAt?: string | null;
};

interface TradeRowsProps {
  trades: Trade[];
  getProfitLossIcon: (percentage: number | null) => ReactNode;
  getProfitLossColor: (percentage: number | null) => string;
  getStatusBadge: (status: string, profitLoss: number | null) => ReactNode;
  onSell?: (symbol: string, quantity: number) => void;
  sellingSymbol?: string;
}

function TradeRows({
  trades,
  getProfitLossIcon,
  getProfitLossColor,
  getStatusBadge,
  onSell,
  sellingSymbol,
}: TradeRowsProps) {
  return (
    <>
      {trades.map((trade) => {
        const isOpenPosition = trade.status === "pending" && !trade.sellPrice;
        const isSelling = sellingSymbol === trade.symbolName;
        
        return (
          <TableRow key={trade.id}>
            <TableCell className="font-medium">{trade.symbolName}</TableCell>
            <TableCell>${trade.buyPrice.toFixed(4)}</TableCell>
            <TableCell>{trade.sellPrice ? `$${trade.sellPrice.toFixed(4)}` : "-"}</TableCell>
            <TableCell>{trade.buyQuantity.toFixed(2)}</TableCell>
            <TableCell>${trade.buyTotalCost.toFixed(2)}</TableCell>
            <TableCell>
              {trade.sellTotalRevenue ? `$${trade.sellTotalRevenue.toFixed(2)}` : "-"}
            </TableCell>
            <TableCell className={getProfitLossColor(trade.profitLoss)}>
              <div className="flex items-center gap-1">
                {getProfitLossIcon(trade.profitLoss)}
                {trade.profitLoss !== null ? `$${Math.abs(trade.profitLoss).toFixed(2)}` : "-"}
              </div>
            </TableCell>
            <TableCell className={getProfitLossColor(trade.profitLossPercentage)}>
              {trade.profitLossPercentage !== null
                ? `${trade.profitLossPercentage > 0 ? "+" : ""}${trade.profitLossPercentage.toFixed(2)}%`
                : "-"}
            </TableCell>
            <TableCell>{getStatusBadge(trade.status, trade.profitLoss)}</TableCell>
            <TableCell>
              {isOpenPosition && onSell ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSell(trade.symbolName, trade.buyQuantity)}
                  disabled={isSelling}
                  className="text-xs"
                >
                  {isSelling ? "Selling..." : "Sell"}
                </Button>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {formatDistanceToNow(new Date(trade.sellTimestamp || trade.buyTimestamp), {
                    addSuffix: true,
                  })}
                </span>
              )}
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

interface RecentTradesTableProps {
  userId?: string;
}

export function RecentTradesTable({ userId }: RecentTradesTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sellingSymbol, setSellingSymbol] = useState<string | undefined>();

  const { data: trades, isLoading } = useQuery<Trade[]>({
    queryKey: ["recent-trades", "all", userId ?? "global"],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (userId) params.set("userId", userId);
      const response = await fetch(`/api/execution-history?${params.toString()}`);
      if (!response.ok) return [];

      const json = await response.json();
      const executions: RawExecution[] = json?.data?.executions || [];
      if (!Array.isArray(executions) || executions.length === 0) {
        return [];
      }

      // Also fetch open positions and merge them
      try {
        const positionsResponse = await fetch(`/api/positions?status=open`, {
          credentials: "include",
        });
        if (positionsResponse.ok) {
          const positionsData = await positionsResponse.json();
          if (positionsData.success && positionsData.data?.positions) {
            const openPositions = positionsData.data.positions;
            // Add open positions as pending trades
            for (const position of openPositions) {
              const existingTrade = executions.find(
                (e) => e.symbolName === position.symbolName && e.action === "buy",
              );
              if (!existingTrade) {
                executions.push({
                  id: position.id,
                  symbolName: position.symbolName,
                  action: "buy",
                  status: "success",
                  executedPrice: position.entryPrice,
                  executedQuantity: position.quantity,
                  totalCost: position.entryPrice * position.quantity,
                  executedAt: position.entryTime?.toISOString() || new Date().toISOString(),
                  userId: position.userId,
                  snipeTargetId: position.snipeTargetId,
                } as RawExecution);
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch positions:", error);
      }

      const grouped = new Map<number | string, RawExecution[]>();

      for (const exec of executions) {
        const key = exec.snipeTargetId ?? `${exec.symbolName}:${exec.id}`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)?.push(exec);
      }

      const results: Trade[] = [];

      grouped.forEach((bucket, key) => {
        if (!bucket.length) return;

        let buy: RawExecution | undefined;
        let sell: RawExecution | undefined;

        for (const exec of bucket) {
          const side = (exec.orderSide || exec.action || "buy").toLowerCase();
          if (side === "buy" && !buy) {
            buy = exec;
          } else if (side === "sell" && !sell) {
            sell = exec;
          }
        }

        if (!buy) {
          buy = bucket[0];
        }

        const normalizeNumber = (value: unknown): number | null => {
          if (value == null) return null;
          const n = typeof value === "string" ? Number(value) : (value as number);
          return Number.isFinite(n) ? n : null;
        };

        const buyPrice = normalizeNumber(buy.executedPrice) ?? normalizeNumber(buy.totalCost) ?? 0;
        const buyQuantity =
          normalizeNumber(buy.executedQuantity) ??
          normalizeNumber(buy.requestedQuantity) ??
          normalizeNumber(buy.totalCost) ??
          0;
        // Cost should be totalCost (price * quantity), or calculated from price * quantity
        const buyTotalCost =
          normalizeNumber(buy.totalCost) ??
          (normalizeNumber(buy.executedPrice) && normalizeNumber(buy.executedQuantity)
            ? normalizeNumber(buy.executedPrice)! * normalizeNumber(buy.executedQuantity)!
            : 0);

        const sellPrice = sell
          ? (normalizeNumber(sell.executedPrice) ?? normalizeNumber(sell.totalCost))
          : null;
        const sellQuantity = sell
          ? (normalizeNumber(sell.executedQuantity) ?? normalizeNumber(sell.requestedQuantity))
          : null;
        // Revenue should be totalCost (price * quantity for sell), or calculated from price * quantity
        const sellTotalRevenue = sell
          ? (normalizeNumber(sell.totalCost) ??
            (normalizeNumber(sell.executedPrice) && normalizeNumber(sell.executedQuantity)
              ? normalizeNumber(sell.executedPrice)! * normalizeNumber(sell.executedQuantity)!
              : null))
          : null;

        const profitLoss = sellTotalRevenue !== null ? sellTotalRevenue - buyTotalCost : null;
        const profitLossPercentage =
          profitLoss !== null && buyTotalCost > 0 ? (profitLoss / buyTotalCost) * 100 : null;

        const buyTimestamp =
          buy.executedAt || buy.requestedAt || buy.createdAt || new Date().toISOString();
        const sellTimestamp = sell
          ? sell.executedAt || sell.requestedAt || sell.createdAt || null
          : null;

        let status: Trade["status"] = "pending";
        if (sell && sell.status === "success" && buy.status === "success") {
          status = "completed";
        } else if (buy.status === "failed") {
          status = "failed";
        }

        results.push({
          id: typeof key === "number" ? key : buy.id,
          symbolName: String(buy.symbolName || "-").toUpperCase(),
          buyPrice: Number.isFinite(buyPrice) ? buyPrice : 0,
          buyQuantity: Number.isFinite(buyQuantity) ? buyQuantity : 0,
          buyTotalCost: Number.isFinite(buyTotalCost) ? buyTotalCost : 0,
          sellPrice: sellPrice ?? null,
          sellQuantity: sellQuantity ?? null,
          sellTotalRevenue: sellTotalRevenue ?? null,
          profitLoss,
          profitLossPercentage,
          status,
          buyTimestamp: new Date(buyTimestamp).toISOString(),
          sellTimestamp: sellTimestamp ? new Date(sellTimestamp).toISOString() : null,
        });
      });

      return results.sort((a, b) => {
        const aTs = new Date(a.sellTimestamp || a.buyTimestamp).getTime();
        const bTs = new Date(b.sellTimestamp || b.buyTimestamp).getTime();
        return bTs - aTs;
      });
    },
    refetchInterval: 30000,
    enabled: true,
  });

  const getProfitLossIcon = (percentage: number | null) => {
    if (percentage === null) return <Minus className="h-4 w-4 text-muted-foreground" />;
    if (percentage > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (percentage < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getProfitLossColor = (percentage: number | null) => {
    if (percentage === null) return "text-muted-foreground";
    if (percentage > 0) return "text-green-600 dark:text-green-400";
    if (percentage < 0) return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
  };

  const getStatusBadge = (status: string, profitLoss: number | null) => {
    if (status === "completed" && profitLoss !== null) {
      if (profitLoss > 0) {
        return (
          <Badge
            variant="default"
            className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
          >
            Profit
          </Badge>
        );
      }
      if (profitLoss < 0) {
        return (
          <Badge
            variant="destructive"
            className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
          >
            Loss
          </Badge>
        );
      }
      return <Badge variant="secondary">Break Even</Badge>;
    }

    if (status === "pending") {
      return (
        <Badge
          variant="outline"
          className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"
        >
          In Progress
        </Badge>
      );
    }

    if (status === "failed") {
      return <Badge variant="destructive">Failed</Badge>;
    }

    return <Badge variant="secondary">{status}</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
          <CardDescription>Latest trading activity and performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={`skeleton-row-${i + 1}`} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalProfit = trades?.reduce((sum, trade) => sum + (trade.profitLoss || 0), 0) || 0;
  const winRate = trades?.length
    ? ((trades.filter((t) => (t.profitLoss || 0) > 0).length / trades.length) * 100).toFixed(1)
    : "0.0";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent Trades</CardTitle>
            <CardDescription>Latest trading activity and performance</CardDescription>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <p className="text-muted-foreground">Total P/L</p>
              <p
                className={`font-semibold ${totalProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
              >
                ${Math.abs(totalProfit).toFixed(2)}
                {totalProfit >= 0 ? (
                  <ArrowUpRight className="inline h-3 w-3 ml-1" />
                ) : (
                  <ArrowDownRight className="inline h-3 w-3 ml-1" />
                )}
              </p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">Win Rate</p>
              <p className="font-semibold">{winRate}%</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Buy Price</TableHead>
                <TableHead>Sell Price</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>P/L</TableHead>
                <TableHead>P/L %</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!trades || trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No trades found
                  </TableCell>
                </TableRow>
              ) : (
                <TradeRows
                  trades={trades}
                  getProfitLossIcon={getProfitLossIcon}
                  getProfitLossColor={getProfitLossColor}
                  getStatusBadge={getStatusBadge}
                  onSell={async (symbol: string, quantity: number) => {
                    setSellingSymbol(symbol);
                    try {
                      const response = await fetch("/api/trading/quick-trade", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                          symbol: symbol,
                          side: "SELL",
                          quantity: quantity,
                          paperTrade: false,
                        }),
                      });

                      const result = await response.json();

                      if (result.success) {
                        toast({
                          title: "Sell Order Executed",
                          description: `Sold ${quantity} ${symbol} successfully`,
                          variant: "default",
                        });
                        // Refresh trades and positions
                        queryClient.invalidateQueries({ queryKey: ["recent-trades"] });
                        queryClient.invalidateQueries({ queryKey: ["positions"] });
                        queryClient.invalidateQueries({ queryKey: ["account-balance"] });
                      } else {
                        throw new Error(result.error || "Sell failed");
                      }
                    } catch (error) {
                      toast({
                        title: "Sell Failed",
                        description: error instanceof Error ? error.message : "Unknown error",
                        variant: "destructive",
                      });
                    } finally {
                      setSellingSymbol(undefined);
                    }
                  }}
                  sellingSymbol={sellingSymbol}
                />
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// Add default export for dynamic imports
export default RecentTradesTable;
