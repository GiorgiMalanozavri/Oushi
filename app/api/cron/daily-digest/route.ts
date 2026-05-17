import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/claude";
import { sendEmailAsUser } from "@/lib/gmail";

export const maxDuration = 300;

const DIGEST_SYSTEM = `You write a short, personal email digest from "Oushi" to the user. It is sent at the start of their day to tell them what to pay attention to.

Tone: Like a chief of staff. Direct, warm, never corporate. The user is busy.

Structure (HTML, NOT markdown — output valid HTML that renders in an email client):
1. A one-sentence headline summarizing the day, wrapped in <h2 style="font-family:Georgia,serif;font-size:20px;color:#1a1a1a;margin:0 0 16px 0;font-weight:normal;">...</h2>
2. 2-4 short paragraphs, each highlighting ONE important item. Lead each with the sender's name in bold. Use <p style="font-size:15px;line-height:1.6;color:#333;margin:0 0 12px 0;"><strong>Sender</strong> — what they said and why it matters.</p>
3. If a "Waiting on you to reply" item is included, mention it has been sitting for X days.
4. End with a single line: <p style="font-size:13px;color:#888;margin:24px 0 0 0;font-style:italic;">— Oushi</p>

Rules:
- No greeting like "Hi Giorgi" — jump straight in.
- Maximum 4 items. Be ruthless.
- If there is genuinely nothing important, output ONE paragraph saying so casually.
- Never invent details. Use only what's in the emails provided.
- Output ONLY the HTML body (no <html>, <head>, or <body> tags).`;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const now = new Date();
  const currentHourUtc = now.getUTCHours();

  // Find users whose digest hour matches now AND haven't received one today
  const { data: candidates } = await service
    .from("user_sync_state")
    .select("user_id, digest_enabled, digest_hour_utc, last_digest_sent_at")
    .eq("digest_enabled", true);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ sent: 0, users: 0 });
  }

  const dueUsers = candidates.filter((u) => {
    if (u.digest_hour_utc !== currentHourUtc) return false;
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

async function sendDigestForUser(userId: string, service: ServiceClient) {
  // Pull the most-important emails from the last 3 days
  const { data: emails } = await service
    .from("emails")
    .select("from_name, from_email, subject, snippet, body_preview, score, received_at, is_unread, user_replied, highlight, suggested_action")
    .eq("user_id", userId)
    .gte("score", 50)
    .gte("received_at", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
    .is("dismissed_at", null)
    .order("score", { ascending: false })
    .limit(15);

  const list = emails || [];

  const { data: profile } = await service
    .from("user_profile")
    .select("bio, interests, priorities")
    .eq("user_id", userId)
    .single();

  const profileLine = profile
    ? `User cares about: ${(profile.priorities || []).join(", ")}. Interests: ${(profile.interests || []).join(", ")}.`
    : "";

  const emailLines = list.slice(0, 10).map((e, i) => {
    const ageDays = Math.round((Date.now() - new Date(e.received_at).getTime()) / 86400000);
    const ageStr = ageDays === 0 ? "today" : ageDays === 1 ? "1 day ago" : `${ageDays} days ago`;
    return `${i + 1}. [${e.score}, ${ageStr}, ${e.is_unread ? "unread" : "read"}${e.user_replied ? ", replied" : ""}] ${e.from_name || e.from_email}: ${e.subject}${e.highlight ? ` — ${e.highlight}` : ""}${e.snippet ? ` (preview: ${e.snippet.slice(0, 120)})` : ""}`;
  }).join("\n");

  let htmlBody: string;
  if (list.length === 0) {
    htmlBody = `
      <h2 style="font-family:Georgia,serif;font-size:20px;color:#1a1a1a;margin:0 0 16px 0;font-weight:normal;">Your inbox is quiet.</h2>
      <p style="font-size:15px;line-height:1.6;color:#333;margin:0 0 12px 0;">Nothing important arrived in the last few days. I'll be watching.</p>
      <p style="font-size:13px;color:#888;margin:24px 0 0 0;font-style:italic;">— Oushi</p>
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
          content: `${profileLine}\n\nEmails worth flagging:\n${emailLines}\n\nWrite the digest HTML.`,
        },
      ],
    });
    htmlBody = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  }

  // Wrap in a clean email template
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="border-bottom:1px solid #eee;padding-bottom:16px;margin-bottom:24px;">
      <p style="font-family:'Source Serif 4',Georgia,serif;font-size:18px;font-weight:600;color:#D97757;margin:0;letter-spacing:-0.01em;">Oushi</p>
      <p style="font-size:11px;color:#888;margin:4px 0 0 0;text-transform:uppercase;letter-spacing:0.12em;font-family:ui-monospace,monospace;">Daily Briefing · ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
    </div>
    ${htmlBody}
    <div style="margin-top:40px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#aaa;">
      Open Oushi → <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard" style="color:#D97757;text-decoration:none;">your dashboard</a>
    </div>
  </div>
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

  const subject = `Oushi — ${new Date().toLocaleDateString("en-US", { weekday: "long" })} briefing`;

  await sendEmailAsUser(userId, {
    to: authUser.email,
    subject,
    body: html,
    html: true,
  });
}
