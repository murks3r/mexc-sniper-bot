import type { MexcServiceResponse } from "../data/modules/mexc-api-types";
import type { MexcCacheLayer } from "../data/modules/mexc-cache-layer";
import type { MexcCoreClient } from "../data/modules/mexc-core-client";
import type { OrderData } from "../data/modules/mexc-core-trading";

export interface SymbolTickerData {
  symbol: string;
  price: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  timestamp?: number;
}

export interface OrderBookData {
  bids: [string, string][];
  asks: [string, string][];
  lastUpdateId: number;
}

export interface RecentActivityData {
  symbol: string;
  trades: Array<{ price: string; quantity: string; timestamp: number }>;
}

export interface TradingOrderData {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity?: string;
  price?: string;
  stopPrice?: string;
  timeInForce?: "GTC" | "IOC" | "FOK";
  quoteOrderQty?: string;
  paperTrade?: boolean;
}

export class UnifiedMexcTradingModule {
  constructor(
    private coreClient: MexcCoreClient,
    private cache: MexcCacheLayer,
  ) {}

  private normalizeOrder(data: TradingOrderData): OrderData {
    // quantity is required by OrderData type, but can be empty if quoteOrderQty is provided
    // For MARKET BUY orders, quoteOrderQty is used instead of quantity
    const quantity =
      typeof data.quantity === "string" && data.quantity.trim().length > 0
        ? data.quantity
        : data.quoteOrderQty && data.type === "MARKET" && data.side === "BUY"
          ? "" // Empty quantity when using quoteOrderQty for MARKET BUY
          : ""; // Default empty string (will be validated by API)

    const normalized: OrderData = {
      symbol: data.symbol,
      side: data.side,
      type: data.type,
      quantity,
      price: data.price,
      timeInForce: data.timeInForce,
    };

    if (typeof data.quoteOrderQty === "string" && data.quoteOrderQty.trim().length > 0) {
      normalized.quoteOrderQty = data.quoteOrderQty;
    }

    return normalized;
  }

  async getTicker(symbol: string): Promise<MexcServiceResponse<any>> {
    const key = `mexc:ticker:${symbol.toUpperCase()}`;
    return this.cache.getOrSet(key, () => this.coreClient.getTicker(symbol), "realTime");
  }

  async getSymbolTicker(symbol: string): Promise<MexcServiceResponse<SymbolTickerData>> {
    const response = await this.getTicker(symbol);
    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error || "Failed to fetch ticker",
        timestamp: Date.now(),
        source: "unified-mexc-trading",
      };
    }

    return {
      success: true,
      data: {
        symbol,
        price: response.data.price || response.data.lastPrice || "0",
        lastPrice: response.data.lastPrice || response.data.price || "0",
        priceChangePercent: response.data.priceChangePercent || "0",
        volume: response.data.volume || "0",
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
      source: "unified-mexc-trading",
    };
  }

  async getOrderBook(symbol: string, limit = 20): Promise<MexcServiceResponse<OrderBookData>> {
    const key = `mexc:orderbook:${symbol.toUpperCase()}:${limit}`;
    return this.cache.getOrSet(key, () => this.coreClient.getOrderBook(symbol, limit), "realTime");
  }

  async getRecentActivity(
    symbol: string,
    hours = 24,
  ): Promise<MexcServiceResponse<RecentActivityData>> {
    const endTime = Date.now();
    const startTime = endTime - hours * 60 * 60 * 1000;
    const response = await this.coreClient.getUserTrades({ symbol, startTime, endTime, limit: 50 });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error || "Failed to load trade history",
        timestamp: Date.now(),
        source: "unified-mexc-trading",
      };
    }

    const trades = response.data.map((trade: any) => ({
      price: String(trade.price || trade.p || "0"),
      quantity: String(trade.qty || trade.quantity || "0"),
      timestamp: trade.time || trade.timestamp || Date.now(),
    }));

    return {
      success: true,
      data: {
        symbol,
        trades,
      },
      timestamp: Date.now(),
      source: "unified-mexc-trading",
    };
  }

  async placeOrder(orderData: TradingOrderData): Promise<MexcServiceResponse<any>> {
    const normalized = this.normalizeOrder(orderData);
    return this.coreClient.placeOrder(normalized);
  }

  async createOrder(orderData: TradingOrderData): Promise<MexcServiceResponse<any>> {
    return this.placeOrder(orderData);
  }

  async executeTrade(orderData: TradingOrderData): Promise<MexcServiceResponse<any>> {
    return this.placeOrder(orderData);
  }
}
