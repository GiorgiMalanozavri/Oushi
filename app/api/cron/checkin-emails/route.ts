import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { checkInEmail } from "@/lib/email/templates";
import { FROM_GIORGI } from "@/lib/email/addresses";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Daily cron: find users whose welcome email landed ~24h ago and who
 * haven't received the day-1 check-in yet. Send it.
 *
 * Add to vercel.json:
 *   { "path": "/api/cron/checkin-emails", "schedule": "0 14 * * *" }
 *   (14:00 UTC ≈ ~9am ET — adjust if your users are mostly elsewhere)
 *
 * Protected by CRON_SECRET like the other cron routes.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const day = 24 * 60 * 60 * 1000;
  // 20h-36h window — wide enough to catch users on either side of the
  // cron's clock and not miss anyone, narrow enough that a late-running
  // cron doesn't re-send to users who already got it.
  const olderThan = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const newerThan = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

  const { data: due } = await service
    .from("user_profile")
    .select("user_id, welcome_sent_at")
    .is("checkin_sent_at", null)
    .not("welcome_sent_at", "is", null)
    .lte("welcome_sent_at", olderThan)
    .gte("welcome_sent_at", newerThan);

  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // We need the user's email + name from auth — batch-fetch via admin API
  const userIds = due.map((d) => d.user_id);
  let users: Array<{
    id: string;
    email: string | null;
    user_metadata: Record<string, unknown>;
  }> = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (await (service.auth as any).admin.listUsers({
      page: 1,
      perPage: 1000,
    })) as { data: { users: typeof users } };
    users = data?.users || [];
  } catch (e) {
    console.error(
      "[cron/checkin-emails] listUsers failed",
      e instanceof Error ? e.message : e
    );
    return NextResponse.json({ ok: false, error: "Couldn't list users" }, { status: 500 });
  }

  const userById = new Map(users.map((u) => [u.id, u]));
  let sent = 0;
  let failed = 0;

  for (const row of due) {
    if (!userIds.includes(row.user_id)) continue;
    const u = userById.get(row.user_id);
    if (!u?.email) {
      failed++;
      continue;
    }
    const firstName =
      ((u.user_metadata?.full_name as string | undefined) ||
        (u.user_metadata?.name as string | undefined) ||
        "")
        .split(" ")[0] || null;
    const tpl = checkInEmail(firstName);
    const result = await sendEmail({
      to: u.email,
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
      from: FROM_GIORGI,
      tags: [{ name: "type", value: "checkin_day1" }],
    });
    if (result.ok) {
      await service
        .from("user_profile")
        .update({ checkin_sent_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, considered: due.length, sent, failed });
}
