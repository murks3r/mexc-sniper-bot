import type { NextRequest } from "next/server";
import { apiResponse, createErrorResponse, createSuccessResponse } from "@/src/lib/api-response";
import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";
import { getTodaysListings } from "@/src/utils/todays-listings";

/**
 * Today's Listings API Endpoint
 *
 * Returns filtered list of today's listings from MEXC calendar.
 * Cached for performance.
 */
export async function GET(_request: NextRequest) {
  try {
    const mexcService = getRecommendedMexcService();

    // Get today's listings
    const todaysListings = await getTodaysListings(async () => {
      return await mexcService.getCalendarListings();
    });

    return apiResponse(
      createSuccessResponse(todaysListings, {
        count: todaysListings.length,
        message: `Found ${todaysListings.length} listing(s) for today`,
      }),
    );
  } catch (error) {
    // Today's Listings API Error - error logging handled by error handler middleware
    return apiResponse(
      createErrorResponse(
        error instanceof Error ? error.message : "Failed to fetch today's listings",
        {
          error: String(error),
        },
      ),
    );
  }
}
