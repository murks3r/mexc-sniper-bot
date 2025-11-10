/**
 * SIMPLIFIED VALIDATION TYPES
 * Universal validation result types to replace complex discriminated unions
 * across the entire codebase for better TypeScript compatibility
 */

// ============================================================================
// UNIVERSAL VALIDATION RESULT TYPES
// ============================================================================

export interface ValidationResult<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  details?: unknown;
  statusCode?: number;
  code?: string;
  message?: string;
}

export interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
  message?: string;
  timestamp?: string;
  meta?: unknown;
  statusCode?: number;
}

export interface SimpleResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================================
// HELPER FUNCTIONS FOR COMMON VALIDATION PATTERNS
// ============================================================================

export function createSuccessResult<T>(data: T, message?: string): ValidationResult<T> {
  return { success: true, data, message };
}

export function createErrorResult(error: string, code?: string): ValidationResult {
  return { success: false, error, code };
}

export function createApiSuccess<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };
}

export function createApiError(error: string, code?: string, statusCode?: number): ApiResponse {
  return {
    success: false,
    error,
    code,
    statusCode,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// TYPE GUARDS FOR SAFE TYPE CHECKING
// ============================================================================

export function isSuccessResult<T>(
  result: ValidationResult<T>,
): result is ValidationResult<T> & { success: true; data: T } {
  return result.success === true && result.data !== undefined;
}

export function isErrorResult<T>(
  result: ValidationResult<T>,
): result is ValidationResult<T> & { success: false; error: string } {
  return result.success === false && typeof result.error === "string";
}

export function isApiSuccess<T>(
  response: ApiResponse<T>,
): response is ApiResponse<T> & { success: true; data: T } {
  return response.success === true && response.data !== undefined;
}

export function isApiError<T>(
  response: ApiResponse<T>,
): response is ApiResponse<T> & { success: false; error: string } {
  return response.success === false && typeof response.error === "string";
}

// ============================================================================
// COMMON CONFIGURATION TYPES (SIMPLIFIED)
// ============================================================================

export interface AutoSnipeConfig {
  enabled?: boolean;
  maxPositionSize?: number;
  stopLossPercentage?: number;
  takeProfitPercentage?: number;
  patternConfidenceThreshold?: number;
  maxConcurrentTrades?: number;
  enableSafetyChecks?: boolean;
  enablePatternDetection?: boolean;
}

export interface Phase3Configuration {
  performance?: Record<string, unknown>;
  aiIntelligence?: Record<string, unknown>;
  patternDetection?: Record<string, unknown>;
  cacheWarming?: Record<string, unknown>;
}

// ============================================================================
// LEGACY COMPATIBILITY EXPORTS
// ============================================================================

// These provide compatibility with existing code that expects specific types
export type ApiSuccessResponse<T = unknown> = ApiResponse<T>;
export type ApiErrorResponse = ApiResponse;
export type ValidationSuccess<T = unknown> = ValidationResult<T>;
export type ValidationError = ValidationResult;
