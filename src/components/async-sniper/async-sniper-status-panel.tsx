"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle, Clock, Settings, Shield, Target, XCircle } from "lucide-react";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

interface AsyncSniperStatus {
  async: {
    enabled: boolean;
    maxConcurrency: number;
    requestTimeout: number;
    status: string;
  };
  takeProfitMonitor: {
    config: {
      checkIntervalMs: number;
      takeProfitPercent: number;
      stopLossPercent: number;
    };
    status: string;
  };
  balanceGuard: {
    config: {
      minBalanceBufferPercent: number;
      checkIntervalMs: number;
    };
    status: string;
  };
  eventAuditLog: {
    status: string;
  };
  timestamp: string;
}

export function AsyncSniperStatusPanel() {
  const { data, isLoading, error } = useQuery<{ success: boolean; data: AsyncSniperStatus }>({
    queryKey: ["async-sniper-status"],
    queryFn: async () => {
      const res = await fetch("/api/async-sniper/status", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch async sniper status");
      return res.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Async Sniper Status</CardTitle>
          <CardDescription>Real-time status of async execution components</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Async Sniper Status</CardTitle>
          <CardDescription>Real-time status of async execution components</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" />
            <span>Failed to load status</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = data.data;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "ready":
        return (
          <Badge variant="default" className="bg-green-500">
            Active
          </Badge>
        );
      case "disabled":
        return <Badge variant="secondary">Disabled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Async Sniper Status
        </CardTitle>
        <CardDescription>Real-time status of async execution components</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Async Client Status */}
        <div className="flex items-start justify-between rounded-lg border p-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Async Client</span>
              {getStatusBadge(status.async.status)}
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Concurrency: {status.async.maxConcurrency}</div>
              <div>Timeout: {status.async.requestTimeout}ms</div>
            </div>
          </div>
        </div>

        {/* Take-Profit Monitor Status */}
        <div className="flex items-start justify-between rounded-lg border p-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Take-Profit Monitor</span>
              {getStatusBadge(status.takeProfitMonitor.status)}
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>TP: {status.takeProfitMonitor.config.takeProfitPercent}%</div>
              <div>SL: {status.takeProfitMonitor.config.stopLossPercent}%</div>
              <div>Check: {status.takeProfitMonitor.config.checkIntervalMs}ms</div>
            </div>
          </div>
        </div>

        {/* Balance Guard Status */}
        <div className="flex items-start justify-between rounded-lg border p-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Balance Guard</span>
              {getStatusBadge(status.balanceGuard.status)}
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Buffer: {status.balanceGuard.config.minBalanceBufferPercent}%</div>
              <div>Check: {status.balanceGuard.config.checkIntervalMs}ms</div>
            </div>
          </div>
        </div>

        {/* Event Audit Log Status */}
        <div className="flex items-start justify-between rounded-lg border p-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Event Audit Log</span>
              {getStatusBadge(status.eventAuditLog.status)}
            </div>
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Updated: {new Date(status.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
