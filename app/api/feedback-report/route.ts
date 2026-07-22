import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { feedbackReportEmail } from "@/lib/email/templates";
import { EMAIL_SUPPORT, FROM_HELLO } from "@/lib/email/addresses";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

/**
 * POST /api/feedback-report
 * Body: { message: string, pageUrl?: string }
 *
 * Saves the user's in-app feedback to feedback_reports AND emails
 * support@oushi.app so the team sees it in inbox immediately. Falls
 * back gracefully if RESEND_API_KEY isn't configured (still saves the
 * DB row).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 10 reports per 5 min — generous enough for a chatty bug session,
  // tight enough to stop a runaway script.
  const limit = rateLimit(`feedback-report:${user.id}`, 10, 5 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Slow down, too many reports. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const message = String(body?.message || "").trim().slice(0, 4000);
  const pageUrl = String(body?.pageUrl || "").slice(0, 500);
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) || "";

  if (message.length < 3) {
    return NextResponse.json(
      { error: "Tell us a bit more, even a few words helps." },
      { status: 400 }
    );
  }

  const service = await createServiceClient();
  const { data: row, error: insertError } = await service
    .from("feedback_reports")
    .insert({
      user_id: user.id,
      message,
      page_url: pageUrl || null,
      user_agent: userAgent || null,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Email support@oushi.app so it lands in the team inbox right now.
  // Best-effort — if Resend isn't configured, the DB row still went in.
  const fromName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    null;
  const tpl = feedbackReportEmail({
    fromEmail: user.email || "(unknown)",
    fromName,
    message,
    pageUrl: pageUrl || "(unknown)",
    userAgent,
    userId: user.id,
  });

  const sent = await sendEmail({
    to: EMAIL_SUPPORT,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    // Send from hello@ (not noreply@) since the reply-to chain matters —
    // if you hit reply on this feedback notification, you reply to the
    // actual user, not to noreply.
    from: FROM_HELLO,
    replyTo: user.email || undefined,
    tags: [{ name: "type", value: "feedback_report" }],
  });

  if (sent.ok) {
    await service
      .from("feedback_reports")
      .update({ emailed: true })
      .eq("id", row.id);
  }

  return NextResponse.json({
    ok: true,
    id: row.id,
    emailed: sent.ok,
  });
}
