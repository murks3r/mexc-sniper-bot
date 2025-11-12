/**
 * Alert Manager
 *
 * Handles performance alerts and threshold monitoring
 */

import type {
  PerformanceAlert,
  PerformanceMetrics,
  PerformanceThreshold,
} from "./monitoring-types";

export class AlertManager {
  private alerts: PerformanceAlert[] = [];
  private thresholds: PerformanceThreshold[] = [];
  private historySize: number;

  constructor(historySize: number = 1000, thresholds: PerformanceThreshold[] = []) {
    this.historySize = historySize;
    this.thresholds = thresholds;
  }

  checkThresholds(metrics: PerformanceMetrics): PerformanceAlert[] {
    const newAlerts: PerformanceAlert[] = [];

    for (const threshold of this.thresholds) {
      const value = metrics[threshold.metric];
      const triggered = this.evaluateThreshold(value, threshold.threshold, threshold.condition);

      if (triggered) {
        const alert: PerformanceAlert = {
          type: `threshold_${threshold.metric}`,
          severity: this.determineSeverity(value, threshold),
          message: `${threshold.metric} ${threshold.condition} ${threshold.threshold} (current: ${value})`,
          data: {
            metric: threshold.metric,
            value,
            threshold: threshold.threshold,
            condition: threshold.condition,
          },
          timestamp: Date.now(),
        };

        newAlerts.push(alert);
        this.alerts.push(alert);
      }
    }

    return newAlerts;
  }

  private evaluateThreshold(
    value: number,
    threshold: number,
    condition: "gt" | "lt" | "eq",
  ): boolean {
    switch (condition) {
      case "gt":
        return value > threshold;
      case "lt":
        return value < threshold;
      case "eq":
        return value === threshold;
      default:
        return false;
    }
  }

  private determineSeverity(
    value: number,
    threshold: PerformanceThreshold,
  ): PerformanceAlert["severity"] {
    const ratio = value / threshold.threshold;

    if (ratio > 2) return "critical";
    if (ratio > 1.5) return "high";
    if (ratio > 1.2) return "medium";
    return "low";
  }

  getAlerts(severity?: PerformanceAlert["severity"]): PerformanceAlert[] {
    if (severity) {
      return this.alerts.filter((alert) => alert.severity === severity);
    }
    return [...this.alerts];
  }

  clearAlerts(): void {
    this.alerts = [];
  }

  clearOldAlerts(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    this.alerts = this.alerts.filter((alert) => alert.timestamp > cutoff);
  }

  updateThresholds(thresholds: PerformanceThreshold[]): void {
    this.thresholds = thresholds;
  }

  getThresholds(): PerformanceThreshold[] {
    return [...this.thresholds];
  }

  getAlertCount(): number {
    return this.alerts.length;
  }

  addAlert(alert: PerformanceAlert): void {
    this.alerts.push(alert);

    // Trim alerts if needed
    if (this.alerts.length > this.historySize) {
      this.alerts.shift();
    }
  }

  updateHistorySize(newSize: number): void {
    this.historySize = newSize;

    // Trim existing alerts if needed
    if (this.alerts.length > newSize) {
      this.alerts = this.alerts.slice(-newSize);
    }
  }
}
