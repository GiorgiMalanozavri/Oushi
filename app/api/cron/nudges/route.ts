import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToUser, recordNudge } from "@/lib/push";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Hourly cron — checks every user with push subscriptions and fires nudges for:
 *
 *   1. commitment_overdue — a Promise whose due_at has passed and still open
 *   2. awaiting_stale     — an email opened 48h+ ago with no reply, score >= 50
 *
 * Dedup via push_nudges_sent. Each nudge fires once per (user, type, resource_id).
 *
 * Auth: Bearer CRON_SECRET (matches the other cron jobs).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  // Only consider users who actually have a push subscription registered.
  const { data: subs } = await service
    .from("push_subscriptions")
    .select("user_id");

  if (!subs || subs.length === 0) {
    return NextResponse.json({ users: 0, nudges: 0 });
  }

  const userIds = Array.from(new Set(subs.map((s) => s.user_id))).filter(Boolean);

  let total = 0;
  const perUser: Record<string, { commitments: number; stale: number }> = {};

  for (const userId of userIds) {
    perUser[userId] = { commitments: 0, stale: 0 };

    // --- Check push_enabled preference ---
    const { data: state } = await service
      .from("user_sync_state")
      .select("push_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (state && state.push_enabled === false) continue;

    // --- 1. Overdue commitments ---
    const { data: overdueCommitments } = await service
      .from("commitments")
      .select("id, summary, recipient_name, recipient_email, due_at, gmail_thread_id")
      .eq("user_id", userId)
      .eq("status", "open")
      .lt("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(5);

    for (const c of overdueCommitments || []) {
      const fresh = await recordNudge(service, userId, "commitment_overdue", c.id);
      if (!fresh) continue;
      const who = c.recipient_name || c.recipient_email || "someone";
      const overdueDays = Math.floor(
        (Date.now() - new Date(c.due_at).getTime()) / (24 * 60 * 60 * 1000)
      );
      const day = overdueDays === 0 ? "today" : overdueDays === 1 ? "1 day overdue" : `${overdueDays} days overdue`;
      await sendPushToUser(service, userId, {
        title: `You owe ${who}`,
        body: `${c.summary} — ${day}.`,
        url: "/dashboard?view=promises",
        tag: `commitment-${c.id}`,
        nudgeType: "commitment_overdue",
        resourceId: c.id,
      });
      total++;
      perUser[userId].commitments++;
    }

    // --- 2. Stale awaiting reply (opened 48h+, no reply, score >= 50) ---
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: staleEmails } = await service
      .from("emails")
      .select("id, from_name, from_email, subject, received_at")
      .eq("user_id", userId)
      .eq("is_read", true)
      .eq("user_replied", false)
      .is("dismissed_at", null)
      .gte("score", 50)
      .lte("received_at", cutoff)
      .order("score", { ascending: false })
      .limit(3);

    for (const e of staleEmails || []) {
      const fresh = await recordNudge(service, userId, "awaiting_stale", e.id);
      if (!fresh) continue;
      const ageDays = Math.floor(
        (Date.now() - new Date(e.received_at).getTime()) / (24 * 60 * 60 * 1000)
      );
      const who = e.from_name || e.from_email || "Someone";
      await sendPushToUser(service, userId, {
        title: `${who} is waiting on you`,
        body: `"${(e.subject || "").slice(0, 80)}" — ${ageDays}d unanswered.`,
        url: "/dashboard?view=awaiting",
        tag: `awaiting-${e.id}`,
        nudgeType: "awaiting_stale",
        resourceId: e.id,
      });
      total++;
      perUser[userId].stale++;
    }
  }

  return NextResponse.json({
    users: userIds.length,
    nudges: total,
    breakdown: perUser,
    timestamp: new Date().toISOString(),
  });
}
