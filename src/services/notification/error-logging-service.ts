/**
 * Error Logging Service Stub
 *
 * Stub implementation for error logging service.
 */

export const errorLoggingService = {
  logError: (_error: Error, _context?: any) => {
    /* console.error("Error logged:", error.message, context); */
  },
  logWarning: (_message: string, _context?: any) => {
    /* console.warn("Warning:", message, context); */
  },
};

export class ErrorLoggingService {
  private static instance: ErrorLoggingService;

  static getInstance(): ErrorLoggingService {
    if (!ErrorLoggingService.instance) {
      ErrorLoggingService.instance = new ErrorLoggingService();
    }
    return ErrorLoggingService.instance;
  }

  logError(error: Error, context?: any) {
    errorLoggingService.logError(error, context);
  }

  logWarning(message: string, context?: any) {
    errorLoggingService.logWarning(message, context);
  }
}
