import type { NextRequest } from "next/server";
import {
  apiResponse,
  createErrorResponse,
  createSuccessResponse,
  HTTP_STATUS,
} from "@/src/lib/api-response";
import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";

export async function GET(request: NextRequest) {
  try {
    const mexcService = getRecommendedMexcService();
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const symbols = searchParams.get("symbols");

    // Handle single symbol ticker
    if (symbol) {
      // Fetching ticker for symbol

      const tickerResponse = await mexcService.getTicker(symbol);

      if (!tickerResponse.success || !tickerResponse.data) {
        // Failed to fetch ticker - error logging handled by error handler middleware
        return apiResponse(
          createErrorResponse(tickerResponse.error || `Failed to fetch ticker for ${symbol}`, {
            symbol,
            fallbackData: null,
            serviceLayer: true,
          }),
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
        );
      }

      // Successfully fetched ticker

      return apiResponse(
        createSuccessResponse([tickerResponse.data], {
          symbol,
          serviceLayer: true,
          cached: "cached" in tickerResponse ? tickerResponse.cached : undefined,
        }),
      );
    }

    // Handle multiple symbols ticker
    if (symbols) {
      const symbolList = symbols.split(",").filter((s) => s.trim().length > 0);
      // Fetching tickers for symbols

      const tickerResponse = await mexcService.getTicker24hr(symbolList);

      if (!tickerResponse.success || !tickerResponse.data) {
        // Failed to fetch tickers - error logging handled by error handler middleware
        return apiResponse(
          createErrorResponse(tickerResponse.error || "Failed to fetch ticker data", {
            symbols: symbolList,
            fallbackData: [],
            serviceLayer: true,
          }),
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
        );
      }

      // Successfully fetched tickers

      return apiResponse(
        createSuccessResponse(tickerResponse.data, {
          count: tickerResponse.data.length,
          symbols: symbolList,
          serviceLayer: true,
          cached: "cached" in tickerResponse ? tickerResponse.cached : undefined,
        }),
      );
    }

    // Handle all tickers (24hr ticker for all symbols)
    // Fetching all 24hr tickers

    const allTickersResponse = await mexcService.getTicker24hr();

    if (!allTickersResponse.success || !allTickersResponse.data) {
      // Failed to fetch all tickers - error logging handled by error handler middleware
      return apiResponse(
        createErrorResponse(allTickersResponse.error || "Failed to fetch all ticker data", {
          fallbackData: [],
          serviceLayer: true,
        }),
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    // Successfully fetched all tickers

    return apiResponse(
      createSuccessResponse(allTickersResponse.data, {
        count: allTickersResponse.data.length,
        serviceLayer: true,
        cached: "cached" in allTickersResponse ? allTickersResponse.cached : undefined,
      }),
    );
  } catch (error) {
    // Ticker fetch failed - error logging handled by error handler middleware

    return apiResponse(
      createErrorResponse(error instanceof Error ? error.message : "Unknown error", {
        fallbackData: [],
        serviceLayer: true,
      }),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
