"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../auth/supabase-auth-provider";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Skeleton } from "../ui/skeleton";

interface AuditEvent {
  id: string;
  eventType: string;
  timestamp: string;
  correlationId: string;
  data: Record<string, unknown>;
}

const EVENT_TYPES = [
  "all",
  "order_filled",
  "execution_error",
  "risk_circuit_breaker",
  "risk_position_limit",
] as const;

export function EventAuditLogPanel() {
  const { user } = useAuth();
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch real events from API
  const { data, isLoading } = useQuery<{ success: boolean; data: AuditEvent[] }>({
    queryKey: ["event-audit-log", user?.id, filterType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== "all") {
        params.set("type", filterType);
      }
      params.set("limit", "50");
      const res = await fetch(`/api/async-sniper/events?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Event Audit Log</CardTitle>
          <CardDescription>Recent system events and activities</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const events = data?.data || [];

  const getEventIcon = (eventType: string) => {
    if (eventType.includes("error")) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    if (eventType.includes("filled") || eventType.includes("triggered")) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (eventType.includes("cancelled") || eventType.includes("blocked")) {
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
    return <Activity className="h-4 w-4 text-blue-500" />;
  };

  const getEventBadge = (eventType: string) => {
    const colorMap: Record<string, string> = {
      order_placed: "bg-blue-500",
      order_filled: "bg-green-500",
      order_cancelled: "bg-yellow-500",
      take_profit_triggered: "bg-green-500",
      stop_loss_triggered: "bg-red-500",
      balance_check_blocked: "bg-orange-500",
      execution_error: "bg-red-500",
    };

    return (
      <Badge
        variant="default"
        className={colorMap[eventType] || "bg-gray-500"}
        style={{ backgroundColor: colorMap[eventType] || undefined }}
      >
        {eventType.replace(/_/g, " ")}
      </Badge>
    );
  };

  const filteredEvents =
    filterType === "all"
      ? events
      : events.filter((e) => e.eventType.includes(filterType.replace("risk_", "")));

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Event Audit Log
              </CardTitle>
              <CardDescription>
                {filteredEvents.length} recent event{filteredEvents.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs border rounded px-2 py-1"
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type === "all" ? "All Events" : type.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Activity className="h-8 w-8 mb-2 opacity-50" />
              <p>No events recorded</p>
              <p className="text-sm">Events will appear here as they occur</p>
            </div>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedEvent(event);
                      setIsDialogOpen(true);
                    }}
                  >
                    <div className="mt-0.5">{getEventIcon(event.eventType)}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {getEventBadge(event.eventType)}
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          ID: {event.correlationId.substring(0, 8)}...
                        </div>
                        {event.data.symbol && <div>Symbol: {String(event.data.symbol)}</div>}
                        {event.data.orderId && <div>Order: {String(event.data.orderId)}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Event Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
            <DialogDescription>
              {selectedEvent?.eventType.replace(/_/g, " ")} - {selectedEvent?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Event Type</div>
                  <div className="text-sm font-semibold">{selectedEvent.eventType}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Timestamp</div>
                  <div className="text-sm">
                    {new Date(selectedEvent.timestamp).toLocaleString()}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-sm text-muted-foreground">Correlation ID</div>
                  <div className="text-sm font-mono">{selectedEvent.correlationId}</div>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-2">Event Data</div>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                  {JSON.stringify(selectedEvent.data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
