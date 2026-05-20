import { NextResponse } from "next/server";
import { refreshExpiringWatches } from "@/lib/gmail-watch";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Daily cron: refresh every Gmail watch that's within 36 hours of
 * expiring. Gmail watches live for 7 days max — without this, real-time
 * labeling silently dies a week after every user enables it.
 *
 * Add to vercel.json (or your scheduler of choice):
 *   { "path": "/api/cron/gmail-watch-refresh", "schedule": "0 4 * * *" }
 *
 * Protected by CRON_SECRET (same convention as snooze-resurface).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await refreshExpiringWatches(36);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Refresh failed" },
      { status: 500 }
    );
  }
}
