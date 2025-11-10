/**
 * API endpoint to fetch tomorrow's coin listings
 */

import { type NextRequest, NextResponse } from "next/server";
import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";
import type { CalendarEntry } from "@/src/services/data/modules/calendar-listings.service";

/**
 * GET /api/trading/tomorrows-listings
 * Fetch all coin listings scheduled for tomorrow
 */
export async function GET(_request: NextRequest) {
  try {
    const mexcService = getRecommendedMexcService();

    // Fetch all calendar listings
    const calendarResponse = await mexcService.getCalendarListings();

    if (!calendarResponse.success || !calendarResponse.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch calendar listings",
          data: [],
        },
        { status: 500 },
      );
    }

    // Filter for tomorrow's listings and map to expected format
    const mappedListings = (calendarResponse.data as CalendarEntry[])
      .filter((listing) => {
        // Simple filter for tomorrow's listings
        const launchTime = new Date(listing.tradingStartTime);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return launchTime.toDateString() === tomorrow.toDateString();
      })
      .map((listing) => ({
        symbol: listing.symbol,
        status: listing.status,
        baseAsset: listing.baseAsset,
        quoteAsset: listing.quoteAsset,
        tradingStartTime: listing.tradingStartTime,
        priceScale: listing.priceScale,
        quantityScale: listing.quantityScale,
        minNotional: listing.minNotional,
        maxNotional: listing.maxNotional,
      }));

    return NextResponse.json({
      success: true,
      data: mappedListings,
      count: mappedListings.length,
      message: `Found ${mappedListings.length} listings for tomorrow`,
    });
  } catch (error) {
    // Error fetching tomorrow's listings - error logging handled by error handler middleware
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch tomorrow's listings",
        details: error instanceof Error ? error.message : "Unknown error",
        data: [],
      },
      { status: 500 },
    );
  }
}
