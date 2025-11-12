import { type NextRequest, NextResponse } from "next/server";
import { enqueueJobUnified } from "@/src/services/queues/unified-queue";

const CRON_SECRET = process.env.JOBS_CRON_SECRET;

export async function POST(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON secret not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;

  if (token !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await enqueueJobUnified("calendar_sync", { timeWindowHours: 72, forceSync: false });
  await enqueueJobUnified("risk_check");
  await enqueueJobUnified("housekeeping");

  return NextResponse.json({ ok: true });
}
