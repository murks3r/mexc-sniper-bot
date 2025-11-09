/**
 * Emergency Stop Coordinator Stub
 *
 * Stub implementation for emergency stop coordination.
 */

export type EmergencyStopEvent = {
  id?: string;
  reason: string;
  timestamp: Date | number;
  type?:
    | "emergency_condition"
    | "system_failure"
    | "risk_threshold"
    | "performance_degradation"
    | "safety_violation";
  severity?: "low" | "medium" | "high" | "critical" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  triggeredBy?: string;
  context?: Record<string, unknown>;
};

export interface EmergencyStopResult {
  success: boolean;
  actionsExecuted: string[];
  coordinatedServices: string[];
  duration: number;
  errors: string[];
}

export class EmergencyStopCoordinator {
  private static instance: EmergencyStopCoordinator;
  private registeredServices = new Map<
    string,
    { emergencyStop: (event: EmergencyStopEvent) => Promise<void> }
  >();

  static getInstance(): EmergencyStopCoordinator {
    if (!EmergencyStopCoordinator.instance) {
      EmergencyStopCoordinator.instance = new EmergencyStopCoordinator();
    }
    return EmergencyStopCoordinator.instance;
  }

  registerService(
    name: string,
    service: { emergencyStop: (event: EmergencyStopEvent) => Promise<void> },
  ): void {
    this.registeredServices.set(name, service);
  }

  async triggerEmergencyStop(event: EmergencyStopEvent): Promise<EmergencyStopResult> {
    const startTime = Date.now();
    const actionsExecuted: string[] = [];
    const coordinatedServices: string[] = [];
    const errors: string[] = [];

    // Trigger emergency stop on all registered services
    for (const [name, service] of this.registeredServices.entries()) {
      try {
        await service.emergencyStop(event);
        coordinatedServices.push(name);
        actionsExecuted.push(`emergency_stop_${name}`);
      } catch (error) {
        errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      success: errors.length === 0,
      actionsExecuted,
      coordinatedServices,
      duration: Date.now() - startTime,
      errors,
    };
  }

  clearEmergencyStop() {
    // Stub
  }

  isEmergencyActive() {
    return false;
  }
}
