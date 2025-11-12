/**
 * Dynamic Position Sizing Hook
 *
 * Provides functionality to calculate and manage dynamic position sizes
 * based on user balance and risk management.
 */

import { useCallback, useState } from "react";
import { useAuth } from "@/src/components/auth/supabase-auth-provider";
import type {
  PositionSizingConfig,
  PositionSizingResult,
} from "@/src/services/trading/dynamic-position-sizing";

interface UseDynamicPositionSizingReturn {
  calculatePositionSize: (
    customConfig?: Partial<PositionSizingConfig>,
  ) => Promise<PositionSizingResult | null>;
  updatePositionSize: (positionSize: number) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  lastCalculation: PositionSizingResult | null;
}

export function useDynamicPositionSizing(): UseDynamicPositionSizingReturn {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCalculation, setLastCalculation] = useState<PositionSizingResult | null>(null);

  const calculatePositionSize = useCallback(
    async (customConfig?: Partial<PositionSizingConfig>): Promise<PositionSizingResult | null> => {
      if (!session?.user) {
        setError("User not authenticated");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Build query string for custom config
        const params = new URLSearchParams();
        if (customConfig?.maxRiskPerTrade) {
          params.append("maxRiskPerTrade", customConfig.maxRiskPerTrade.toString());
        }
        if (customConfig?.minPositionSize) {
          params.append("minPositionSize", customConfig.minPositionSize.toString());
        }
        if (customConfig?.maxPositionSize) {
          params.append("maxPositionSize", customConfig.maxPositionSize.toString());
        }
        if (customConfig?.reserveRatio) {
          params.append("reserveRatio", customConfig.reserveRatio.toString());
        }

        const response = await fetch(
          `/api/position-sizing/calculate${params.toString() ? `?${params.toString()}` : ""}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to calculate position size");
        }

        const data = await response.json();
        const result = data.data.calculation;

        setLastCalculation(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [session],
  );

  const updatePositionSize = useCallback(
    async (positionSize: number): Promise<boolean> => {
      if (!session?.user) {
        setError("User not authenticated");
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/position-sizing/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ positionSize }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to update position size");
        }

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [session],
  );

  return {
    calculatePositionSize,
    updatePositionSize,
    isLoading,
    error,
    lastCalculation,
  };
}
