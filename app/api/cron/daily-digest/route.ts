import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/claude";
import { isAutomatedEmail, type EmailRow } from "@/lib/outstanding";
import { sendEmail } from "@/lib/email/send";
import { FROM_NOREPLY, REPLY_TO } from "@/lib/email/addresses";

export const maxDuration = 300;

const DIGEST_SYSTEM = `You write a short morning email digest from "Oushi" to the user. It tells them what to pay attention to today.

Tone: Chief of staff. Direct, warm, never corporate. The user is busy.

OUTPUT FORMAT — STRICT:
Output ONLY raw HTML fragment content. No <html>, <head>, <body> tags. No markdown. No code fences (no \`\`\`html or \`\`\`). Just the inner HTML.

Structure:
1. A one-sentence headline wrapped in:
   <h2 class="oushi-headline">...</h2>
2. 2-4 short paragraphs, each highlighting ONE important item, wrapped in:
   <p class="oushi-item"><strong>Sender name</strong> — what they said and why it matters.</p>
3. If a "Waiting on you to reply" item is included, mention how many days it's been sitting.

CRITICAL RULES:
- Today's date is given at the top of the user message. Use it to anchor time references. "Tonight" means the evening of today's date — NOT a past day. If an email mentions "Tuesday 5:30pm" and today is Thursday, that shift is in the PAST. Don't say "tonight" about past days.
- Each email line includes a tag: [REPLIED] means the user already responded — DO NOT mention these as outstanding tasks. Skip them entirely, or only reference if relevant context.
- Each email line may include a [AUTOMATED] tag — these are auto-forwarded reminders, recurring shift schedules, calendar bots. Don't elevate these to the headline. If multiple are from the same source (e.g., 5 shift reminders), compress them into ONE line at most.
- No greeting like "Hi Giorgi" — jump straight in.
- Maximum 4 items. Be ruthless.
- If there is genuinely nothing important, output ONE paragraph saying so casually.
- Never invent details. Use only what's in the emails provided.
- Do NOT include any markdown formatting, code fences, or wrapping characters.`;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const now = new Date();
  const currentHourUtc = now.getUTCHours();

  // Find users whose digest hour matches now AND haven't received one today.
  // On Vercel Hobby we can only run this cron once per day, so the
  // per-user digest_hour_utc preference is moot — we accept anyone
  // enabled. The 20h "never more than once per day" guard still applies
  // so a deploy or manual rerun doesn't double-send.
  //
  // Set DIGEST_HOURLY_MODE=true in env once you're on Vercel Pro and
  // running this cron hourly — then digest_hour_utc gets honored again.
  const hourlyMode = process.env.DIGEST_HOURLY_MODE === "true";

  const { data: candidates } = await service
    .from("user_sync_state")
    .select("user_id, digest_enabled, digest_hour_utc, last_digest_sent_at")
    .eq("digest_enabled", true);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ sent: 0, users: 0 });
  }

  const dueUsers = candidates.filter((u) => {
    if (hourlyMode && u.digest_hour_utc !== currentHourUtc) return false;
    if (!u.last_digest_sent_at) return true;
    const last = new Date(u.last_digest_sent_at);
    const hoursSince = (now.getTime() - last.getTime()) / 3600000;
    return hoursSince > 20; // never more than once per ~day
  });

  const sent: Array<{ user_id: string; ok: boolean; error?: string }> = [];

  for (const candidate of dueUsers) {
    try {
      await sendDigestForUser(candidate.user_id, service);
      await service
        .from("user_sync_state")
        .update({ last_digest_sent_at: new Date().toISOString() })
        .eq("user_id", candidate.user_id);
      sent.push({ user_id: candidate.user_id, ok: true });
    } catch (e) {
      sent.push({
        user_id: candidate.user_id,
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return NextResponse.json({ users: candidates.length, due: dueUsers.length, sent });
}

// Allow manual fire (for testing) via POST without secret if logged in
export async function POST() {
  const service = await createServiceClient();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await sendDigestForUser(user.id, service);
    await service
      .from("user_sync_state")
      .update({ last_digest_sent_at: new Date().toISOString() })
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Digest failed" },
      { status: 500 }
    );
  }
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Strip markdown code fences if the model wrapped its output in them
 * (Claude sometimes adds ```html ... ``` despite explicit instructions).
 */
function stripCodeFences(input: string): string {
  let s = input.trim();
  // Pull contents out of the first code fence if present
  const fenced = s.match(/^```(?:html|HTML)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenced) return fenced[1].trim();
  // Or just strip leading/trailing fences without a full match
  s = s.replace(/^```(?:html|HTML)?\s*\n?/i, "");
  s = s.replace(/\n?```\s*$/i, "");
  return s.trim();
}

async function sendDigestForUser(userId: string, service: ServiceClient) {
  // Pull the most-important emails from the last 3 days. Filter out
  // emails the user already replied to — those aren't outstanding.
  const { data: emails } = await service
    .from("emails")
    .select("from_name, from_email, subject, snippet, body_preview, score, received_at, is_unread, user_replied, highlight, suggested_action")
    .eq("user_id", userId)
    .gte("score", 50)
    .gte("received_at", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
    .is("dismissed_at", null)
    .eq("user_replied", false)
    .order("score", { ascending: false })
    .limit(15);

  const allList = emails || [];

  // Tag automated emails so Claude knows to compress / de-emphasize them.
  // Don't drop them — sometimes the user does need to know "5 shift
  // reminders" — but Claude shouldn't write a 3-paragraph headline
  // about them.
  type EmailLite = {
    from_name: string | null;
    from_email: string | null;
    subject: string | null;
    snippet: string | null;
    body_preview: string | null;
    score: number | null;
    received_at: string;
    is_unread: boolean;
    user_replied: boolean;
    highlight: string | null;
  };
  const list = allList as EmailLite[];

  const { data: profile } = await service
    .from("user_profile")
    .select("bio, interests, priorities")
    .eq("user_id", userId)
    .single();

  const profileLine = profile
    ? `User cares about: ${(profile.priorities || []).join(", ")}. Interests: ${(profile.interests || []).join(", ")}.`
    : "";

  const now = new Date();
  const dateHeader = `Today is ${now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })} (${now.toISOString().slice(0, 10)}). Local time hint: morning of this date.`;

  const emailLines = list.slice(0, 10).map((e, i) => {
    const ageDays = Math.round((Date.now() - new Date(e.received_at).getTime()) / 86400000);
    const ageStr = ageDays === 0 ? "today" : ageDays === 1 ? "1 day ago" : `${ageDays} days ago`;
    const tags: string[] = [];
    tags.push(`${e.score}`);
    tags.push(ageStr);
    tags.push(e.is_unread ? "unread" : "read");
    if (e.user_replied) tags.push("REPLIED");
    if (isAutomatedEmail(e as unknown as EmailRow)) tags.push("AUTOMATED");
    return `${i + 1}. [${tags.join(", ")}] ${e.from_name || e.from_email}: ${e.subject}${e.highlight ? ` — ${e.highlight}` : ""}${e.snippet ? ` (preview: ${e.snippet.slice(0, 120)})` : ""}`;
  }).join("\n");

  let htmlBody: string;
  if (list.length === 0) {
    htmlBody = `
      <h2 class="oushi-headline">Your inbox is quiet.</h2>
      <p class="oushi-item">Nothing important arrived in the last few days. I'll be watching.</p>
    `;
  } else {
    const client = createAnthropicClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: DIGEST_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${dateHeader}\n\n${profileLine}\n\nEmails worth flagging:\n${emailLines}\n\nWrite the digest HTML. Remember: "tonight" = the evening of ${now.toLocaleDateString("en-US", { weekday: "long" })}. Skip [REPLIED] items. Compress [AUTOMATED] items.`,
        },
      ],
    });
    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    htmlBody = stripCodeFences(raw);
  }

  // Inline the headline + item styles since most email clients don't
  // respect <style> tags consistently (Gmail strips them).
  htmlBody = htmlBody
    .replace(
      /<h2 class="oushi-headline">/g,
      '<h2 style="font-family:Georgia,\'Source Serif 4\',serif;font-size:22px;line-height:1.3;color:#2A2520;margin:0 0 18px 0;font-weight:600;letter-spacing:-0.01em;">'
    )
    .replace(
      /<p class="oushi-item">/g,
      '<p style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2A2520;margin:0 0 14px 0;">'
    );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const dateLine = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // The Oushi mark as inline SVG — works in Gmail, Apple Mail, Outlook 365.
  // Table-based layout for maximum email-client compatibility.
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Oushi briefing</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF6EB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2A2520;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FAF6EB;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background-color:#FFFCF3;border:1px solid #E6DCC4;border-radius:14px;overflow:hidden;">
          <!-- Header: logo + brand + date -->
          <tr>
            <td style="padding:24px 28px 18px 28px;border-bottom:1px solid #E6DCC4;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <!-- Oushi mark: sky-blue rounded square with cream circle outline -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" height="32" align="center" valign="middle" style="background-color:#5E8FBF;border-radius:7px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="14" height="14" style="border:2px solid #FFFCF3;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-family:'Source Serif 4',Georgia,serif;font-size:17px;font-weight:600;color:#2A2520;letter-spacing:-0.01em;">Oushi</p>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;color:#5E8FBF;font-weight:600;">
                Daily briefing &middot; ${dateLine}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 24px 28px;">
              ${htmlBody}
              <p style="margin:24px 0 0 0;font-family:'Source Serif 4',Georgia,serif;font-size:13px;color:#A89F92;font-style:italic;">&mdash; Oushi</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px;border-top:1px solid #E6DCC4;background-color:#FAF6EB;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11.5px;color:#A89F92;">
                    Open the inbox that won&apos;t let you forget
                  </td>
                  <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11.5px;">
                    <a href="${appUrl}/dashboard" style="color:#5E8FBF;text-decoration:none;font-weight:500;">Your dashboard &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footnote outside the card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;margin-top:14px;">
          <tr>
            <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:10.5px;color:#A89F92;">
              You're receiving this because you turned on Oushi briefings &middot;
              <a href="${appUrl}/settings" style="color:#766E63;text-decoration:underline;">manage</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const { data: userRow } = await service
    .from("user_profile")
    .select("user_id")
    .eq("user_id", userId)
    .single();
  if (!userRow) throw new Error("No user");

  // Get user's email address via auth
  const { data: { user: authUser } } = await service.auth.admin.getUserById(userId);
  if (!authUser?.email) throw new Error("No email on user");

  // Use a plain ASCII separator in the subject to avoid mojibake even with
  // proper MIME encoding (some Gmail label rendering still trips on em-dash).
  // The actual email body keeps the brand typography.
  const subject = `Oushi briefing - ${new Date().toLocaleDateString("en-US", { weekday: "long" })}`;

  // Send from Oushi <noreply@oushi.app> via Resend, not from the user's
  // own Gmail. The previous path used sendEmailAsUser which used the
  // user's OAuth token → email appeared as "sent by me to myself" in
  // their inbox. Now it shows up as a proper inbound from Oushi.
  await sendEmail({
    to: authUser.email,
    subject,
    html,
    from: FROM_NOREPLY,
    replyTo: REPLY_TO,
    tags: [{ name: "type", value: "daily_digest" }],
  });
}
