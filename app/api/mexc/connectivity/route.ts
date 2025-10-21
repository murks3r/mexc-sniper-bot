import { NextResponse } from "next/server";

// Cache connectivity status for 5 minutes
let connectivityCache: {
  data: any;
  timestamp: number;
} | null = null;

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function checkMexcConnectivityFast() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (connectivityCache && (now - connectivityCache.timestamp) < CACHE_DURATION) {
    return connectivityCache.data;
  }

  try {
    // Quick ping to MEXC API without authentication
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch("https://api.mexc.com/api/v3/ping", {
      method: "GET",
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    const result = {
      status: response.ok ? "healthy" : "warning",
      message: response.ok ? "MEXC API is reachable" : "MEXC API responded with error",
      connectivity: response.ok,
      timestamp: new Date().toISOString(),
    };

    // Cache the successful result
    if (response.ok) {
      connectivityCache = {
        data: result,
        timestamp: now
      };
    }

    return result;
  } catch (error) {
    return {
      status: "warning",
      message: "Failed to reach MEXC API",
      connectivity: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    };
  }
}

export async function GET() {
  try {
    const result = await checkMexcConnectivityFast();
    return NextResponse.json(result);
  } catch (error) {
    console.error("MEXC connectivity check failed:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Connectivity check failed",
        connectivity: false,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
