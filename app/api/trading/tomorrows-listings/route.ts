/**
 * API endpoint to fetch tomorrow's coin listings
 */

import { type NextRequest, NextResponse } from "next/server";
import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";
import { filterTomorrowsListings } from "@/src/utils/tomorrows-listings";

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

    // Filter for tomorrow's listings
    const tomorrowsListings = filterTomorrowsListings(calendarResponse.data);

    return NextResponse.json({
      success: true,
      data: tomorrowsListings,
      count: tomorrowsListings.length,
      message: `Found ${tomorrowsListings.length} listings for tomorrow`,
    });
  } catch (error) {
    console.error("Error fetching tomorrow's listings:", error);
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
