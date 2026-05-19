import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedClient } from "@/lib/gmail";
import {
  extractCommitment,
  fetchRecentSent,
  autoFulfillByFollowup,
} from "@/lib/commitments";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Daily cron — for each connected user:
 *   1. Fetch sent emails since their last_scanned_message_date
 *   2. Extract new commitments (Claude, prefiltered)
 *   3. Auto-fulfill any open commitments that have a newer thread reply
 *
 * Runs once per day so Promises stays fresh without the user clicking
 * "Scan now" manually. Idempotent — re-runs are cheap.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  const { data: tokens } = await service
    .from("user_tokens")
    .select("user_id");

  if (!tokens || tokens.length === 0) {
    return NextResponse.json({ users: 0, totals: {} });
  }

  let totalExtracted = 0;
  let totalAutoFulfilled = 0;
  let totalScanned = 0;
  let usersDone = 0;
  const errors: Array<{ user_id: string; error: string }> = [];

  for (const { user_id } of tokens) {
    try {
      const { data: state } = await service
        .from("commitment_scan_state")
        .select("last_scanned_message_date")
        .eq("user_id", user_id)
        .maybeSingle();

      const sinceDate = state?.last_scanned_message_date
        ? new Date(state.last_scanned_message_date)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const oauth2Client = await getAuthenticatedClient(user_id);
      const sent = await fetchRecentSent(oauth2Client, { sinceDate, max: 60 });

      let extracted = 0;
      const batchSize = 5;
      for (let i = 0; i < sent.length; i += batchSize) {
        const batch = sent.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (s) => {
            const c = await extractCommitment(s);
            return { s, c };
          })
        );
        for (const r of results) {
          if (r.status !== "fulfilled" || !r.value.c) continue;
          const { s, c } = r.value;
          await service.from("commitments").upsert(
            {
              user_id,
              gmail_message_id: s.gmail_message_id,
              gmail_thread_id: s.gmail_thread_id,
              sent_at: s.sent_at,
              recipient_email: s.to_email,
              recipient_name: s.to_name,
              summary: c.summary,
              raw_quote: c.raw_quote,
              due_phrase: c.due_phrase,
              due_at: c.due_at_iso,
              urgency: c.urgency || "vague",
              status: "open",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,gmail_message_id,summary", ignoreDuplicates: false }
          );
          extracted++;
        }
      }

      // Update scan state
      const newestSent = sent
        .map((s) => new Date(s.sent_at).getTime())
        .reduce((a, b) => Math.max(a, b), 0);
      if (newestSent > 0) {
        await service.from("commitment_scan_state").upsert({
          user_id,
          last_scanned_message_date: new Date(newestSent).toISOString(),
          last_scanned_at: new Date().toISOString(),
        });
      }

      const autoFulfilled = await autoFulfillByFollowup(service, user_id, sent);

      totalScanned += sent.length;
      totalExtracted += extracted;
      totalAutoFulfilled += autoFulfilled;
      usersDone++;
    } catch (e) {
      errors.push({
        user_id,
        error: e instanceof Error ? e.message : "scan failed",
      });
    }
  }

  return NextResponse.json({
    users: usersDone,
    totals: {
      scanned: totalScanned,
      extracted: totalExtracted,
      autoFulfilled: totalAutoFulfilled,
    },
    errors,
    timestamp: new Date().toISOString(),
  });
}
