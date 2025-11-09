import type {
  CalendarEntry,
  MexcServiceResponse,
  SymbolEntry,
} from "../data/modules/mexc-api-types";
import type { MexcCacheLayer } from "../data/modules/mexc-cache-layer";
import type { MexcCoreClient } from "../data/modules/mexc-core-client";

const CACHE_KEYS = {
  calendar: "mexc:calendar",
  symbols: "mexc:symbols",
  activity: (currency: string) => `mexc:activity:${currency.toUpperCase()}`,
  symbol: (symbol: string) => `mexc:symbol:${symbol.toUpperCase()}`,
};

export class UnifiedMexcCoreModule {
  constructor(
    private coreClient: MexcCoreClient,
    private cache: MexcCacheLayer,
  ) {}

  async getCalendarListings(): Promise<MexcServiceResponse<CalendarEntry[]>> {
    return this.cache.getOrSet(
      CACHE_KEYS.calendar,
      () => this.coreClient.getCalendarListings(),
      "static",
    );
  }

  async getSymbolsByVcoinId(vcoinId: string): Promise<MexcServiceResponse<SymbolEntry[]>> {
    const key = `${CACHE_KEYS.symbols}:vcoin:${vcoinId.toUpperCase()}`;
    return this.cache.getOrSet(
      key,
      () => this.coreClient.getSymbolsByVcoinId(vcoinId),
      "semiStatic",
    );
  }

  async getAllSymbols(): Promise<MexcServiceResponse<SymbolEntry[]>> {
    return this.cache.getOrSet(
      CACHE_KEYS.symbols,
      () => this.coreClient.getAllSymbols(),
      "semiStatic",
    );
  }

  async getServerTime(): Promise<MexcServiceResponse<number>> {
    return this.coreClient.getServerTime();
  }

  async getSymbolInfoBasic(symbolName: string): Promise<MexcServiceResponse<any>> {
    const key = CACHE_KEYS.symbol(symbolName);
    return this.cache.getOrSet(
      key,
      () => this.coreClient.getSymbolInfoBasic(symbolName),
      "semiStatic",
    );
  }

  async getActivityData(currency: string): Promise<MexcServiceResponse<any>> {
    const key = CACHE_KEYS.activity(currency);
    return this.cache.getOrSet(key, () => this.coreClient.getActivityData(currency), "semiStatic");
  }

  async getSymbolData(symbol: string): Promise<MexcServiceResponse<any>> {
    return this.getSymbolInfoBasic(symbol);
  }

  async getSymbolsForVcoins(vcoinIds: string[]): Promise<MexcServiceResponse<SymbolEntry[]>> {
    const responses = await Promise.all(vcoinIds.map((id) => this.getSymbolsByVcoinId(id)));
    const aggregated: SymbolEntry[] = [];
    for (const res of responses) {
      if (res.success && res.data) {
        aggregated.push(...res.data);
      }
    }
    return {
      success: true,
      data: aggregated,
      timestamp: Date.now(),
      source: "unified-mexc-core",
    };
  }

  async getSymbolsData(): Promise<
    MexcServiceResponse<
      Array<{ symbol: string; status: string; baseAsset: string; quoteAsset: string }>
    >
  > {
    const response = await this.getAllSymbols();
    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error || "Failed to retrieve symbols",
        timestamp: Date.now(),
        source: "unified-mexc-core",
      };
    }

    return {
      success: true,
      data: response.data.map((symbol) => ({
        symbol: symbol.symbol,
        status: symbol.status,
        baseAsset: symbol.baseAsset,
        quoteAsset: symbol.quoteAsset,
      })),
      timestamp: Date.now(),
      source: "unified-mexc-core",
    };
  }

  async getBulkActivityData(currencies: string[]): Promise<MexcServiceResponse<any[]>> {
    const responses = await Promise.all(
      currencies.map((currency) => this.getActivityData(currency)),
    );
    const data = responses
      .filter((result) => result.success && result.data)
      .flatMap((result) => (Array.isArray(result.data) ? result.data : [result.data]));

    const allSucceeded = responses.every((result) => result.success);

    return {
      success: allSucceeded,
      data,
      error: allSucceeded ? undefined : "One or more activity requests failed",
      timestamp: Date.now(),
      source: "unified-mexc-core",
    };
  }

  async hasRecentActivity(currency: string, timeframeMs = 24 * 60 * 60 * 1000): Promise<boolean> {
    const response = await this.getActivityData(currency);
    if (!response.success || !response.timestamp) {
      return false;
    }

    const responseTime =
      typeof response.timestamp === "string"
        ? new Date(response.timestamp).getTime()
        : response.timestamp;

    return responseTime > Date.now() - timeframeMs;
  }

  async testConnectivity(): Promise<MexcServiceResponse<{ serverTime: number; latency: number }>> {
    const start = Date.now();
    const response = await this.coreClient.getServerTime();
    if (!response.success || response.data === undefined) {
      return {
        success: false,
        error: response.error || "Unable to reach MEXC API",
        timestamp: Date.now(),
        source: "unified-mexc-core",
      };
    }

    return {
      success: true,
      data: {
        serverTime: response.data,
        latency: Date.now() - start,
      },
      timestamp: Date.now(),
      source: "unified-mexc-core",
    };
  }

  async testConnectivityWithResponse(): Promise<
    MexcServiceResponse<{
      serverTime: number;
      latency: number;
      connected: boolean;
      apiVersion: string;
      region: string;
    }>
  > {
    const connectivity = await this.testConnectivity();
    if (!connectivity.success || !connectivity.data) {
      return {
        success: false,
        error: connectivity.error || "Connectivity check failed",
        timestamp: Date.now(),
        source: "unified-mexc-core",
      };
    }

    return {
      success: true,
      data: {
        serverTime: connectivity.data.serverTime,
        latency: connectivity.data.latency,
        connected: true,
        apiVersion: "v3",
        region: "global",
      },
      timestamp: Date.now(),
      source: "unified-mexc-core",
    };
  }
}

