/**
 * Market Data Utilities
 *
 * Shared utilities for market-data API routes to reduce complexity and duplication
 */

import { z } from "zod";
import { getLogger } from "@/src/lib/unified-logger";
import { validateApiQuery } from "@/src/lib/validation-utils";

// ============================================================================
// Parameter Validation Schemas
// ============================================================================

export const klinesQuerySchema = z.object({
  symbol: z.string().default("BTCUSDT"),
  interval: z.string().default("1d"),
  limit: z.coerce.number().int().min(1).max(1000).default(90),
});

export const streamQuerySchema = z.object({
  symbols: z.string().default("BTCUSDT"),
});

// ============================================================================
// Parameter Parsing Utilities
// ============================================================================

export function parseKlinesParams(searchParams: URLSearchParams) {
  const validation = validateApiQuery(klinesQuerySchema, searchParams);
  if (!validation.success) {
    throw new Error(validation.error);
  }
  return validation.data;
}

export function parseStreamParams(searchParams: URLSearchParams) {
  const validation = validateApiQuery(streamQuerySchema, searchParams);
  if (!validation.success) {
    throw new Error(validation.error);
  }

  const symbols = validation.data.symbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return { symbols };
}

// ============================================================================
// Mock Data Generation
// ============================================================================

export interface MarketDataPoint {
  date: string;
  volume: number;
  trades: number;
  price: number;
  timestamp: number;
}

export interface MockDataOptions {
  symbol: string;
  limit: number;
  basePrice?: number;
  baseVolume?: number;
  baseTrades?: number;
  priceVariation?: number;
}

export function generateMockData(options: MockDataOptions): MarketDataPoint[] {
  const {
    symbol,
    limit,
    basePrice = symbol.includes("BTC") ? 45000 : 0.5,
    baseVolume = 1000000,
    baseTrades = 5000,
    priceVariation = 0.1,
  } = options;

  return Array.from({ length: limit }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (limit - i));

    const variation = (Math.random() - 0.5) * priceVariation;
    const price = basePrice * (1 + variation);

    return {
      date: date.toISOString().split("T")[0],
      volume: baseVolume * (0.8 + Math.random() * 0.4),
      trades: Math.floor(baseTrades * (0.8 + Math.random() * 0.4)),
      price,
      timestamp: date.getTime(),
    };
  });
}

export function generateMockDataFromTicker(
  ticker: Record<string, unknown>,
  symbol: string,
  limit: number,
): MarketDataPoint[] {
  const basePrice = parseFloat(String(ticker.lastPrice || ticker.price || "100"));
  const baseVolume = parseFloat(String(ticker.volume || "1000000"));
  const baseTrades = parseFloat(String(ticker.count || "5000"));

  return generateMockData({
    symbol,
    limit,
    basePrice,
    baseVolume,
    baseTrades,
  });
}

// ============================================================================
// WebSocket Streaming Helpers
// ============================================================================

export interface PriceUpdateMessage {
  symbol: string;
  price: number;
  ts: number;
}

export interface StreamOptions {
  symbols: string[];
  request: Request;
}

export class SSEStreamHelper {
  private encoder = new TextEncoder();
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  constructor(private options: StreamOptions) {}

  createStream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start: (controller) => {
        this.controller = controller;
        this.setupKeepAlive();
        this.writeEvent("hello", { ok: true, symbols: this.options.symbols });
      },
      cancel: () => {
        this.cleanup();
      },
    });
  }

  private setupKeepAlive() {
    this.keepAliveTimer = setInterval(() => {
      try {
        this.controller?.enqueue(this.encoder.encode(":ping\n\n"));
      } catch {
        // Stream might be closed
      }
    }, 20000);
  }

  writeEvent(event: string, data: unknown) {
    if (!this.controller) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.controller.enqueue(this.encoder.encode(payload));
  }

  createPriceUpdateHandler(symbols: string[]) {
    return (msg: Record<string, unknown>) => {
      try {
        const sym = String(msg.symbol || msg.s || "").toUpperCase();
        if (!sym || !symbols.includes(sym)) return;

        const price = Number(msg.price || msg.p || msg.lastPrice || msg.c);
        const ts = Number(msg.ts || msg.timestamp || Date.now());

        this.writeEvent("price_update", { symbol: sym, price, ts });
      } catch {
        // Ignore malformed messages
      }
    };
  }

  setupAbortHandler() {
    // biome-ignore lint/suspicious/noExplicitAny: Request signal property access
    const signal: AbortSignal | undefined = (this.options.request as any).signal;
    if (signal) {
      const onAbort = () => this.cleanup();
      if (signal.aborted) {
        this.cleanup();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }
  }

  cleanup() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    try {
      this.controller?.close();
    } catch {
      // Stream might already be closed
    }
  }

  getResponseHeaders() {
    return {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    };
  }
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

export function handleMarketDataError(
  error: unknown,
  context: string,
  fallbackData?: unknown,
): Response {
  const logger = getLogger("market-data-api");
  logger.error(
    `Error in ${context}`,
    {},
    error instanceof Error ? error : new Error(String(error)),
  );

  if (fallbackData) {
    return Response.json({
      success: true,
      data: fallbackData,
      error: error instanceof Error ? error.message : "Unknown error",
      fallback: true,
    });
  }

  return Response.json(
    {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 },
  );
}

// ============================================================================
// Service Initialization Helpers
// ============================================================================

export async function initializeWebSocketService(
  mexcWebSocketStream: {
    initialize(): Promise<void>;
    start(): Promise<void>;
    subscribeToSymbolList(symbols: string[]): Promise<void>;
  },
  symbols: string[],
) {
  try {
    await mexcWebSocketStream.initialize();
    await mexcWebSocketStream.start();
    await mexcWebSocketStream.subscribeToSymbolList(symbols);
  } catch (error) {
    const logger = getLogger("market-data-api");
    logger.debug("WebSocket service initialization failed, continuing anyway", { error });
    // Best-effort: continue; stream may already be initialized/started
  }
}
