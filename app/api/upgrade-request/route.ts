import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { EMAIL_SUPPORT, FROM_HELLO } from "@/lib/email/addresses";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/upgrade-request
 *   Body: { source?: string, reason?: string }
 *
 * Captures Pro upgrade intent. Saves a row to upgrade_requests AND
 * emails support@oushi.app so the team sees it instantly. No payment
 * processing yet — for the beta we manually grant Pro by setting
 * user_profile.subscription_tier='pro'. Stripe wire-up comes later.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 5 requests/hour — humans don't need more, scripts don't get more
  const limit = rateLimit(`upgrade-req:${user.id}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Slow down, try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const source = String(body?.source || "settings").slice(0, 60);
  const reason = String(body?.reason || "").slice(0, 1000) || null;

  const service = await createServiceClient();
  const { error } = await service.from("upgrade_requests").insert({
    user_id: user.id,
    source,
    reason,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify the team — best-effort, doesn't fail the request if Resend
  // is misconfigured.
  const fromName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    null;

  await sendEmail({
    to: EMAIL_SUPPORT,
    subject: `[Pro upgrade] ${fromName || user.email}`,
    from: FROM_HELLO,
    replyTo: user.email || undefined,
    text: `${fromName || "(no name)"} <${user.email}> wants to upgrade to Pro.

Source: ${source}
User ID: ${user.id}

Reason / context:
${reason || "(none provided)"}

To grant: UPDATE user_profile SET subscription_tier='pro' WHERE user_id='${user.id}';`,
    html: `<p style="font-family:Georgia,serif;font-size:18px;margin:0 0 12px">${escapeHtml(fromName || "(no name)")} wants to upgrade to Pro.</p>
<table style="width:100%;font-size:13px;color:#766E63;border-collapse:collapse">
  <tr><td style="padding:4px 0;width:80px">Email</td><td><a href="mailto:${user.email}" style="color:#B86B4A">${user.email}</a></td></tr>
  <tr><td style="padding:4px 0">Source</td><td><code>${escapeHtml(source)}</code></td></tr>
  <tr><td style="padding:4px 0">User ID</td><td><code>${user.id}</code></td></tr>
</table>
${reason ? `<div style="margin-top:20px;padding:16px;background:#FAF6EB;border-radius:8px;border-left:3px solid #B86B4A;white-space:pre-wrap">${escapeHtml(reason)}</div>` : ""}
<p style="font-size:12px;color:#A89F92;margin-top:24px">To grant Pro:<br/><code>UPDATE user_profile SET subscription_tier='pro' WHERE user_id='${user.id}';</code></p>`,
    tags: [
      { name: "type", value: "upgrade_request" },
      { name: "source", value: source },
    ],
  });

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
