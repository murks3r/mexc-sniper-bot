"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../auth/supabase-auth-provider";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Skeleton } from "../ui/skeleton";

interface MonitoredPosition {
  positionId: number;
  symbol: string;
  entryPrice: number;
  quantity: string;
  status: "monitoring" | "take_profit" | "stop_loss";
  takeProfitPrice?: number;
  stopLossPrice?: number;
  entryTime?: string;
  vcoinId?: string | null;
}

interface PositionWithPrice extends MonitoredPosition {
  currentPrice: number;
  profitPercent: number;
}

export function TakeProfitMonitorPanel() {
  const { user } = useAuth();
  const [selectedPosition, setSelectedPosition] = useState<PositionWithPrice | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch positions from API
  const { data, isLoading } = useQuery<{ success: boolean; data: MonitoredPosition[] }>({
    queryKey: ["take-profit-monitor", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/async-sniper/take-profit-monitor", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch positions");
      return res.json();
    },
    refetchInterval: 2000, // Refresh every 2 seconds
    enabled: !!user?.id,
  });

  // Fetch current prices for positions
  const { data: priceData } = useQuery<Record<string, number>>({
    queryKey: ["position-prices", data?.data?.map((p) => p.symbol).join(",")],
    queryFn: async () => {
      if (!data?.data || data.data.length === 0) return {};
      const prices: Record<string, number> = {};
      // Fetch prices for all symbols in parallel
      await Promise.allSettled(
        data.data.map(async (pos) => {
          try {
            const res = await fetch(`/api/mexc/ticker?symbol=${pos.symbol}`, {
              credentials: "include",
            });
            if (res.ok) {
              const ticker = await res.json();
              if (ticker.success && ticker.data?.price) {
                prices[pos.symbol] = parseFloat(ticker.data.price);
              }
            }
          } catch {
            // Ignore errors for individual price fetches
          }
        }),
      );
      return prices;
    },
    refetchInterval: 5000, // Refresh prices every 5 seconds
    enabled: !!data?.data && data.data.length > 0,
  });

  // Combine positions with current prices
  const positionsWithPrices: PositionWithPrice[] =
    data?.data
      ?.map((pos) => {
        const currentPrice = priceData?.[pos.symbol] || pos.entryPrice; // Fallback to entry price if no current price
        const profitPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        return {
          ...pos,
          currentPrice,
          profitPercent,
        };
      })
      .sort((a, b) => b.profitPercent - a.profitPercent) || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Take-Profit Monitor</CardTitle>
          <CardDescription>Active position monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const positions = data?.data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Take-Profit Monitor
        </CardTitle>
        <CardDescription>
          Monitoring {positions.length} position{positions.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mb-2 opacity-50" />
            <p>No positions being monitored</p>
            <p className="text-sm">
              Positions will appear here when take-profit monitoring is active
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {positionsWithPrices.map((position) => (
              <div
                key={position.positionId}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => {
                  setSelectedPosition(position);
                  setIsDialogOpen(true);
                }}
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{position.symbol}</span>
                    <Badge
                      variant={
                        position.status === "take_profit"
                          ? "default"
                          : position.status === "stop_loss"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {position.status === "take_profit"
                        ? "TP"
                        : position.status === "stop_loss"
                          ? "SL"
                          : "Monitoring"}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>
                      Entry: ${position.entryPrice.toFixed(2)} → Current: $
                      {position.currentPrice.toFixed(2)}
                    </div>
                    <div className="flex items-center gap-2">
                      {position.profitPercent >= 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span
                        className={position.profitPercent >= 0 ? "text-green-500" : "text-red-500"}
                      >
                        {position.profitPercent >= 0 ? "+" : ""}
                        {position.profitPercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}

        {/* Position Detail Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Position Details</DialogTitle>
              <DialogDescription>
                {selectedPosition?.symbol} - Position #{selectedPosition?.positionId}
              </DialogDescription>
            </DialogHeader>
            {selectedPosition && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Entry Price</div>
                    <div className="text-lg font-semibold">
                      ${selectedPosition.entryPrice.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Current Price</div>
                    <div className="text-lg font-semibold">
                      ${selectedPosition.currentPrice.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Quantity</div>
                    <div className="text-lg font-semibold">{selectedPosition.quantity}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">P&L</div>
                    <div
                      className={`text-lg font-semibold ${
                        selectedPosition.profitPercent >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {selectedPosition.profitPercent >= 0 ? "+" : ""}
                      {selectedPosition.profitPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
                {selectedPosition.takeProfitPrice && (
                  <div>
                    <div className="text-sm text-muted-foreground">Take Profit Target</div>
                    <div className="text-lg font-semibold">
                      ${selectedPosition.takeProfitPrice.toFixed(2)}
                    </div>
                  </div>
                )}
                {selectedPosition.stopLossPrice && (
                  <div>
                    <div className="text-sm text-muted-foreground">Stop Loss</div>
                    <div className="text-lg font-semibold">
                      ${selectedPosition.stopLossPrice.toFixed(2)}
                    </div>
                  </div>
                )}
                {selectedPosition.entryTime && (
                  <div>
                    <div className="text-sm text-muted-foreground">Entry Time</div>
                    <div className="text-sm">
                      {new Date(selectedPosition.entryTime).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
