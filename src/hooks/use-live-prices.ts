"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface LivePricePoint {
  symbol: string;
  price: number;
  ts: number;
}

export function useLivePrices(symbols: string[], enabled = true) {
  const [prices, setPrices] = useState<Record<string, LivePricePoint>>({});
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pendingRef = useRef<Record<string, LivePricePoint>>({});
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || symbols.length === 0) return;

    const params = new URLSearchParams({ symbols: symbols.join(",") });
    const es = new EventSource(`/api/market-data/stream?${params.toString()}`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      // Let browser attempt reconnection per EventSource policy
    };
    es.addEventListener("price_update", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as LivePricePoint;
        if (!data?.symbol) return;
        // Buffer incoming updates and flush at most every 300ms
        pendingRef.current[data.symbol] = data;
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(() => {
            const batch = pendingRef.current;
            pendingRef.current = {};
            flushTimerRef.current = null;
            setPrices((prev) => ({ ...prev, ...batch }));
          }, 300);
        }
      } catch {}
    });

    return () => {
      try {
        es.close();
      } catch {}
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      eventSourceRef.current = null;
    };
  }, [enabled, symbols.join(",")]);

  const lastPrices = useMemo(() => prices, [prices]);

  return { prices: lastPrices, connected };
}


