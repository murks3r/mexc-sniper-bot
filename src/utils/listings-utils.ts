/**
 * Generic utility functions for filtering calendar listings by date
 */

import { createSimpleLogger } from "../lib/unified-logger";
import type { CalendarEntry } from "../services/data/modules/calendar-listings.service";

const logger = createSimpleLogger("listings-utils");

/**
 * Check if a listing matches a specific date
 */
function isDateMatch(listing: CalendarEntry, targetDate: Date): boolean {
  if (!listing.tradingStartTime) {
    return false;
  }

  const listingDate = new Date(listing.tradingStartTime);

  // Reset time to compare dates only
  listingDate.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  return listingDate.getTime() === targetDate.getTime();
}

/**
 * Check if a listing is from today
 */
export function isTodayListing(listing: CalendarEntry): boolean {
  return isDateMatch(listing, new Date());
}

/**
 * Check if a listing is from tomorrow
 */
export function isTomorrowListing(listing: CalendarEntry): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isDateMatch(listing, tomorrow);
}

/**
 * Filter calendar listings to get only today's listings
 */
export function filterTodaysListings(listings: CalendarEntry[]): CalendarEntry[] {
  return listings.filter(isTodayListing);
}

/**
 * Filter calendar listings to get only tomorrow's listings
 */
export function filterTomorrowsListings(listings: CalendarEntry[]): CalendarEntry[] {
  return listings.filter(isTomorrowListing);
}

/**
 * Get listings for a specific date offset (0 = today, 1 = tomorrow, etc.)
 */
export async function getListingsByDate(
  getCalendarListings: () => Promise<{ success: boolean; data?: CalendarEntry[] }>,
  daysOffset: number = 0,
): Promise<CalendarEntry[]> {
  try {
    const response = await getCalendarListings();

    if (!response.success || !response.data) {
      return [];
    }

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysOffset);

    return response.data.filter((listing) => isDateMatch(listing, targetDate));
  } catch (error) {
    logger.error(`Error fetching listings for date offset ${daysOffset}`, { error });
    return [];
  }
}

/**
 * Check if a listing is within the next N hours
 */
export function isUpcomingListing(listing: CalendarEntry, hoursAhead: number = 48): boolean {
  if (!listing.tradingStartTime) {
    return false;
  }

  const listingTime = new Date(listing.tradingStartTime).getTime();
  const now = Date.now();
  const futureTime = now + hoursAhead * 60 * 60 * 1000;

  return listingTime > now && listingTime <= futureTime;
}

