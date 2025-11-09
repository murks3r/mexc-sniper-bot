import { NextResponse } from "next/server";
import { getUnifiedMexcClient } from "@/src/services/api/mexc-unified-exports";

export async function GET() {
  try {
    const mexcClient = getUnifiedMexcClient();
    const serverTime = await mexcClient.getServerTime();

    return NextResponse.json({
      success: true,
      serverTime,
      timestamp: new Date().toISOString(),
      localTime: Date.now(),
    });
  } catch (error) {
    // MEXC server time fetch failed - error logging handled by error handler middleware

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        serverTime: null,
        timestamp: new Date().toISOString(),
        localTime: Date.now(),
      },
      { status: 500 },
    );
  }
}
