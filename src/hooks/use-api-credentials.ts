import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/components/auth/supabase-auth-provider";
export interface ApiCredentials {
  id?: number;
  userId: string;
  provider: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
  isActive: boolean;
  lastUsed?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  // For testing - remove in production
  _testApiKey?: string;
  _testSecretKey?: string;
}

export interface SaveApiCredentialsRequest {
  userId: string;
  provider?: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
}

// Fetch API credentials for a user and provider
export function useApiCredentials(userId?: string, provider = "mexc") {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["api-credentials", userId || "anonymous", provider, "active"],
    queryFn: async (): Promise<ApiCredentials | null> => {
      if (!userId) {
        throw new Error("User ID is required");
      }

      const response = await fetch(
        `/api/api-credentials?userId=${encodeURIComponent(userId)}&provider=${encodeURIComponent(provider)}`,
        {
          credentials: "include", // Include authentication cookies
        }
      );

      if (!response.ok) {
        // Don't throw errors for 403/401 when not authenticated
        if (
          !isAuthenticated &&
          (response.status === 403 || response.status === 401)
        ) {
          return null;
        }
        throw new Error("Failed to fetch API credentials");
      }

      return response.json();
    },
    // Only fetch credentials if user is authenticated and it's their own data
    enabled: !!userId && isAuthenticated && user?.id === userId,
    staleTime: 5 * 60 * 1000, // 5 minutes - user data cache
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
    refetchOnWindowFocus: false,
    placeholderData: null, // Prevent loading flicker
    retry: (_failureCount, error) => {
      // Don't retry auth errors
      const errorMessage = error?.message || "";
      if (errorMessage.includes("401") || errorMessage.includes("403")) {
        return false;
      }
      // Don't retry network errors to prevent cascade failures
      if (
        errorMessage.includes("timeout") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("Circuit breaker")
      ) {
        return false;
      }
      // No retries to prevent storms
      return false;
    },
  });
}

// Save API credentials
export function useSaveApiCredentials() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  return useMutation({
    mutationFn: async (data: SaveApiCredentialsRequest) => {
      // Check authentication before saving
      if (!isAuthenticated || !user?.id) {
        throw new Error("Authentication required to save credentials");
      }

      // Ensure user can only save their own credentials
      if (user.id !== data.userId) {
        throw new Error(
          "Access denied: You can only save your own credentials"
        );
      }

      // Enhanced debugging for request (development only)
      const requestPayload = JSON.stringify(data);
      // Redacted: avoid logging sensitive credential operations

      const response = await fetch("/api/api-credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include authentication cookies
        body: requestPayload,
      });

      // Redacted: avoid logging sensitive credential operations

      if (!response.ok) {
        let errorDetails: any = null;
        let fallback = `HTTP ${response.status}: ${response.statusText}`;

        try {
          // Try to parse JSON error payload first
          errorDetails = await response.json();
          // Redacted: avoid logging sensitive credential operations
        } catch (parseError) {
          // If parsing fails, capture the raw text for clarity
          console.error("[DEBUG] Failed to parse error response:", parseError);
          try {
            const rawText = await response.text();
            if (rawText) {
              fallback = `${fallback} – ${rawText}`;
            }
          } catch (textError) {
            console.error("[DEBUG] Failed to read error response text:", textError);
          }
        }

        const extractedMessage = errorDetails?.error || errorDetails?.message;
        const finalMessage = extractedMessage
          ? `Failed to save API credentials: ${extractedMessage}`
          : `Failed to save API credentials: ${fallback}`;

        throw new Error(finalMessage);
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Optimized: Update cache directly instead of invalidating
      const queryKey = [
        "api-credentials",
        variables.userId,
        variables.provider || "mexc",
      ];
      queryClient.setQueryData(queryKey, data);

      // Also invalidate connectivity status to reflect changes
      queryClient.invalidateQueries({
        queryKey: ["mexc", "connectivity"],
      });
    },
  });
}

// Delete API credentials
export function useDeleteApiCredentials() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  return useMutation({
    mutationFn: async ({
      userId,
      provider = "mexc",
    }: {
      userId: string;
      provider?: string;
    }) => {
      // Check authentication before deleting
      if (!isAuthenticated || !user?.id) {
        throw new Error("Authentication required to delete credentials");
      }

      // Ensure user can only delete their own credentials
      if (user.id !== userId) {
        throw new Error(
          "Access denied: You can only delete your own credentials"
        );
      }

      const response = await fetch(
        `/api/api-credentials?userId=${encodeURIComponent(userId)}&provider=${encodeURIComponent(provider)}`,
        {
          method: "DELETE",
          credentials: "include", // Include authentication cookies
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete API credentials");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate and refetch API credentials
      queryClient.invalidateQueries({
        queryKey: ["api-credentials", variables.userId, variables.provider],
      });
    },
  });
}

// Test API credentials
export function useTestApiCredentials() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  return useMutation({
    mutationFn: async ({
      userId,
      provider = "mexc",
    }: {
      userId: string;
      provider?: string;
    }) => {
      // Check authentication before testing
      if (!isAuthenticated || !user?.id) {
        throw new Error("Authentication required to test credentials");
      }

      // Ensure user can only test their own credentials
      if (user.id !== userId) {
        throw new Error(
          "Access denied: You can only test your own credentials"
        );
      }

      // Redacted: avoid logging sensitive credential operations

      const response = await fetch("/api/api-credentials/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include authentication cookies
        body: JSON.stringify({ userId, provider }),
      });

      // Redacted: avoid logging sensitive credential operations

      if (!response.ok) {
        let errorDetails: any;
        try {
          errorDetails = await response.json();
          // Redacted: avoid logging sensitive credential operations
        } catch (parseError) {
          console.error(
            "[DEBUG] Failed to parse test error response:",
            parseError
          );
          errorDetails = {
            error: `HTTP ${response.status}: ${response.statusText}`,
            message: "Failed to parse error response",
          };
        }

        throw new Error(
          errorDetails.error ||
            errorDetails.message ||
            "API credentials test failed"
        );
      }

      const result = await response.json();
      // Redacted: avoid logging sensitive credential operations

      return {
        success: true,
        message:
          result.message ||
          "API credentials are valid and connection successful",
        ...result.data,
      };
    },
    onSuccess: (_data, variables) => {
      // Redacted: avoid logging sensitive credential operations

      // Invalidate all related caches when credentials test succeeds
      // This fixes the status synchronization issue identified by the swarm

      // 1. Invalidate status queries - fixes system status not updating
      queryClient.invalidateQueries({
        queryKey: ["status"],
      });

      // 2. Invalidate unified status context - matches status-context-v2 query keys
      queryClient.invalidateQueries({
        queryKey: ["status", "unified"],
      });

      // 3. Invalidate system status - refreshes system status displays
      queryClient.invalidateQueries({
        queryKey: ["status", "system"],
      });

      // 4. Invalidate connectivity status - refreshes connection state
      queryClient.invalidateQueries({
        queryKey: ["mexc", "connectivity"],
      });

      // 5. Invalidate enhanced status displays
      queryClient.invalidateQueries({
        queryKey: ["mexc", "unified-status"],
      });

      // 4. Invalidate account balance - may now be accessible with valid credentials
      queryClient.invalidateQueries({
        queryKey: ["account-balance"],
      });

      // 5. Invalidate API credentials cache for the tested user
      queryClient.invalidateQueries({
        queryKey: [
          "api-credentials",
          variables.userId,
          variables.provider || "mexc",
        ],
      });

      // Redacted: avoid logging sensitive credential operations
    },
  });
}
