/**
 * Error Logging Service Stub
 *
 * Stub implementation for error logging service.
 */

export const errorLoggingService = {
  logError: (_error: Error, _context?: any) => {},
  logWarning: (_message: string, _context?: any) => {},
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
