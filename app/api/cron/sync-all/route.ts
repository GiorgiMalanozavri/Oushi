import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncRecentEmails } from "@/lib/gmail";
import { rankUnrankedEmails } from "@/lib/ranking";
import { syncCalendarForUser } from "@/lib/calendar";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const { data: tokens } = await supabase
    .from("user_tokens")
    .select("user_id");

  if (!tokens || tokens.length === 0) {
    return NextResponse.json({ synced: 0, users: 0 });
  }

  const results: Array<{
    user_id: string;
    synced: number;
    ranked: number;
    cal_events: number;
    cal_matched: number;
    error?: string;
  }> = [];

  for (const { user_id } of tokens) {
    try {
      const synced = await syncRecentEmails(user_id, 30);
      let ranked = 0;
      try {
        ranked = await rankUnrankedEmails(user_id);
      } catch (rankErr) {
        results.push({
          user_id,
          synced,
          ranked: 0,
          cal_events: 0,
          cal_matched: 0,
          error: rankErr instanceof Error ? rankErr.message : "rank failed",
        });
        continue;
      }

      // Sync calendar — best-effort, never blocks email sync
      let cal_events = 0;
      let cal_matched = 0;
      try {
        const calResult = await syncCalendarForUser(supabase, user_id, 48);
        cal_events = calResult.events;
        cal_matched = calResult.matched;
      } catch (e) {
        console.error("[sync-all] calendar sync failed for", user_id, e instanceof Error ? e.message : e);
      }

      results.push({ user_id, synced, ranked, cal_events, cal_matched });
    } catch (e) {
      results.push({
        user_id,
        synced: 0,
        ranked: 0,
        cal_events: 0,
        cal_matched: 0,
        error: e instanceof Error ? e.message : "sync failed",
      });
    }
  }

  return NextResponse.json({
    users: tokens.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
