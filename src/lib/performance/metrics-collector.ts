/**
 * Metrics Collector
 *
 * Handles collection of system performance metrics
 */

import { performance } from "node:perf_hooks";
import { PerformanceMetrics, TimingResult, AsyncTimingResult } from "./monitoring-types";

export class MetricsCollector {
  private timers: Map<string, number> = new Map();
  private counters: Map<string, number> = new Map();
  private metricsHistory: PerformanceMetrics[] = [];
  private historySize: number;

  constructor(historySize: number = 1000) {
    this.historySize = historySize;
  }

  startTimer(operation: string): void {
    this.timers.set(operation, performance.now());
  }

  endTimer(operation: string): number {
    const startTime = this.timers.get(operation);
    if (!startTime) {
      throw new Error(`Timer for operation '${operation}' not found`);
    }

    const duration = performance.now() - startTime;
    this.timers.delete(operation);
    return duration;
  }

  incrementCounter(counter: string, value: number = 1): void {
    const current = this.counters.get(counter) || 0;
    this.counters.set(counter, current + value);
  }

  getCounter(counter: string): number {
    return this.counters.get(counter) || 0;
  }

  resetCounter(counter: string): void {
    this.counters.set(counter, 0);
  }

  collectCurrentMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      responseTime: this.getAverageResponseTime(),
      executionTime: this.getAverageExecutionTime(),
      memoryUsage: memUsage.heapUsed,
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to milliseconds
      errorRate: this.calculateErrorRate(),
      throughput: this.calculateThroughput(),
      timestamp: Date.now(),
    };
  }

  private getAverageResponseTime(): number {
    // Implementation would calculate from collected response times
    return 0;
  }

  private getAverageExecutionTime(): number {
    // Implementation would calculate from collected execution times
    return 0;
  }

  private calculateErrorRate(): number {
    const totalRequests = this.getCounter("total_requests");
    const totalErrors = this.getCounter("total_errors");

    if (totalRequests === 0) return 0;
    return totalErrors / totalRequests;
  }

  private calculateThroughput(): number {
    const totalRequests = this.getCounter("total_requests");
    const uptime = process.uptime();

    if (uptime === 0) return 0;
    return totalRequests / uptime;
  }

  async measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<AsyncTimingResult<T>> {
    const startTime = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      this.recordMetric("executionTime", duration);
      return { result, duration };
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordMetric("executionTime", duration);
      this.incrementCounter("errors");
      throw error;
    }
  }

  measure<T>(operation: string, fn: () => T): TimingResult<T> {
    const startTime = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - startTime;
      this.recordMetric("executionTime", duration);
      return { result, duration };
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordMetric("executionTime", duration);
      this.incrementCounter("errors");
      throw error;
    }
  }

  recordMetric(metric: string, value: number): void {
    this.counters.set(metric, value);
  }

  getCurrentMetrics(): PerformanceMetrics {
    return this.collectCurrentMetrics();
  }

  getMetricsHistory(): PerformanceMetrics[] {
    return [...this.metricsHistory];
  }

  addMetricsToHistory(metrics: PerformanceMetrics): void {
    this.metricsHistory.push(metrics);

    // Trim history if needed
    if (this.metricsHistory.length > this.historySize) {
      this.metricsHistory.shift();
    }
  }

  calculateAverages(): Partial<PerformanceMetrics> {
    if (this.metricsHistory.length === 0) return {};

    const sums = this.metricsHistory.reduce(
      (acc, metric) => {
        acc.responseTime += metric.responseTime;
        acc.executionTime += metric.executionTime;
        acc.memoryUsage += metric.memoryUsage;
        acc.cpuUsage += metric.cpuUsage;
        acc.errorRate += metric.errorRate;
        acc.throughput += metric.throughput;
        return acc;
      },
      {
        responseTime: 0,
        executionTime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        errorRate: 0,
        throughput: 0,
      },
    );

    const count = this.metricsHistory.length;
    return {
      responseTime: sums.responseTime / count,
      executionTime: sums.executionTime / count,
      memoryUsage: sums.memoryUsage / count,
      cpuUsage: sums.cpuUsage / count,
      errorRate: sums.errorRate / count,
      throughput: sums.throughput / count,
    };
  }

  calculateTrends(): Record<string, "up" | "down" | "stable"> {
    if (this.metricsHistory.length < 2) return {};

    const recent = this.metricsHistory.slice(-10); // Last 10 measurements
    const older = this.metricsHistory.slice(-20, -10); // Previous 10 measurements

    if (recent.length === 0 || older.length === 0) return {};

    const recentAvg = recent.reduce((sum, m) => sum + m.responseTime, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.responseTime, 0) / older.length;

    const diff = recentAvg - olderAvg;
    const threshold = olderAvg * 0.1; // 10% threshold

    return {
      responseTime: Math.abs(diff) < threshold ? "stable" : diff > 0 ? "up" : "down",
    };
  }

  getMetricsCount(): number {
    return this.metricsHistory.length;
  }

  clearMetrics(): void {
    this.metricsHistory = [];
    this.timers.clear();
    this.counters.clear();
  }

  updateHistorySize(newSize: number): void {
    this.historySize = newSize;

    // Trim existing history if needed
    if (this.metricsHistory.length > newSize) {
      this.metricsHistory = this.metricsHistory.slice(-newSize);
    }
  }

  reset(): void {
    this.timers.clear();
    this.counters.clear();
  }
}
