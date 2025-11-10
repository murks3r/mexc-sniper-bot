import { z } from "zod";

/**
 * Generic validation function that works with any Zod schema
 * Consolidates duplicate validation functions across schema files
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  options?: {
    errorPrefix?: string;
    includeDetails?: boolean;
  },
): { success: boolean; data?: T; error?: string; details?: string[] } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = options?.errorPrefix
        ? `${options.errorPrefix}: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
        : `Validation failed: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`;

      return {
        success: false,
        error: errorMessage,
        details: options?.includeDetails
          ? error.errors.map((e) => `${e.path.join(".")}: ${e.message}`)
          : undefined,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown validation error",
    };
  }
}

/**
 * Validate API query parameters
 */
export function validateApiQuery<T extends z.ZodSchema>(
  schema: T,
  searchParams: URLSearchParams,
): { success?: boolean; data?: z.infer<T>; error?: string } {
  try {
    const params = Object.fromEntries(searchParams.entries());
    const result = schema.parse(params);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Query validation failed: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown validation error",
    };
  }
}

/**
 * Validate API request body
 */
export function validateApiBody<T extends z.ZodSchema>(
  schema: T,
  body: unknown,
): { success?: boolean; data?: z.infer<T>; error?: string } {
  try {
    const result = schema.parse(body);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Body validation failed: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown validation error",
    };
  }
}

/**
 * Validate MEXC API data with enhanced error reporting
 */
export function validateMexcApiRequest<T extends z.ZodSchema>(
  schema: T,
  data: unknown,
): { success: true; data: z.infer<T> } | { success: false; error: string; details: string[] } {
  const result = validateData(schema, data, {
    errorPrefix: "MEXC API validation failed",
    includeDetails: true,
  });

  if (result.success && result.data) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error || "Validation failed",
    details: result.details || [],
  };
}

/**
 * Validate MEXC API response
 */
export function validateMexcApiResponse<T extends z.ZodSchema>(
  schema: T,
  data: unknown,
  context?: string,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const prefix = context
    ? `MEXC API response validation (${context})`
    : "MEXC API response validation";
  const result = validateData(schema, data, { errorPrefix: prefix });

  if (result.success && result.data) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error || "Validation failed",
  };
}
