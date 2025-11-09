/**
 * Unified Auto-Sniping Orchestrator - Minimal Wrapper
 *
 * Provides a unified interface for auto-sniping control and monitoring.
 * This is a thin wrapper around the CoreTradingService.
 */

import { getCoreTrading } from "./consolidated/core-trading/base-service";
import type {
  CoreTradingConfig,
  ServiceResponse,
  ServiceStatus,
} from "./consolidated/core-trading/types";

interface OrchestrationStatus extends ServiceStatus {
  isInitialized: boolean;
  isActive: boolean;
  autoSnipingEnabled: boolean;
  activePositions: number;
  processedTargets: number;
  metrics?: {
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
  };
}

/**
 * Unified Auto-Sniping Orchestrator
 *
 * Main orchestrator for auto-sniping operations.
 * Provides a unified interface for starting, stopping, and monitoring auto-sniping.
 */
class UnifiedAutoSnipingOrchestrator {
  private static instance: UnifiedAutoSnipingOrchestrator | null = null;

  private constructor() {}

  static getInstance(): UnifiedAutoSnipingOrchestrator {
    if (!UnifiedAutoSnipingOrchestrator.instance) {
      UnifiedAutoSnipingOrchestrator.instance = new UnifiedAutoSnipingOrchestrator();
    }
    return UnifiedAutoSnipingOrchestrator.instance;
  }

  private isInitialized = false;

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    const coreTrading = getCoreTrading();
    const _status = await coreTrading.getStatus();
    if (!this.isInitialized) {
      await coreTrading.initialize();
      this.isInitialized = true;
    }
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<OrchestrationStatus> {
    const coreTrading = getCoreTrading();
    const baseStatus = await coreTrading.getStatus();
    const executionReport = this.getExecutionReport();

    return {
      ...baseStatus,
      isInitialized: this.isInitialized,
      isActive: baseStatus.autoSnipingEnabled && baseStatus.isHealthy,
      autoSnipingEnabled: baseStatus.autoSnipingEnabled,
      activePositions: baseStatus.activePositions,
      processedTargets: executionReport.totalTrades || 0,
      metrics: {
        totalTrades: executionReport.totalTrades || 0,
        successfulTrades: executionReport.successfulTrades || 0,
        failedTrades: executionReport.failedTrades || 0,
      },
    };
  }

  /**
   * Start auto-sniping
   */
  async startAutoSniping(): Promise<ServiceResponse> {
    try {
      const coreTrading = getCoreTrading();
      
      // CRITICAL: Ensure auto-sniping is enabled before starting
      const currentConfig = await coreTrading.getServiceStatus();
      if (!currentConfig.autoSnipingEnabled) {
        await coreTrading.updateConfig({ autoSnipingEnabled: true });
      }
      
      const result = await coreTrading.startAutoSniping();
      
      // Verify it actually started
      const statusAfterStart = await coreTrading.getServiceStatus();
      if (!statusAfterStart.autoSnipingEnabled) {
        return {
          success: false,
          error: "Auto-sniping failed to start - status check failed",
          timestamp: new Date().toISOString(),
        };
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to start auto-sniping",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Stop auto-sniping
   */
  async stopAutoSniping(): Promise<ServiceResponse> {
    try {
      const coreTrading = getCoreTrading();
      const result = await coreTrading.stopAutoSniping();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stop auto-sniping",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Update orchestrator configuration
   */
  async updateConfig(config: Partial<{ enabled: boolean; mexcConfig?: unknown }>): Promise<void> {
    const coreTrading = getCoreTrading();
    
    // Convert config to CoreTradingConfig format
    const updates: Partial<CoreTradingConfig> = {};
    
    if (config.enabled !== undefined) {
      updates.autoSnipingEnabled = config.enabled;
    }
    
    // Handle MEXC config updates
    if (config.mexcConfig && typeof config.mexcConfig === "object") {
      const mexcConfig = config.mexcConfig as {
        credentials?: { apiKey?: string; secretKey?: string };
        paperTradingMode?: boolean;
      };
      
      if (mexcConfig.credentials) {
        updates.apiKey = mexcConfig.credentials.apiKey || updates.apiKey;
        updates.secretKey = mexcConfig.credentials.secretKey || updates.secretKey;
      }
      
      if (mexcConfig.paperTradingMode !== undefined) {
        updates.paperTradingMode = mexcConfig.paperTradingMode;
      }
    }
    
    // Update CoreTradingService config
    await coreTrading.updateConfig(updates);
  }

  /**
   * Get orchestrator configuration
   */
  getConfig(): { enabled: boolean } {
    const coreTrading = getCoreTrading();
    return (
      (coreTrading as { getConfig?: () => { enabled: boolean } }).getConfig?.() ?? {
        enabled: false,
      }
    );
  }

  /**
   * Start auto-sniping (alias for startAutoSniping)
   */
  async start(): Promise<ServiceResponse> {
    return this.startAutoSniping();
  }

  /**
   * Stop auto-sniping (alias for stopAutoSniping)
   */
  async stop(): Promise<ServiceResponse> {
    return this.stopAutoSniping();
  }

  /**
   * Emergency stop
   */
  async emergencyStop(): Promise<ServiceResponse> {
    try {
      const coreTrading = getCoreTrading();
      // Use stopAutoSniping as emergency stop
      const result = await coreTrading.stopAutoSniping();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to emergency stop",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Set current user
   */
  setCurrentUser(userId: string): void {
    const coreTrading = getCoreTrading();
    coreTrading.setCurrentUser(userId);
  }

  /**
   * Get execution report
   */
  getExecutionReport(): any {
    const coreTrading = getCoreTrading();
    return (
      coreTrading.getExecutionReport?.() || {
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        averageConfidence: 0,
      }
    );
  }
}

/**
 * Get the unified auto-sniping orchestrator instance
 */
export function getUnifiedAutoSnipingOrchestrator(): UnifiedAutoSnipingOrchestrator {
  return UnifiedAutoSnipingOrchestrator.getInstance();
}

export default UnifiedAutoSnipingOrchestrator;
