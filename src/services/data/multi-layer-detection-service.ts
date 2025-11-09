/**
 * Multi-Layer Detection Service
 *
 * Implements a comprehensive fallback strategy for detecting new listings:
 * - Layer 1: Calendar API (30s intervals)
 * - Layer 2: SymbolsV2 pattern detection (15s intervals) - sts:2, st:2, tt:4
 * - Layer 3: Exchange info polling (60s intervals)
 * - Layer 4: WebSocket monitoring (real-time)
 */

import { EventEmitter } from "node:events";
import type { SymbolEntry } from "@/src/services/api/mexc-client-types";
import type { CalendarEntry } from "@/src/services/api/mexc-market-data";
import { getRecommendedMexcService } from "@/src/services/api/mexc-unified-exports";

export interface DetectionResult {
  source: "calendar" | "symbolsv2" | "exchange_info" | "websocket";
  timestamp: number;
  listings: CalendarEntry[];
  patterns?: SymbolEntry[];
  success: boolean;
  error?: string;
}

export interface MultiLayerConfig {
  enableLayer1: boolean; // Calendar API
  enableLayer2: boolean; // SymbolsV2 pattern detection
  enableLayer3: boolean; // Exchange info polling
  enableLayer4: boolean; // WebSocket monitoring
  layer1Interval: number; // Calendar API interval (ms) - default 30000
  layer2Interval: number; // SymbolsV2 interval (ms) - default 15000
  layer3Interval: number; // Exchange info interval (ms) - default 60000
}

export class MultiLayerDetectionService extends EventEmitter {
  private mexcService = getRecommendedMexcService();
  private config: MultiLayerConfig;
  private layer1Timer: NodeJS.Timeout | null = null;
  private layer2Timer: NodeJS.Timeout | null = null;
  private layer3Timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastResults: Map<string, DetectionResult> = new Map();
  private detectedListings: Map<string, CalendarEntry> = new Map();

  constructor(config: Partial<MultiLayerConfig> = {}) {
    super();
    this.config = {
      enableLayer1: true,
      enableLayer2: true,
      enableLayer3: true,
      enableLayer4: false, // WebSocket handled separately
      layer1Interval: 30000, // 30 seconds
      layer2Interval: 15000, // 15 seconds
      layer3Interval: 60000, // 60 seconds
      ...config,
    };
  }

  /**
   * Start all enabled detection layers
   */
  start(): void {
    if (this.isRunning) {
      console.warn("[MultiLayerDetection] Service already running");
      return;
    }

    this.isRunning = true;
    console.info("[MultiLayerDetection] Starting multi-layer detection service");

    // Layer 1: Calendar API (30s intervals)
    if (this.config.enableLayer1) {
      this.startLayer1();
    }

    // Layer 2: SymbolsV2 pattern detection (15s intervals)
    if (this.config.enableLayer2) {
      this.startLayer2();
    }

    // Layer 3: Exchange info polling (60s intervals)
    if (this.config.enableLayer3) {
      this.startLayer3();
    }

    // Layer 4: WebSocket is handled by separate WebSocket service
    if (this.config.enableLayer4) {
      console.info("[MultiLayerDetection] WebSocket monitoring should be started separately");
    }
  }

  /**
   * Stop all detection layers
   */
  stop(): void {
    this.isRunning = false;

    if (this.layer1Timer) {
      clearInterval(this.layer1Timer);
      this.layer1Timer = null;
    }

    if (this.layer2Timer) {
      clearInterval(this.layer2Timer);
      this.layer2Timer = null;
    }

    if (this.layer3Timer) {
      clearInterval(this.layer3Timer);
      this.layer3Timer = null;
    }

    console.info("[MultiLayerDetection] Stopped all detection layers");
  }

  /**
   * Layer 1: Calendar API polling (30s intervals)
   */
  private startLayer1(): void {
    console.info(
      `[MultiLayerDetection] Starting Layer 1: Calendar API (${this.config.layer1Interval}ms)`,
    );

    // Execute immediately
    this.executeLayer1();

    // Then set interval
    this.layer1Timer = setInterval(() => {
      this.executeLayer1();
    }, this.config.layer1Interval);
  }

  private async executeLayer1(): Promise<void> {
    try {
      const timestamp = Date.now();
      const result = await this.fetchCalendarAPI(timestamp);

      this.lastResults.set("layer1", result);
      this.processDetectionResult(result);

      if (result.success && result.listings.length > 0) {
        this.emit("detection", result);
        console.info(`[MultiLayerDetection] Layer 1 detected ${result.listings.length} listings`);
      }
    } catch (error) {
      console.error("[MultiLayerDetection] Layer 1 error:", error);
      this.emit("error", {
        layer: "layer1",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Layer 2: SymbolsV2 pattern detection (15s intervals) - sts:2, st:2, tt:4
   */
  private startLayer2(): void {
    console.info(
      `[MultiLayerDetection] Starting Layer 2: SymbolsV2 pattern detection (${this.config.layer2Interval}ms)`,
    );

    // Execute immediately
    this.executeLayer2();

    // Then set interval
    this.layer2Timer = setInterval(() => {
      this.executeLayer2();
    }, this.config.layer2Interval);
  }

  private async executeLayer2(): Promise<void> {
    try {
      const result = await this.fetchSymbolsV2Patterns();

      this.lastResults.set("layer2", result);
      this.processDetectionResult(result);

      if (result.success && result.patterns && result.patterns.length > 0) {
        this.emit("detection", result);
        console.info(
          `[MultiLayerDetection] Layer 2 detected ${result.patterns.length} ready state patterns`,
        );
      }
    } catch (error) {
      console.error("[MultiLayerDetection] Layer 2 error:", error);
      this.emit("error", {
        layer: "layer2",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Layer 3: Exchange info polling (60s intervals)
   */
  private startLayer3(): void {
    console.info(
      `[MultiLayerDetection] Starting Layer 3: Exchange info polling (${this.config.layer3Interval}ms)`,
    );

    // Execute immediately
    this.executeLayer3();

    // Then set interval
    this.layer3Timer = setInterval(() => {
      this.executeLayer3();
    }, this.config.layer3Interval);
  }

  private async executeLayer3(): Promise<void> {
    try {
      const result = await this.fetchExchangeInfo();

      this.lastResults.set("layer3", result);
      this.processDetectionResult(result);

      if (result.success && result.listings.length > 0) {
        this.emit("detection", result);
        console.info(
          `[MultiLayerDetection] Layer 3 detected ${result.listings.length} new symbols`,
        );
      }
    } catch (error) {
      console.error("[MultiLayerDetection] Layer 3 error:", error);
      this.emit("error", {
        layer: "layer3",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fetch calendar API with proper timestamp handling
   */
  private async fetchCalendarAPI(timestamp: number): Promise<DetectionResult> {
    try {
      const url = `https://www.mexc.com/api/operation/new_coin_calendar?timestamp=${timestamp}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`Calendar API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Handle MEXC response structure: data.newCoins
      let listings: CalendarEntry[] = [];
      if (data?.data?.newCoins && Array.isArray(data.data.newCoins)) {
        listings = data.data.newCoins
          .filter((entry: any) => entry?.vcoinId && entry?.vcoinName && entry?.firstOpenTime)
          .map(
            (entry: any): CalendarEntry => ({
              vcoinId: String(entry.vcoinId),
              symbol: String(entry.vcoinName),
              projectName: String(entry.vcoinNameFull || entry.vcoinName),
              firstOpenTime: Number(entry.firstOpenTime),
            }),
          );
      }

      return {
        source: "calendar",
        timestamp: Date.now(),
        listings,
        success: true,
      };
    } catch (error) {
      return {
        source: "calendar",
        timestamp: Date.now(),
        listings: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Fetch SymbolsV2 and detect ready state patterns (sts:2, st:2, tt:4)
   */
  private async fetchSymbolsV2Patterns(): Promise<DetectionResult> {
    try {
      const symbolsResponse = await this.mexcService.getSymbolsData();

      if (!symbolsResponse.success || !symbolsResponse.data) {
        throw new Error("Failed to fetch symbols data");
      }

      const symbols = symbolsResponse.data as any[];

      // Filter for ready state pattern: sts:2, st:2, tt:4
      const readyPatterns = symbols.filter(
        (symbol: any) => symbol.sts === 2 && symbol.st === 2 && symbol.tt === 4,
      );

      // Convert patterns to calendar entries
      const listings: CalendarEntry[] = readyPatterns.map((symbol: any) => ({
        vcoinId: String(symbol.vcoinId || symbol.id || ""),
        symbol: String(symbol.symbol || symbol.vcoinName || ""),
        projectName: String(symbol.projectName || symbol.symbol || ""),
        firstOpenTime: Date.now(), // Pattern detected now
      }));

      return {
        source: "symbolsv2",
        timestamp: Date.now(),
        listings,
        patterns: readyPatterns as SymbolEntry[],
        success: true,
      };
    } catch (error) {
      return {
        source: "symbolsv2",
        timestamp: Date.now(),
        listings: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Fetch exchange info for new symbols
   */
  private async fetchExchangeInfo(): Promise<DetectionResult> {
    try {
      const exchangeInfo = await this.mexcService.getExchangeInfo();

      if (!exchangeInfo.success || !exchangeInfo.data) {
        throw new Error("Failed to fetch exchange info");
      }

      // Extract new symbols from exchange info
      const symbols = exchangeInfo.data.symbols || [];

      // Convert to calendar entries (simplified)
      const listings: CalendarEntry[] = symbols
        .filter((symbol: any) => symbol.status === "TRADING")
        .map((symbol: any) => ({
          vcoinId: String(symbol.baseAsset || symbol.symbol || ""),
          symbol: String(symbol.symbol || ""),
          projectName: String(symbol.baseAsset || symbol.symbol || ""),
          firstOpenTime: Date.now(),
        }));

      return {
        source: "exchange_info",
        timestamp: Date.now(),
        listings,
        success: true,
      };
    } catch (error) {
      return {
        source: "exchange_info",
        timestamp: Date.now(),
        listings: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process detection results and deduplicate listings
   */
  private processDetectionResult(result: DetectionResult): void {
    if (!result.success || result.listings.length === 0) {
      return;
    }

    let newListings = 0;
    for (const listing of result.listings) {
      const key = listing.vcoinId || listing.symbol;
      if (!this.detectedListings.has(key)) {
        this.detectedListings.set(key, listing);
        newListings++;
      }
    }

    if (newListings > 0) {
      console.info(
        `[MultiLayerDetection] Detected ${newListings} new listings from ${result.source}`,
      );
    }
  }

  /**
   * Get all detected listings
   */
  getDetectedListings(): CalendarEntry[] {
    return Array.from(this.detectedListings.values());
  }

  /**
   * Get last results from each layer
   */
  getLastResults(): Map<string, DetectionResult> {
    return new Map(this.lastResults);
  }

  /**
   * Get service status
   */
  getStatus(): {
    isRunning: boolean;
    activeLayers: string[];
    detectedCount: number;
  } {
    return {
      isRunning: this.isRunning,
      activeLayers: [
        this.config.enableLayer1 && this.layer1Timer ? "layer1" : null,
        this.config.enableLayer2 && this.layer2Timer ? "layer2" : null,
        this.config.enableLayer3 && this.layer3Timer ? "layer3" : null,
        this.config.enableLayer4 ? "layer4" : null,
      ].filter((layer): layer is string => layer !== null),
      detectedCount: this.detectedListings.size,
    };
  }
}

// Singleton instance
let multiLayerDetectionService: MultiLayerDetectionService | null = null;

export function getMultiLayerDetectionService(
  config?: Partial<MultiLayerConfig>,
): MultiLayerDetectionService {
  if (!multiLayerDetectionService) {
    multiLayerDetectionService = new MultiLayerDetectionService(config);
  }
  return multiLayerDetectionService;
}
