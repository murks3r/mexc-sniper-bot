/**
 * Performance Monitoring Types
 *
 * Type definitions for performance monitoring system
 */

export interface PerformanceMetrics {
  responseTime: number;
  executionTime: number;
  memoryUsage: number;
  cpuUsage: number;
  errorRate: number;
  throughput: number;
  timestamp: number;
}

export interface PerformanceAlert {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  data: any;
  timestamp: number;
}

export interface PerformanceThreshold {
  metric: keyof PerformanceMetrics;
  threshold: number;
  condition: "gt" | "lt" | "eq";
}

export interface PerformanceMonitoringConfig {
  enabled: boolean;
  samplingInterval: number;
  alertThresholds: PerformanceThreshold[];
  historySize: number;
  enableAlerts: boolean;
}

export interface MonitoringStatus {
  enabled: boolean;
  running: boolean;
  metricsCount: number;
  alertsCount: number;
  uptime: number;
}

export interface PerformanceSummary {
  current: PerformanceMetrics;
  averages: Partial<PerformanceMetrics>;
  trends: Record<string, "up" | "down" | "stable">;
  alertCount: number;
}

export interface TimingResult<T> {
  result: T;
  duration: number;
}

export interface AsyncTimingResult<T> {
  result: T;
  duration: number;
}
