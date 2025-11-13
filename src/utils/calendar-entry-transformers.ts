/**
 * Calendar Entry Transformation Utilities
 *
 * Shared utilities for transforming MEXC calendar API responses
 * Eliminates duplication across multiple files
 */

import type { CalendarEntry } from "../schemas/unified/mexc-api-schemas";

/**
 * Transform raw MEXC calendar API response to standardized CalendarEntry format
 */
export function transformMexcCalendarEntry(coin: {
  vcoinId?: string;
  id?: string;
  vcoinName?: string;
  symbol?: string;
  vcoinNameFull?: string;
  projectName?: string;
  firstOpenTime?: number | string;
  first_open_time?: number | string;
  zone?: string;
}): CalendarEntry {
  // Parse timestamp - handle both seconds and milliseconds
  let firstOpenTime: number;
  const rawTime = coin.firstOpenTime ?? coin.first_open_time;

  if (typeof rawTime === "number") {
    // If less than 1e12, assume seconds and convert to milliseconds
    firstOpenTime = rawTime < 1e12 ? rawTime * 1000 : rawTime;
  } else if (typeof rawTime === "string") {
    const parsed = Date.parse(rawTime);
    firstOpenTime = Number.isFinite(parsed) ? parsed : Date.now();
  } else {
    firstOpenTime = Date.now();
  }

  return {
    vcoinId: coin.vcoinId ?? coin.id ?? "",
    symbol: coin.vcoinName ?? coin.symbol ?? coin.vcoinId ?? "",
    projectName: coin.vcoinNameFull ?? coin.projectName ?? coin.vcoinName ?? "",
    firstOpenTime,
    vcoinName: coin.vcoinName,
    vcoinNameFull: coin.vcoinNameFull ?? coin.projectName ?? coin.vcoinName ?? "",
    zone: coin.zone,
  };
}

/**
 * Transform array of raw MEXC calendar entries
 */
export function transformMexcCalendarEntries(
  coins: Array<{
    vcoinId?: string;
    id?: string;
    vcoinName?: string;
    symbol?: string;
    vcoinNameFull?: string;
    projectName?: string;
    firstOpenTime?: number | string;
    first_open_time?: number | string;
    zone?: string;
  }>,
): CalendarEntry[] {
  return coins.map(transformMexcCalendarEntry);
}

/**
 * Transform calendar entry to sync service format
 */
export function transformCalendarEntryForSync(entry: CalendarEntry): {
  vcoinId: string;
  vcoinNameFull: string;
  firstOpenTime: number;
  symbol?: string;
} {
  return {
    vcoinId: entry.vcoinId,
    vcoinNameFull: entry.vcoinNameFull ?? entry.projectName ?? entry.vcoinId,
    firstOpenTime:
      typeof entry.firstOpenTime === "number"
        ? entry.firstOpenTime
        : new Date(entry.firstOpenTime).getTime(),
    symbol: entry.symbol,
  };
}

/**
 * Filter calendar entries by status
 */
export function filterCalendarEntriesByStatus<T extends { status?: string }>(
  entries: T[],
  statuses: string[],
): T[] {
  return entries.filter((entry) => entry.status && statuses.includes(entry.status));
}

/**
 * Filter calendar entries by date range
 */
export function filterCalendarEntriesByDateRange(
  entries: CalendarEntry[],
  startDate: Date,
  endDate: Date,
): CalendarEntry[] {
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  return entries.filter((entry) => {
    const entryTime =
      typeof entry.firstOpenTime === "number"
        ? entry.firstOpenTime
        : new Date(entry.firstOpenTime).getTime();
    return entryTime >= startTime && entryTime <= endTime;
  });
}

/**
 * Sort calendar entries by launch time (ascending)
 */
export function sortCalendarEntriesByLaunchTime(
  entries: CalendarEntry[],
  ascending = true,
): CalendarEntry[] {
  return [...entries].sort((a, b) => {
    const timeA =
      typeof a.firstOpenTime === "number" ? a.firstOpenTime : new Date(a.firstOpenTime).getTime();
    const timeB =
      typeof b.firstOpenTime === "number" ? b.firstOpenTime : new Date(b.firstOpenTime).getTime();
    return ascending ? timeA - timeB : timeB - timeA;
  });
}
