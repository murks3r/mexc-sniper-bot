/**
 * Pattern Monitoring Service Stub
 *
 * Stub implementation for pattern monitoring service.
 * Pattern detection was removed per cleanup.
 */

type MonitoringReport = {
  isActive: boolean;
  patternsDetected: number;
  lastDetection: unknown;
  stats: {
    engineStatus: string;
    lastHealthCheck: string;
    consecutiveErrors: number;
    averageConfidence?: number;
  };
  activeAlerts: Array<{ acknowledged?: boolean }>;
  lastUpdated: string;
  status?: string;
  statistics: {
    totalPatterns: number;
    activePatterns: number;
    patternsByType: Record<string, unknown>;
  };
};

export class PatternMonitoringService {
  private static instance: PatternMonitoringService;

  static getInstance(): PatternMonitoringService {
    if (!PatternMonitoringService.instance) {
      PatternMonitoringService.instance = new PatternMonitoringService();
    }
    return PatternMonitoringService.instance;
  }

  getMonitoringReport(): Promise<MonitoringReport> {
    return Promise.resolve({
      isActive: false,
      patternsDetected: 0,
      lastDetection: null,
      stats: {
        engineStatus: "inactive",
        lastHealthCheck: new Date().toISOString(),
        consecutiveErrors: 0,
        averageConfidence: 0,
      },
      activeAlerts: [],
      lastUpdated: new Date().toISOString(),
      status: "inactive",
      statistics: {
        totalPatterns: 0,
        activePatterns: 0,
        patternsByType: {},
      },
    });
  }

  getRecentPatterns(_limit?: number): unknown[] {
    return [];
  }

  startMonitoring(): Promise<void> {
    return Promise.resolve();
  }

  stopMonitoring(): void {
    // Stub
  }

  detectPatternsManually(
    _symbols: string[],
    _calendarEntries?: unknown[],
  ): Promise<Array<{ patternType: string; confidence: number }>> {
    return Promise.resolve([]);
  }

  acknowledgeAlert(_alertId: string): boolean {
    return false;
  }

  clearAcknowledgedAlerts(): number {
    return 0;
  }
}
