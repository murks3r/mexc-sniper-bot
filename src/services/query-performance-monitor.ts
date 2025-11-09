/**
 * Query Performance Monitor Stub
 *
 * Stub implementation for query performance monitoring.
 */

export const queryPerformanceMonitor = {
  recordQuery: (_query: string, _duration: number) => {},
  getStats: () => ({
    totalQueries: 0,
    averageDuration: 0,
    slowQueries: [],
  }),
  startMonitoring: () => {},
  stopMonitoring: () => {},
  wrapQuery: (_queryName: string, queryFn: any, _options?: any) => queryFn,
};
