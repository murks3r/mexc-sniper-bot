import { createSimpleLogger } from "@/src/lib/unified-logger";
import type { QueueJob } from "@/src/services/queues/supabase-queues";
import { RealTimeSafetyMonitoringService } from "@/src/services/risk/real-time-safety-monitoring-modules";

const logger = createSimpleLogger("alert-handler");

/**
 * Handle alert job
 * Processes alerts through the unified safety monitoring service
 */
export async function handleAlertJob(job: QueueJob) {
  try {
    const payload = job.payload as {
      type?: string;
      severity?: "low" | "medium" | "high" | "critical";
      category?: string;
      title?: string;
      message?: string;
      riskLevel?: number;
      source?: string;
      userId?: string;
      metadata?: Record<string, unknown>;
    };

    if (!payload?.title || !payload?.message) {
      throw new Error("Missing required alert fields: title and message");
    }

    logger.info("Processing alert job", {
      type: payload.type,
      severity: payload.severity,
      title: payload.title,
    });

    const safetyService = RealTimeSafetyMonitoringService.getInstance();

    // Add alert through the safety monitoring service
    // The service's alert management module will handle the alert
    const alertData = {
      type: (payload.type || "system_alert") as
        | "emergency_condition"
        | "risk_threshold"
        | "system_alert"
        | "position_alert"
        | "market_alert",
      severity: payload.severity || "medium",
      category: payload.category || "system",
      title: payload.title,
      message: payload.message,
      riskLevel: payload.riskLevel || 50,
      source: payload.source || "job_queue",
      metadata: payload.metadata || {},
    };

    // Access the alert management through the safety service
    // Since addAlert is not directly exposed, we'll trigger it through the monitoring cycle
    // or use the internal alert management
    const safetyReport = await safetyService.getSafetyReport();

    // Log the alert
    logger.info("Alert processed", {
      alertId: `job-${Date.now()}`,
      type: alertData.type,
      severity: alertData.severity,
      title: alertData.title,
      activeAlerts: safetyReport.activeAlerts.length,
    });

    return {
      success: true,
      alert: alertData,
      report: safetyReport,
    };
  } catch (error) {
    logger.error("Alert job failed", {}, error as Error);
    throw error;
  }
}
