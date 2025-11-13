/**
 * Performance Monitoring Service
 *
 * Refactored performance monitoring service that uses modular components
 * for metrics collection, alert management, and type definitions.
 */

import { AlertManager } from "./performance/alert-manager";
import { MetricsCollector } from "./performance/metrics-collector";
import type {
  AsyncTimingResult,
  MonitoringStatus,
  PerformanceAlert,
  PerformanceMetrics,
  PerformanceMonitoringConfig,
  PerformanceSummary,
  TimingResult,
} from "./performance/monitoring-types";

export class PerformanceMonitoringService {
  private config: PerformanceMonitoringConfig;
  private metricsCollector: MetricsCollector;
  private alertManager: AlertManager;
  private isRunning = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: Partial<PerformanceMonitoringConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      samplingInterval: config.samplingInterval ?? 10000, // 10 seconds
      alertThresholds: config.alertThresholds ?? [],
      historySize: config.historySize ?? 1000,
      enableAlerts: config.enableAlerts ?? true,
    };

    this.metricsCollector = new MetricsCollector(this.config.historySize);
    this.alertManager = new AlertManager(this.config.historySize, this.config.alertThresholds);

    if (this.config.enabled) {
      this.start();
    }
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.samplingInterval);
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Start timing an operation
   */
  startTimer(operation: string): void {
    this.metricsCollector.startTimer(operation);
  }

  /**
   * End timing an operation and return duration
   */
  endTimer(operation: string): number {
    return this.metricsCollector.endTimer(operation);
  }

  /**
   * Measure execution time of an async function
   */
  async measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<AsyncTimingResult<T>> {
    return this.metricsCollector.measureAsync(operation, fn);
  }

  /**
   * Measure execution time of a synchronous function
   */
  measure<T>(operation: string, fn: () => T): TimingResult<T> {
    return this.metricsCollector.measure(operation, fn);
  }

  /**
   * Record a custom metric
   */
  recordMetric(metric: string, value: number): void {
    this.metricsCollector.recordMetric(metric, value);
  }

  /**
   * Increment a counter
   */
  incrementCounter(counter: string, value: number = 1): void {
    this.metricsCollector.incrementCounter(counter, value);
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): PerformanceMetrics {
    return this.metricsCollector.getCurrentMetrics();
  }

  /**
   * Get performance metrics history
   */
  getMetricsHistory(): PerformanceMetrics[] {
    return this.metricsCollector.getMetricsHistory();
  }

  /**
   * Get recent alerts
   */
  getAlerts(): PerformanceAlert[] {
    return this.alertManager.getAlerts();
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): PerformanceSummary {
    const current = this.getCurrentMetrics();
    const averages = this.metricsCollector.calculateAverages();
    const trends = this.metricsCollector.calculateTrends();

    return {
      current,
      averages,
      trends,
      alertCount: this.alertManager.getAlertCount(),
    };
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.metricsCollector.clearMetrics();
    this.alertManager.clearAlerts();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PerformanceMonitoringConfig>): void {
    this.config = { ...this.config, ...config };
    this.metricsCollector.updateHistorySize(this.config.historySize);
    this.alertManager.updateHistorySize(this.config.historySize);

    if (this.config.enabled && !this.isRunning) {
      this.start();
    } else if (!this.config.enabled && this.isRunning) {
      this.stop();
    }
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get monitoring status
   */
  getStatus(): MonitoringStatus {
    return {
      enabled: this.config.enabled,
      running: this.isRunning,
      metricsCount: this.metricsCollector.getMetricsCount(),
      alertsCount: this.alertManager.getAlertCount(),
      uptime: process.uptime(),
    };
  }

  /**
   * Collect system metrics
   */
  private collectMetrics(): void {
    const metrics = this.metricsCollector.getCurrentMetrics();

    // Add to history
    this.metricsCollector.addMetricsToHistory(metrics);

    // Check thresholds and generate alerts
    if (this.config.enableAlerts) {
      this.alertManager.updateThresholds(this.config.alertThresholds);
      const violations = this.alertManager.checkThresholds(metrics);

      // Add violations to alert manager
      violations.forEach((violation) => {
        this.alertManager.addAlert(violation);
      });
    }
  }
}

// Global performance monitoring service instance
export const performanceMonitoringService = new PerformanceMonitoringService({
  enabled: process.env.NODE_ENV !== "test",
  samplingInterval: Number(process.env.PERF_SAMPLING_INTERVAL) || 10000,
  historySize: Number(process.env.PERF_HISTORY_SIZE) || 1000,
  enableAlerts: process.env.PERF_ALERTS_ENABLED !== "false",
});

// Re-export types for backward compatibility
export type {
  AsyncTimingResult,
  MonitoringStatus,
  PerformanceAlert,
  PerformanceMetrics,
  PerformanceMonitoringConfig,
  PerformanceSummary,
  PerformanceThreshold,
  TimingResult,
} from "./performance/monitoring-types";
