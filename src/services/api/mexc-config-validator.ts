/**
 * MEXC Config Validator Types
 *
 * Type definitions for configuration validation.
 */

export interface ConfigValidationResult {
  component: string;
  status: "pass" | "warning" | "fail";
  isValid: boolean;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface SystemReadinessReport {
  timestamp: string;
  systemReady: boolean;
  overallStatus?: "ready" | "warning" | "not_ready";
  autoSnipingEnabled?: boolean;
  readinessScore?: number;
  checks: Record<string, { status: string }>;
  validationResults: ConfigValidationResult[];
  recommendations?: string[];
}
