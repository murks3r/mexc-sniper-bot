/**
 * Balance Guard API
 *
 * Provides balance guard status and current balances
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiAuthWrapper } from "@/src/lib/api-auth";
import { requireClerkAuth } from "@/src/lib/clerk-auth-server";

export const GET = apiAuthWrapper(async (request: NextRequest) => {
  try {
    const user = await requireClerkAuth();
    const userId = user.id;

    // Fetch balance from account balance API
    const balanceResponse = await fetch(
      `${request.nextUrl.origin}/api/account/balance?userId=${encodeURIComponent(userId || "system")}`,
      {
        headers: {
          Cookie: request.headers.get("cookie") || "",
        },
      },
    );

    if (!balanceResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch balance data",
        },
        { status: 500 },
      );
    }

    const balanceData = await balanceResponse.json();

    if (!balanceData.success || !balanceData.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid balance data",
        },
        { status: 500 },
      );
    }

    // Transform balance data to match UI format
    const balances = balanceData.data.balances.map(
      (balance: { asset: string; free: string; locked: string }) => ({
        asset: balance.asset,
        free: balance.free,
        locked: balance.locked,
        total: (parseFloat(balance.free) + parseFloat(balance.locked)).toString(),
      }),
    );

    // Filter out zero balances for cleaner display
    const nonZeroBalances = balances.filter(
      (b: { free: string; locked: string }) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0,
    );

    return NextResponse.json({
      success: true,
      data: {
        isRunning: true, // Balance guard is always running when API is accessible
        monitoredAssets: nonZeroBalances.map((b: { asset: string }) => b.asset),
        bufferPercent: 5, // From config, could be made dynamic
        balances: nonZeroBalances,
        lastCheck: balanceData.data.lastUpdated || new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});
