/**
 * Utility functions for filtering and working with today's listings
 */

import type { CalendarEntry } from "@/src/services/api/mexc-market-data";
import {
  filterTodaysListings,
  getListingsByDate,
  isTodayListing,
} from "./listings-utils";

export { filterTodaysListings, isTodayListing };

/**
 * Get today's listings from calendar data
 */
export async function getTodaysListings(
  getCalendarListings: () => Promise<{ success: boolean; data?: CalendarEntry[] }>,
): Promise<CalendarEntry[]> {
  return getListingsByDate(getCalendarListings, 0);
}
