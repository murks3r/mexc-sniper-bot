/**
 * MEXC Core HTTP Client
 *
 * Lightweight HTTP client with authentication for MEXC API communication.
 * Extracted from core client for better separation of concerns.
 */

import type { MexcApiConfig, MexcApiResponse, MexcServiceResponse } from "./mexc-api-types";

// ============================================================================
// HTTP Client with Authentication
// ============================================================================

export class MexcCoreHttpClient {
  // Simple console logger to avoid webpack bundling issues
  private logger = {
    info: (_message: string, _context?: any) => {
      // Logging handled by structured logger
    },
    warn: (_message: string, _context?: any) => {
      // Logging handled by structured logger
    },
    error: (_message: string, _context?: any) => {
      // Logging handled by structured logger
    },
    debug: (_message: string, _context?: any) => {
      // Logging handled by structured logger
    },
  };

  private config: MexcApiConfig;
  private baseHeaders: Record<string, string>;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private readonly maxRequestsPerSecond = 10; // MEXC API limit

  constructor(config: MexcApiConfig) {
    this.config = config;
    this.baseHeaders = {
      "Content-Type": "application/json",
      "User-Agent": "MEXC-Sniper-Bot/2.0",
    };
  }

  // ============================================================================
  // Public HTTP Methods
  // ============================================================================

  /**
   * Make a basic HTTP request
   */
  async makeRequest(
    url: string,
    options: RequestInit & { timeout?: number } = {},
  ): Promise<MexcApiResponse> {
    const { timeout = this.config.timeout, ...fetchOptions } = options;

    // Apply rate limiting
    await this.applyRateLimit();

    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          ...this.baseHeaders,
          ...fetchOptions.headers,
        },
        signal: controller.signal,
      });

      // Handle rate limit responses from MEXC
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : this.config.rateLimitDelay * 2;

        this.logger.warn(`Rate limited by MEXC API. Waiting ${delay}ms before retry`);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry once after rate limit delay
        return this.makeRequest(url, options);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const parsed = await response.json();
      // Normalize public API responses to a consistent shape with `.data`
      // If response already includes `{ code, data, success }`, pass through
      if (
        parsed &&
        typeof parsed === "object" &&
        Object.hasOwn(parsed, "data") &&
        Object.hasOwn(parsed, "code")
      ) {
        return parsed;
      }
      // Otherwise, wrap raw payload under `data` for callers expecting `.data`
      return {
        code: 200,
        data: parsed,
        success: true,
      } as MexcApiResponse;
    } catch (error) {
      // Handle AbortError from timeout
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Make an authenticated HTTP request
   */
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<MexcApiResponse> {
    // Add authentication to URL and headers (and body for POST)
    const { authenticatedUrl, authHeaders, body } = this.generateAuthUrlAndHeaders(url, options);

    return this.makeRequest(authenticatedUrl, {
      ...options,
      headers: {
        ...options.headers,
        ...authHeaders,
      },
      // Use body for POST requests (SLICE 3.2)
      body: body || options.body,
    });
  }

  /**
   * Handle errors consistently across all methods
   */
  handleError(error: unknown, methodName: string, _startTime: number): MexcServiceResponse<never> {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    this.logger.error(`[MexcCoreHttpClient.${methodName}] Error:`, errorMessage);

    return {
      success: false,
      error: errorMessage,
      timestamp: Date.now(),
      source: "mexc-core-http",
    };
  }

  // ============================================================================
  // Private Rate Limiting Methods
  // ============================================================================

  /**
   * Apply rate limiting to prevent exceeding MEXC API limits
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Reset request count every second
    if (timeSinceLastRequest >= 1000) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }

    // If we've reached the max requests per second, wait
    if (this.requestCount >= this.maxRequestsPerSecond) {
      const waitTime = 1000 - timeSinceLastRequest;
      if (waitTime > 0) {
        this.logger.debug(`Rate limiting: waiting ${waitTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
      }
    }

    // Apply minimum delay between requests
    if (timeSinceLastRequest < this.config.rateLimitDelay && this.requestCount > 0) {
      const minDelay = this.config.rateLimitDelay - timeSinceLastRequest;
      if (minDelay > 0) {
        this.logger.debug(`Minimum delay: waiting ${minDelay}ms`);
        await new Promise((resolve) => setTimeout(resolve, minDelay));
      }
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();
  }

  // ============================================================================
  // Private Authentication Methods
  // ============================================================================

  /**
   * Generate authentication URL and headers
   *
   * SLICE 3.2 FIX: Proper HMAC-SHA256 signature for POST with body
   *
   * For POST requests, MEXC requires:
   * - All parameters in the body (application/x-www-form-urlencoded)
   * - totalParams = all parameters (including timestamp, recvWindow)
   * - Signature calculated from totalParams
   * - Signature appended to totalParams
   */
  private generateAuthUrlAndHeaders(
    url: string,
    options: RequestInit = {},
  ): {
    authenticatedUrl: string;
    authHeaders: Record<string, string>;
    body?: string;
  } {
    const method = options.method?.toUpperCase() || "GET";

    // For GET requests, use query string
    if (method === "GET" || method === "DELETE") {
      const urlObj = new URL(url);
      const queryString = urlObj.search ? urlObj.search.substring(1) : "";

      // Sign the query string
      const signature = this.createSignature(queryString);

      // Add signature to URL
      const separator = urlObj.search ? "&" : "?";
      const authenticatedUrl = `${url}${separator}signature=${signature}`;

      const authHeaders = {
        "X-MEXC-APIKEY": this.config.apiKey,
        "Content-Type": "application/json",
      };

      return { authenticatedUrl, authHeaders };
    }

    // For POST requests, use body-based signing (SLICE 3.2)
    // This is the correct approach per MEXC API documentation
    const urlObj = new URL(url);
    const queryString = urlObj.search ? urlObj.search.substring(1) : "";

    // Build totalParams string (all parameters without signature)
    const totalParams = queryString;

    // Generate signature
    const signature = this.createSignature(totalParams);

    // Build final body payload with signature
    const bodyPayload = `${totalParams}&signature=${signature}`;

    const authHeaders = {
      "X-MEXC-APIKEY": this.config.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Return base URL (without query string) and body
    return {
      authenticatedUrl: `${urlObj.origin}${urlObj.pathname}`,
      authHeaders,
      body: bodyPayload,
    };
  }

  private createSignature(data: string): string {
    if (typeof window !== "undefined") {
      // Browser environment - return a placeholder
      this.logger.warn("MEXC API signatures cannot be generated in browser environment");
      return "browser-placeholder";
    }

    try {
      const crypto = require("node:crypto");
      return crypto.createHmac("sha256", this.config.secretKey).update(data).digest("hex");
    } catch (error) {
      this.logger.error("Failed to create MEXC signature:", error);
      return "signature-error";
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Parse timestamp from various formats
   */
  parseTimestamp(timestamp: any): number {
    if (typeof timestamp === "string") {
      return new Date(timestamp).getTime();
    }
    return timestamp || Date.now();
  }

  /**
   * Get configuration
   */
  getConfig(): MexcApiConfig {
    return this.config;
  }

  /**
   * Get rate limiting statistics for monitoring
   */
  getRateLimitStats(): {
    requestCount: number;
    maxRequestsPerSecond: number;
    timeSinceLastRequest: number;
    rateLimitDelay: number;
  } {
    return {
      requestCount: this.requestCount,
      maxRequestsPerSecond: this.maxRequestsPerSecond,
      timeSinceLastRequest: Date.now() - this.lastRequestTime,
      rateLimitDelay: this.config.rateLimitDelay,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new MEXC HTTP client instance
 */
export function createMexcCoreHttpClient(config: MexcApiConfig): MexcCoreHttpClient {
  return new MexcCoreHttpClient(config);
}

// ============================================================================
// Exports
// ============================================================================

export default MexcCoreHttpClient;
