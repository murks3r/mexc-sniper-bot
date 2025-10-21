import type { NextRequest } from "next/server";

export const runtime = "nodejs";
import { mexcWebSocketStream } from "@/src/services/data/mexc-websocket-stream";

// Server-Sent Events endpoint that streams live price updates for requested symbols
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols") || "BTCUSDT";
    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    // Ensure underlying WebSocket stream is initialized and running
    try {
      await mexcWebSocketStream.initialize();
      await mexcWebSocketStream.start();
      await mexcWebSocketStream.subscribeToSymbolList(symbols);
    } catch (_err) {
      // Best-effort: continue; stream may already be initialized/started
    }

    const encoder = new TextEncoder();
    let keepAliveTimer: NodeJS.Timeout | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Helper to write SSE frames
        const write = (event: string, data: unknown) => {
          const payload = `event: ${event}\n` +
            `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };

        // Initial hello
        write("hello", { ok: true, symbols });

        // Keep-alive ping every 20s
        keepAliveTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(":ping\n\n"));
          } catch {}
        }, 20000);

        // Forward price updates for requested symbols
        const onPriceUpdate = (msg: any) => {
          try {
            const sym = (msg.symbol || msg.s || "").toUpperCase();
            if (!sym || !symbols.includes(sym)) return;
            const price = Number(msg.price || msg.p || msg.lastPrice || msg.c);
            const ts = Number(msg.ts || msg.timestamp || Date.now());
            write("price_update", { symbol: sym, price, ts });
          } catch {}
        };

        mexcWebSocketStream.on("price_update", onPriceUpdate);

        // Handle close
        const close = () => {
          try {
            mexcWebSocketStream.off("price_update", onPriceUpdate);
          } catch {}
          if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
          }
          try {
            controller.close();
          } catch {}
        };

        // If the client disconnects
        // @ts-ignore - NextRequest may expose signal in some runtimes
        const signal: AbortSignal | undefined = (request as any).signal;
        if (signal) {
          const onAbort = () => close();
          if (signal.aborted) {
            close();
          } else {
            signal.addEventListener("abort", onAbort, { once: true });
          }
        }
      },
      cancel() {
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}


