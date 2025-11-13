import type { NextRequest } from "next/server";
import { mexcWebSocketStream } from "@/src/services/data/mexc-websocket-stream";
import {
  handleMarketDataError,
  initializeWebSocketService,
  parseStreamParams,
  SSEStreamHelper,
} from "../utils";

export const dynamic = "force-dynamic";

// Server-Sent Events endpoint that streams live price updates for requested symbols
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { symbols } = parseStreamParams(searchParams);

    // Ensure underlying WebSocket stream is initialized and running
    await initializeWebSocketService(mexcWebSocketStream, symbols);

    const sseHelper = new SSEStreamHelper({ symbols, request });
    const stream = sseHelper.createStream();

    // Set up price update handler
    const onPriceUpdate = sseHelper.createPriceUpdateHandler(symbols);
    mexcWebSocketStream.on("price_update", onPriceUpdate);

    // Handle cleanup on stream cancellation
    const originalCancel = stream.cancel.bind(stream);
    stream.cancel = async () => {
      try {
        mexcWebSocketStream.off("price_update", onPriceUpdate);
      } catch {
        // Ignore cleanup errors
      }
      sseHelper.cleanup();
      await originalCancel();
    };

    // Set up abort handler for client disconnection
    sseHelper.setupAbortHandler();

    return new Response(stream, {
      headers: sseHelper.getResponseHeaders(),
    });
  } catch (error) {
    return handleMarketDataError(error, "WebSocket stream initialization");
  }
}
