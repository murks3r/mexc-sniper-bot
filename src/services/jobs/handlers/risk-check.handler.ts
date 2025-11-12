import { createSimpleLogger } from "@/src/lib/unified-logger";
import { RealTimeSafetyMonitoringService } from "@/src/services/risk/real-time-safety-monitoring-modules";

const logger = createSimpleLogger("risk-check-handler");

/**
 * Handle risk check job
 * Performs comprehensive risk assessment using the unified safety monitoring service
 */
export async function handleRiskCheckJob() {
  try {
    logger.info("Starting risk check job");

    const safetyService = RealTimeSafetyMonitoringService.getInstance();

    // Perform comprehensive risk assessment
    const assessment = await safetyService.performRiskAssessment();

    logger.info("Risk check completed", {
      overallRiskScore: assessment.overallRiskScore,
      systemHealth: assessment.systemHealth.status,
      criticalRisks: assessment.criticalRisks.length,
      warnings: assessment.warnings.length,
    });

    // Get safety report for additional context
    const report = await safetyService.getSafetyReport();

    // If system is unsafe, trigger emergency response
    const isSafe = await safetyService.isSystemSafe();
    if (!isSafe) {
      logger.warn("System safety check failed, triggering emergency response");
      await safetyService.triggerEmergencyResponse(
        "Scheduled risk check detected unsafe conditions",
      );
    }

    return {
      success: true,
      assessment,
      report,
      isSafe,
    };
  } catch (error) {
    logger.error("Risk check job failed", {}, error as Error);
    throw error;
  }
}
