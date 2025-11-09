import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { createSimpleLogger } from "../lib/unified-logger";

/**
 * Hook for comprehensive status refresh across all auto-sniping components
 * Ensures UI updates immediately after start/stop actions
 */
export function useStatusRefresh() {
  const queryClient = useQueryClient();
  const logger = createSimpleLogger("useStatusRefresh");

  const refreshAllStatus = useCallback(async () => {
    logger.debug("Refreshing all status queries for immediate UI updates");

    // 1. Auto-sniping specific queries
    queryClient.invalidateQueries({ queryKey: ["autoSniping"] });
    queryClient.invalidateQueries({ queryKey: ["auto-sniping"] });

    // 2. System status queries
    queryClient.invalidateQueries({ queryKey: ["status"] });
    queryClient.invalidateQueries({ queryKey: ["mexc", "connectivity"] });

    // 3. Strategy and configuration queries
    queryClient.invalidateQueries({ queryKey: ["strategy"] });
    queryClient.invalidateQueries({ queryKey: ["configuration"] });

    // 4. Force immediate refetch of critical auto-sniping status
    await queryClient.refetchQueries({ queryKey: ["autoSniping", "status"], type: "all" });

    logger.debug("All status queries refreshed");
  }, [queryClient, logger.debug]);

  const refreshAutoSnipingStatus = useCallback(async () => {
    logger.debug("Refreshing auto-sniping status");

    // Target just auto-sniping related queries for faster updates
    queryClient.invalidateQueries({ queryKey: ["autoSniping"] });
    queryClient.invalidateQueries({ queryKey: ["auto-sniping"] });

    await queryClient.refetchQueries({ queryKey: ["autoSniping", "status"], type: "all" });

    logger.debug("Auto-sniping status refreshed");
  }, [queryClient, logger.debug]);

  return {
    refreshAllStatus,
    refreshAutoSnipingStatus,
  };
}
