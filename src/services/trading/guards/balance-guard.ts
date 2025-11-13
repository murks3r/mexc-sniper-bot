/**
 * BalanceGuard
 *
 * Real-time balance guard that:
 * - Integrates with websocket stream for real-time updates
 * - Blocks orders when free balance < required
 * - Maintains minimum balance buffer
 * - Periodically refreshes from API as fallback
 */

import { StructuredLoggerAdapter } from "@/src/lib/structured-logger-adapter";
import type { AsyncMexcClient } from "@/src/services/trading/clients/async-mexc-client";

interface BalanceGuardConfig {
  minBalanceBufferPercent: number; // Percentage buffer above required balance
  checkIntervalMs: number; // How often to refresh balance from API
}

interface Balance {
  asset: string;
  free: string;
  locked: string;
}

interface BalanceCheckResult {
  allowed: boolean;
  reason?: string;
  availableBalance?: number;
  requiredBalance?: number;
  bufferRequired?: number;
}

interface WebSocketBalanceUpdate {
  asset: string;
  free: string;
  locked: string;
}

export class BalanceGuard {
  private readonly logger: StructuredLoggerAdapter;
  private readonly client: AsyncMexcClient;
  private readonly config: BalanceGuardConfig;
  private balances: Map<string, Balance> = new Map();
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private lastWebSocketUpdate: Map<string, number> = new Map();
  private websocketStaleThresholdMs = 5000; // Consider websocket stale after 5s

  constructor(client: AsyncMexcClient, config: BalanceGuardConfig) {
    this.client = client;
    this.config = config;
    this.logger = new StructuredLoggerAdapter();
  }

  /**
   * Start periodic balance refresh
   */
  start(): void {
    if (this.refreshInterval) {
      return; // Already started
    }

    // Initial balance fetch
    this.refreshBalance().catch((error) => {
      this.logger.error("Failed to fetch initial balance", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Periodic refresh
    this.refreshInterval = setInterval(() => {
      this.refreshBalance().catch((error) => {
        this.logger.error("Failed to refresh balance", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.config.checkIntervalMs);

    this.logger.info("Balance guard started", {
      checkIntervalMs: this.config.checkIntervalMs,
      bufferPercent: this.config.minBalanceBufferPercent,
    });
  }

  /**
   * Stop periodic refresh
   */
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    this.logger.info("Balance guard stopped");
  }

  /**
   * Refresh balance from API
   * Only updates balances that don't have fresh websocket data
   */
  private async refreshBalance(): Promise<void> {
    try {
      const accountInfo = await this.client.getAccountInfo();
      const balances = accountInfo.balances || [];

      const now = Date.now();
      for (const balance of balances) {
        // Only update if websocket data is stale or doesn't exist
        const lastWebSocketUpdate = this.lastWebSocketUpdate.get(balance.asset);
        const isWebSocketFresh =
          lastWebSocketUpdate && now - lastWebSocketUpdate <= this.websocketStaleThresholdMs;

        if (!isWebSocketFresh) {
          this.balances.set(balance.asset, {
            asset: balance.asset,
            free: balance.free,
            locked: balance.locked,
          });
        } else {
          this.logger.debug("Skipping API refresh for asset with fresh websocket data", {
            asset: balance.asset,
          });
        }
      }

      this.logger.debug("Balance refreshed from API", {
        assetCount: balances.length,
      });
    } catch (error) {
      this.logger.error("Failed to refresh balance from API", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update balance from websocket stream
   */
  updateBalanceFromWebSocket(update: WebSocketBalanceUpdate): void {
    const balance: Balance = {
      asset: update.asset,
      free: update.free,
      locked: update.locked,
    };

    this.balances.set(update.asset, balance);
    this.lastWebSocketUpdate.set(update.asset, Date.now());

    this.logger.debug("Balance updated from websocket", {
      asset: update.asset,
      free: update.free,
      locked: update.locked,
    });
  }

  /**
   * Check if order can be executed based on balance
   */
  async canExecuteOrder(asset: string, requiredBalance: number): Promise<BalanceCheckResult> {
    try {
      // Get current balance (prefer websocket if recent, otherwise API)
      let balance = this.balances.get(asset);

      // Check if websocket data is fresh for this asset
      const lastUpdate = this.lastWebSocketUpdate.get(asset);
      const isWebSocketFresh =
        lastUpdate && Date.now() - lastUpdate <= this.websocketStaleThresholdMs;

      // Only refresh from API if:
      // 1. No balance data exists for this asset, OR
      // 2. Balance exists but websocket data is stale
      if (!balance) {
        // No balance data, fetch from API
        await this.refreshBalance();
        balance = this.balances.get(asset);
      } else if (!isWebSocketFresh) {
        // Balance exists but websocket is stale, refresh from API
        await this.refreshBalance();
        balance = this.balances.get(asset);
      } else {
        // Use fresh websocket data
        this.logger.debug("Using fresh websocket balance data", {
          asset,
          free: balance.free,
        });
      }

      if (!balance) {
        return {
          allowed: false,
          reason: `Asset ${asset} not found in balance`,
          requiredBalance,
        };
      }

      const freeBalance = parseFloat(balance.free);
      const bufferRequired = requiredBalance * (1 + this.config.minBalanceBufferPercent / 100);
      const totalRequired = bufferRequired;

      this.logger.debug("Balance check", {
        asset,
        freeBalance,
        requiredBalance,
        bufferRequired: bufferRequired.toFixed(2),
        totalRequired: totalRequired.toFixed(2),
      });

      if (freeBalance >= totalRequired) {
        return {
          allowed: true,
          availableBalance: freeBalance,
          requiredBalance,
          bufferRequired,
        };
      } else {
        return {
          allowed: false,
          reason: `Insufficient balance: have ${freeBalance.toFixed(2)} ${asset}, need ${totalRequired.toFixed(2)} ${asset} (including ${this.config.minBalanceBufferPercent}% buffer)`,
          availableBalance: freeBalance,
          requiredBalance,
          bufferRequired,
        };
      }
    } catch (error) {
      this.logger.error("Error checking balance", {
        asset,
        requiredBalance,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fail-safe: block on error
      return {
        allowed: false,
        reason: `Error checking balance: ${error instanceof Error ? error.message : String(error)}`,
        requiredBalance,
      };
    }
  }

  /**
   * Get current balance for an asset
   */
  getBalance(asset: string): Balance | undefined {
    return this.balances.get(asset);
  }

  /**
   * Get all balances
   */
  getAllBalances(): Map<string, Balance> {
    return new Map(this.balances);
  }

  /**
   * Get guard status
   */
  getStatus(): {
    isRunning: boolean;
    monitoredAssets: string[];
    bufferPercent: number;
  } {
    return {
      isRunning: this.refreshInterval !== null,
      monitoredAssets: Array.from(this.balances.keys()),
      bufferPercent: this.config.minBalanceBufferPercent,
    };
  }
}
