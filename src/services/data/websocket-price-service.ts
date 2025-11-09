/**
 * WebSocket Price Service Stub
 *
 * Stub implementation for websocket price service.
 * Real implementation would connect to MEXC WebSocket API.
 */

type PriceUpdate = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: number;
};

export const webSocketPriceService = {
  subscribe: (_symbol: string, _callback: (priceUpdate: PriceUpdate) => void) => {
    // WebSocket price service not implemented
    return () => {}; // Unsubscribe function
  },
  unsubscribe: (_symbol: string) => {},
  getPrice: (_symbol: string): number | null => null,
  getCurrentPrice: (_symbol: string): number | null => null,
  isConnected: () => false,
  connect: async () => Promise.resolve(),
  disconnect: () => {},
  getStatus: () => ({
    isConnected: false,
    isConnecting: false,
    subscribedSymbols: [] as string[],
    cachedPrices: {} as Record<string, number>,
    reconnectAttempts: 0,
  }),
  getMemoryStats: () => ({
    current: null as { heapUsed: number; heapTotal: number } | null,
    peak: null as { heapUsed: number; heapTotal: number } | null,
    growthRate: 0,
  }),
};
