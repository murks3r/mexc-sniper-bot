/**
 * MEXC Market Data Service Stub
 *
 * Stub implementation for MEXC market data service.
 */

import { getUnifiedMexcServiceV2 } from "./unified-mexc-service-v2";

export const mexcMarketData = {
  getTodaysListings: async () => {
    const service = getUnifiedMexcServiceV2();
    return service.getCalendarListings();
  },
  getTomorrowsListings: async () => {
    const service = getUnifiedMexcServiceV2();
    return service.getCalendarListings();
  },
};
