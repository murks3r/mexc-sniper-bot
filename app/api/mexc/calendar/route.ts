import {
  apiResponse,
  createErrorResponse,
  createSuccessResponse,
  HTTP_STATUS,
} from "@/src/lib/api-response";
import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";

export async function GET() {
  try {
    // Add timeout wrapper for service call
    const mexcService = getRecommendedMexcService();

    const calendarResponse = (await Promise.race([
      mexcService.getCalendarListings(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Service timeout")), 8000)),
      // biome-ignore lint/suspicious/noExplicitAny: Promise.race result type
    ])) as any;

    // Ensure data is always an array
    const calendarData = Array.isArray(calendarResponse?.data) ? calendarResponse.data : [];

    return apiResponse(
      createSuccessResponse(calendarData, {
        count: calendarData.length,
        cached: calendarResponse?.cached || false,
        executionTimeMs: calendarResponse?.executionTimeMs || 0,
        serviceLayer: true,
      }),
    );
  } catch (error) {
    // MEXC calendar fetch failed - propagate error properly instead of masking
    const errorMessage = error instanceof Error ? error.message : "Service temporarily unavailable";

    return apiResponse(
      createErrorResponse(errorMessage, {
        count: 0,
        serviceLayer: true,
        fallback: true,
      }),
      HTTP_STATUS.SERVICE_UNAVAILABLE,
    );
  }
}
