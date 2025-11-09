/**
 * Utility functions for filtering and working with tomorrow's listings
 */

import type { CalendarEntry } from "@/src/services/api/mexc-market-data";
import {
  filterTomorrowsListings,
  getListingsByDate,
  isTomorrowListing,
  isUpcomingListing,
} from "./listings-utils";

export { filterTomorrowsListings, isTomorrowListing, isUpcomingListing };

/**
 * Get tomorrow's listings from calendar data
 */
export async function getTomorrowsListings(
  getCalendarListings: () => Promise<{ success: boolean; data?: CalendarEntry[] }>,
): Promise<CalendarEntry[]> {
  return getListingsByDate(getCalendarListings, 1);
}
