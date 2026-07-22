import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToUser, recordNudge } from "@/lib/push";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cron: find snoozed emails whose snooze_until has passed, clear the
 * snooze, and send a push notification so the user knows their snoozed
 * email is back in the inbox.
 *
 * Runs every 15 min via .github/workflows/cron-snooze.yml.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const now = new Date();

  // Find every snoozed email whose time has come up
  const { data: due } = await service
    .from("emails")
    .select("id, user_id, from_name, from_email, subject, snooze_reason")
    .lte("snooze_until", now.toISOString())
    .not("snooze_until", "is", null)
    .limit(200);

  if (!due || due.length === 0) {
    return NextResponse.json({ resurfaced: 0, pushed: 0 });
  }

  // Clear snooze + record resurface in one batch
  const ids = due.map((r) => r.id);
  await service
    .from("emails")
    .update({
      snooze_until: null,
      snooze_reason: null,
      last_resurfaced_at: now.toISOString(),
    })
    .in("id", ids);

  // Send push notifications (per user, grouped)
  const byUser = new Map<string, typeof due>();
  for (const row of due) {
    const list = byUser.get(row.user_id) || [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  let pushed = 0;
  for (const [userId, rows] of byUser) {
    // Only one push per user per cron cycle even if multiple emails resurface
    if (rows.length === 1) {
      const r = rows[0];
      const fresh = await recordNudge(service, userId, "snooze_resurfaced", r.id);
      if (!fresh) continue;
      const who = r.from_name || r.from_email || "Someone";
      await sendPushToUser(service, userId, {
        title: `${who} is back in your inbox`,
        body: r.subject
          ? `"${r.subject.slice(0, 80)}", you'd asked me to resurface this.`
          : "An email you snoozed is back.",
        url: `/dashboard?openEmail=${r.id}`,
        tag: `snooze-${r.id}`,
        nudgeType: "snooze_resurfaced",
        resourceId: r.id,
      });
      pushed++;
    } else {
      const fresh = await recordNudge(
        service,
        userId,
        "snooze_resurfaced",
        `batch:${rows.map((r) => r.id).join(",").slice(0, 80)}`
      );
      if (!fresh) continue;
      await sendPushToUser(service, userId, {
        title: `${rows.length} snoozed emails are back`,
        body: "They've resurfaced based on the conditions you set.",
        url: "/dashboard",
        tag: `snooze-batch-${rows.length}`,
        nudgeType: "snooze_resurfaced",
      });
      pushed++;
    }
  }

  return NextResponse.json({
    resurfaced: due.length,
    pushed,
    timestamp: now.toISOString(),
  });
}
