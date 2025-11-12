import type { NextRequest } from "next/server";
import { getLogger } from "@/src/lib/unified-logger";
import { getUnifiedMexcService } from "@/src/services/api/unified-mexc-service-factory";
import {
  generateMockData,
  generateMockDataFromTicker,
  handleMarketDataError,
  parseKlinesParams,
} from "../utils";

export async function GET(request: NextRequest) {
  const logger = getLogger("market-data-api");

  try {
    const { searchParams } = new URL(request.url);
    const { symbol, interval, limit } = parseKlinesParams(searchParams);

    logger.debug("Fetching market data for chart", { symbol, interval, limit });

    const mexcService = await getUnifiedMexcService();

    // Note: getKlines is not currently implemented in UnifiedMexcService
    // Going directly to ticker data which is more reliable
    logger.debug("Using ticker data for chart (klines not implemented)", { symbol });

    const tickerResponse = await mexcService.getTicker(symbol);

    if (
      tickerResponse?.success &&
      Array.isArray(tickerResponse.data) &&
      tickerResponse.data.length > 0
    ) {
      const ticker = tickerResponse.data[0];
      const mockData = generateMockDataFromTicker(ticker, symbol, limit);

      return Response.json({
        success: true,
        data: mockData,
        fallback: true,
      });
    } else {
      // If ticker fails, fall back to deterministic mock data
      logger.debug("Ticker data not available, using mock data", { symbol, interval, limit });
      const mockData = generateMockData({ symbol, limit });

      return Response.json({
        success: true,
        data: mockData,
        fallback: true,
      });
    }
  } catch (error) {
    const url = new URL(request.url);
    const { symbol, limit } = parseKlinesParams(url.searchParams);
    const fallbackData = generateMockData({ symbol, limit });

    return handleMarketDataError(error, "fetching market data", fallbackData);
  }
}
