import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * Hook for comprehensive status refresh across all auto-sniping components
 * Ensures UI updates immediately after start/stop actions
 */
export function useStatusRefresh() {
  const queryClient = useQueryClient();

  const refreshAllStatus = useCallback(async () => {
    console.log("🔄 Refreshing all status queries for immediate UI updates...");

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
    
    console.log("✅ All status queries refreshed");
  }, [queryClient]);

  const refreshAutoSnipingStatus = useCallback(async () => {
    console.log("🔄 Refreshing auto-sniping status...");
    
    // Target just auto-sniping related queries for faster updates
    queryClient.invalidateQueries({ queryKey: ["autoSniping"] });
    queryClient.invalidateQueries({ queryKey: ["auto-sniping"] });
    
    await queryClient.refetchQueries({ queryKey: ["autoSniping", "status"], type: "all" });
    
    console.log("✅ Auto-sniping status refreshed");
  }, [queryClient]);

  return {
    refreshAllStatus,
    refreshAutoSnipingStatus,
  };
} 