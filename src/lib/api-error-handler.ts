/**
 * API Error Handler Utilities
 *
 * Provides reusable error handling functions for API routes
 * to reduce code duplication and improve consistency.
 */

import { createErrorResponse } from "./api-response";

/**
 * Handle API errors with consistent authentication error detection
 */
export function handleApiRouteError(
  error: unknown,
  defaultMessage: string,
  options?: {
    customAuthMessage?: string;
    statusCode?: number;
  },
): Response {
  const isAuthError = error instanceof Error && error.message.includes("Authentication required");

  if (isAuthError) {
    return Response.json(
      createErrorResponse("Authentication required", {
        message: options?.customAuthMessage || "Please sign in to access this resource",
        code: "AUTHENTICATION_REQUIRED",
      }),
      { status: 401 },
    );
  }

  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const statusCode = options?.statusCode || 500;

  return Response.json(
    createErrorResponse(defaultMessage, {
      error: errorMessage,
    }),
    { status: statusCode },
  );
}

/**
 * Handle API errors for NextResponse (for routes using NextResponse)
 */
export function handleNextResponseError(
  error: unknown,
  defaultMessage: string,
  options?: {
    customAuthMessage?: string;
    statusCode?: number;
  },
) {
  const isAuthError = error instanceof Error && error.message.includes("Authentication required");

  if (isAuthError) {
    return {
      success: false,
      error: "Authentication required",
      message: options?.customAuthMessage || "Please sign in to access this resource",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  return {
    success: false,
    error: error instanceof Error ? error.message : defaultMessage,
  };
}
