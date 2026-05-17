import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedClient, parseGmailMessage } from "@/lib/gmail";
import { createAnthropicClient } from "@/lib/claude";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const VOICE_SYSTEM = `You analyze a sample of emails the user has written. Your job is to extract a writing-style profile so future AI-drafted replies can sound like THEM.

Output ONLY a short style description (no JSON, no headers, no markdown). Cover:
- Typical length (short/medium/long; sentence counts)
- Formality level (casual, professional, mixed)
- Capitalization habits (sentence case? lowercase? Title Case?)
- Greeting and sign-off habits (none / "Hi", "Hey", "Thanks,", initials, etc.)
- Recurring phrases, hedges, or filler words
- Punctuation quirks (dashes, em-dashes, ellipses, exclamation use)
- Overall tone (warm, dry, direct, hesitant, playful)

Write it as a single paragraph (4-7 sentences) that another AI could read and immediately match the user's voice. Be specific and observant. Avoid generic descriptors.

If the sample is too short or all-automated, output exactly: INSUFFICIENT_SAMPLE`;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Voice learning is expensive — 3 attempts per hour is plenty
  const limit = rateLimit(`voice:${user.id}`, 3, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Just learned recently. Try again in ${Math.ceil((limit.retryAfterSeconds || 60) / 60)} min.` },
      { status: 429 }
    );
  }

  const service = await createServiceClient();

  let oauth2Client;
  try {
    oauth2Client = await getAuthenticatedClient(user.id);
  } catch {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Get the user's own email so we can confirm "from me"
  const profile = await gmail.users.getProfile({ userId: "me" });
  const userEmail = (profile.data.emailAddress || "").toLowerCase();

  // Pull up to 30 messages from Sent. We'll filter to actual human-authored ones.
  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults: 30,
    q: "in:sent -from:noreply -from:no-reply",
  });

  const messageIds = listRes.data.messages || [];
  if (messageIds.length === 0) {
    return NextResponse.json(
      { error: "No sent emails found — can't learn your voice yet." },
      { status: 400 }
    );
  }

  const samples: string[] = [];
  const batchSize = 8;
  for (let i = 0; i < messageIds.length && samples.length < 15; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((m) =>
        gmail.users.messages.get({ userId: "me", id: m.id!, format: "full" })
      )
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const parsed = parseGmailMessage(r.value.data);
      // Skip auto-acknowledgments and very short messages
      const body = (parsed.body_preview || "").trim();
      if (body.length < 40) continue;
      // Skip ones that are mostly a quoted reply chain
      const cleaned = stripQuotedReply(body);
      if (cleaned.length < 40) continue;
      samples.push(cleaned.slice(0, 1500));
      if (samples.length >= 15) break;
    }
  }

  if (samples.length < 3) {
    return NextResponse.json(
      { error: `Only found ${samples.length} usable sent emails. Need at least 3.` },
      { status: 400 }
    );
  }

  const corpus = samples
    .map((s, i) => `--- Email ${i + 1} ---\n${s}`)
    .join("\n\n");

  try {
    const client = createAnthropicClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: VOICE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Sender: ${userEmail}\n\nSample of ${samples.length} sent emails:\n\n${corpus}\n\nDescribe their writing voice.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    if (text === "INSUFFICIENT_SAMPLE") {
      return NextResponse.json(
        { error: "Sample wasn't varied enough to learn a voice." },
        { status: 400 }
      );
    }

    await service
      .from("user_profile")
      .update({
        voice_profile: text,
        voice_learned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return NextResponse.json({ ok: true, voice: text, samples_used: samples.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Voice learning failed" },
      { status: 500 }
    );
  }
}

function stripQuotedReply(text: string): string {
  // Strip everything from "On <date>, <person> wrote:" onwards
  const onWroteRegex = /\n+On .+wrote:[\s\S]*/i;
  let cleaned = text.replace(onWroteRegex, "");
  // Strip "> ..." quoted lines block at the end
  cleaned = cleaned.replace(/(\n>[^\n]*)+\s*$/g, "");
  // Strip signature divider and below
  cleaned = cleaned.replace(/\n--\s*\n[\s\S]*$/, "");
  return cleaned.trim();
}
