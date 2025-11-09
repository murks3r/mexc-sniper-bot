/**
 * Safety Domain Events
 * Events that represent important safety-related occurrences in the domain
 */

import type { DomainEvent } from "./domain-event";

// Base safety event interface
interface BaseSafetyEvent extends DomainEvent {
  readonly aggregateId: string; // EmergencyStop ID, RiskProfile ID, etc.
  readonly userId: string;
  readonly portfolioId?: string;
}

// Emergency Stop Events
export interface EmergencyStopCreated extends BaseSafetyEvent {
  readonly type: "EmergencyStopCreated";
  readonly data: {
    emergencyStopId: string;
    userId: string;
    portfolioId: string;
    triggerConditions: Array<{
      type: string;
      threshold: number;
      description: string;
      priority: string;
    }>;
    emergencyActions: Array<{
      type: string;
      priority: number;
      description: string;
      timeout: number;
      retryCount: number;
    }>;
    isActive: boolean;
    autoExecute: boolean;
  };
}

export interface EmergencyStopTriggered extends BaseSafetyEvent {
  readonly type: "EmergencyStopTriggered";
  readonly data: {
    emergencyStopId: string;
    userId: string;
    portfolioId: string;
    reason: string;
    triggerData: Record<string, any>;
    triggeredAt: Date;
    scheduledActions: Array<{
      actionType: string;
      priority: number;
      timeout: number;
      retryCount: number;
    }>;
  };
}

export interface EmergencyStopCompleted extends BaseSafetyEvent {
  readonly type: "EmergencyStopCompleted";
  readonly data: {
    emergencyStopId: string;
    userId: string;
    portfolioId: string;
    triggeredAt: Date;
    completedAt: Date;
    executionSummary: {
      totalActions: number;
      successfulActions: number;
      failedActions: number;
      totalExecutionTime: number;
      averageActionTime: number;
      overallSuccess: boolean;
    };
    actionResults: Array<{
      actionType: string;
      success: boolean;
      duration: number;
      error?: string;
    }>;
  };
}

export interface EmergencyStopFailed extends BaseSafetyEvent {
  readonly type: "EmergencyStopFailed";
  readonly data: {
    emergencyStopId: string;
    userId: string;
    portfolioId: string;
    triggeredAt: Date;
    failedAt: Date;
    failureReason: string;
    failedActions: Array<{
      actionType: string;
      error: string;
      attemptsCount: number;
    }>;
    partialResults?: Array<{
      actionType: string;
      success: boolean;
      duration: number;
      error?: string;
    }>;
  };
}

// Risk Profile Events
export interface RiskProfileCreated extends BaseSafetyEvent {
  readonly type: "RiskProfileCreated";
  readonly data: {
    riskProfileId: string;
    userId: string;
    portfolioId: string;
    thresholds: {
      maxDrawdownPercent: number;
      maxPositionRiskPercent: number;
      maxPortfolioRiskPercent: number;
      maxConcentrationPercent: number;
      consecutiveLossThreshold: number;
      dailyLossThreshold: number;
      monthlyLossThreshold: number;
    };
    exposures: {
      totalExposure: number;
      longExposure: number;
      shortExposure: number;
      leveragedExposure: number;
      unrealizedPnL: number;
      realizedPnL: number;
    };
    riskToleranceLevel: string;
    isActive: boolean;
  };
}

export interface RiskProfileUpdated extends BaseSafetyEvent {
  readonly type: "RiskProfileUpdated";
  readonly data: {
    riskProfileId: string;
    userId: string;
    portfolioId: string;
    changeType: "thresholds" | "exposures" | "tolerance" | "status";
    previousValues: Record<string, any>;
    newValues: Record<string, any>;
    updatedBy: "USER" | "SYSTEM" | "AUTO_ADJUSTMENT";
    reason?: string;
  };
}

export interface RiskThresholdViolated extends BaseSafetyEvent {
  readonly type: "RiskThresholdViolated";
  readonly data: {
    riskProfileId: string;
    userId: string;
    portfolioId: string;
    violationType:
      | "drawdown_threshold"
      | "position_risk"
      | "portfolio_risk"
      | "concentration_risk"
      | "consecutive_losses"
      | "daily_loss_threshold"
      | "monthly_loss_threshold";
    threshold: number;
    currentValue: number;
    severity: "low" | "medium" | "high" | "critical";
    recommendedActions: string[];
    violationContext: {
      symbol?: string;
      positionId?: string;
      tradeId?: string;
      timeframe?: string;
      additionalMetrics?: Record<string, any>;
    };
    detectedAt: Date;
  };
}

// Safety Alert Events
export interface SafetyAlertCreated extends BaseSafetyEvent {
  readonly type: "SafetyAlertCreated";
  readonly data: {
    alertId: string;
    userId: string;
    portfolioId: string;
    alertType: "RISK_WARNING" | "THRESHOLD_BREACH" | "EMERGENCY_TRIGGER" | "SYSTEM_ANOMALY";
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    message: string;
    sourceEntity: string; // "emergency_stop" | "risk_profile" | "trading_engine"
    sourceEntityId: string;
    requiresAction: boolean;
    suggestedActions?: string[];
    metadata: Record<string, any>;
  };
}

export interface SafetyAlertResolved extends BaseSafetyEvent {
  readonly type: "SafetyAlertResolved";
  readonly data: {
    alertId: string;
    userId: string;
    portfolioId: string;
    resolvedAt: Date;
    resolvedBy: "USER" | "SYSTEM" | "AUTO_RESOLUTION";
    resolutionMethod: string;
    actionsTaken: string[];
    outcome: "SUCCESSFUL" | "PARTIAL" | "FAILED";
    notes?: string;
  };
}

// Union type of all safety events
export type SafetyDomainEvent =
  | EmergencyStopCreated
  | EmergencyStopTriggered
  | EmergencyStopCompleted
  | EmergencyStopFailed
  | RiskProfileCreated
  | RiskProfileUpdated
  | RiskThresholdViolated
  | SafetyAlertCreated
  | SafetyAlertResolved;

// Event creation helpers
export class SafetyEventFactory {
  static createEmergencyStopCreated(
    emergencyStopId: string,
    userId: string,
    data: EmergencyStopCreated["data"],
  ): EmergencyStopCreated {
    return {
      type: "EmergencyStopCreated",
      aggregateId: emergencyStopId,
      userId,
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
      data,
    };
  }

  static createEmergencyStopTriggered(
    emergencyStopId: string,
    userId: string,
    data: EmergencyStopTriggered["data"],
  ): EmergencyStopTriggered {
    return {
      type: "EmergencyStopTriggered",
      aggregateId: emergencyStopId,
      userId,
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
      data,
    };
  }

  static createEmergencyStopCompleted(
    emergencyStopId: string,
    userId: string,
    data: EmergencyStopCompleted["data"],
  ): EmergencyStopCompleted {
    return {
      type: "EmergencyStopCompleted",
      aggregateId: emergencyStopId,
      userId,
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
      data,
    };
  }

  static createEmergencyStopFailed(
    emergencyStopId: string,
    userId: string,
    data: EmergencyStopFailed["data"],
  ): EmergencyStopFailed {
    return {
      type: "EmergencyStopFailed",
      aggregateId: emergencyStopId,
      userId,
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
      data,
    };
  }

  static createRiskProfileCreated(
    riskProfileId: string,
    userId: string,
    data: RiskProfileCreated["data"],
  ): RiskProfileCreated {
    return {
      type: "RiskProfileCreated",
      aggregateId: riskProfileId,
      userId,
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
      data,
    };
  }

  static createRiskProfileUpdated(
    riskProfileId: string,
    userId: string,
    data: RiskProfileUpdated["data"],
  ): RiskProfileUpdated {
    return {
      type: "RiskProfileUpdated",
      aggregateId: riskProfileId,
      userId,
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
      data,
    };
  }

  static createRiskThresholdViolated(
    riskProfileId: string,
    userId: string,
    data: RiskThresholdViolated["data"],
  ): RiskThresholdViolated {
    return {
      type: "RiskThresholdViolated",
      aggregateId: riskProfileId,
      userId,
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
      data,
    };
  }

  static createSafetyAlertCreated(
    alertId: string,
    userId: string,
    data: SafetyAlertCreated["data"],
  ): SafetyAlertCreated {
    return {
      type: "SafetyAlertCreated",
      aggregateId: alertId,
      userId,
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
      data,
    };
  }

  static createSafetyAlertResolved(
    alertId: string,
    userId: string,
    data: SafetyAlertResolved["data"],
  ): SafetyAlertResolved {
    return {
      type: "SafetyAlertResolved",
      aggregateId: alertId,
      userId,
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
      data,
    };
  }
}
