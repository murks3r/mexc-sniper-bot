"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, DollarSign, Shield } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../auth/supabase-auth-provider";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

interface BalanceInfo {
  asset: string;
  free: string;
  locked: string;
  total: string;
}

interface BalanceGuardStatus {
  isRunning: boolean;
  monitoredAssets: string[];
  bufferPercent: number;
  balances: BalanceInfo[];
  lastCheck: string;
}

export function BalanceGuardPanel() {
  const { user } = useAuth();
  const [filterAsset, setFilterAsset] = useState<string | null>(null);

  // Fetch real balance guard data
  const { data, isLoading } = useQuery<{ success: boolean; data: BalanceGuardStatus }>({
    queryKey: ["balance-guard", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/async-sniper/balance-guard", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch balance guard status");
      return res.json();
    },
    refetchInterval: 3000, // Refresh every 3 seconds
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Balance Guard</CardTitle>
          <CardDescription>Real-time balance monitoring and protection</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const status = data?.data;

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Balance Guard</CardTitle>
          <CardDescription>Real-time balance monitoring and protection</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load balance guard status</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Balance Guard
        </CardTitle>
        <CardDescription>
          {status.isRunning ? "Active monitoring" : "Monitoring disabled"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {status.isRunning ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <Badge variant="default" className="bg-green-500">
                Active
              </Badge>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <Badge variant="secondary">Inactive</Badge>
            </>
          )}
          <span className="text-sm text-muted-foreground ml-auto">
            Buffer: {status.bufferPercent}%
          </span>
        </div>

        {/* Monitored Assets */}
        {status.monitoredAssets.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-2">Monitored Assets</div>
            <div className="flex flex-wrap gap-2">
              {status.monitoredAssets.map((asset) => (
                <Badge key={asset} variant="outline">
                  {asset}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Balance List */}
        {status.balances.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Balances</div>
              {status.monitoredAssets.length > 1 && (
                <select
                  value={filterAsset || ""}
                  onChange={(e) => setFilterAsset(e.target.value || null)}
                  className="text-xs border rounded px-2 py-1"
                >
                  <option value="">All Assets</option>
                  {status.monitoredAssets.map((asset) => (
                    <option key={asset} value={asset}>
                      {asset}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {(filterAsset
              ? status.balances.filter((b) => b.asset === filterAsset)
              : status.balances
            ).map((balance) => {
              const free = parseFloat(balance.free);
              const locked = parseFloat(balance.locked);
              const total = free + locked;

              return (
                <div
                  key={balance.asset}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{balance.asset}</span>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>Free: {free.toFixed(4)}</div>
                      {locked > 0 && <div>Locked: {locked.toFixed(4)}</div>}
                      <div>Total: {total.toFixed(4)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center text-muted-foreground">
            <AlertCircle className="h-6 w-6 mb-2 opacity-50" />
            <p className="text-sm">No balances loaded</p>
          </div>
        )}

        {/* Last Check */}
        <div className="text-xs text-muted-foreground">
          Last check: {new Date(status.lastCheck).toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
}
