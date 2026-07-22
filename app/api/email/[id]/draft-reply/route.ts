import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/claude";
import { rateLimit } from "@/lib/rate-limit";
import { getActiveMemories, formatMemoriesForPrompt } from "@/lib/memory";

const REPLY_SYSTEM = `You draft email replies on the user's behalf. The reply should sound like the user wrote it themselves, natural, direct, no corporate filler.

Hard rules:
- Match the tone of the original email: formal if formal, casual if casual.
- No "I hope this email finds you well" or filler openers.
- No signature, the user will add their own.
- No subject line, just the body.
- Never use em dashes. Use commas or periods instead.
- If the email is asking a question, answer it concretely (use the user's profile/context).
- If the email is automated/not really replyable (a receipt, login alert, newsletter), respond with EXACTLY this token and nothing else: NOT_REPLYABLE
- Otherwise output the reply as plain text. No quotes, no labels, no markdown.

CRITICAL: If a "USER VOICE PROFILE" is provided below, you MUST match it precisely, sentence length, capitalization style, signoff habits, vocabulary, punctuation quirks. This is more important than any default brevity rule. The reply should be indistinguishable from one the user wrote themselves.

If no voice profile is provided, default to 2-5 short sentences.`;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = rateLimit(`draft:${user.id}`, 60, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many drafts. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const service = await createServiceClient();

  const { data: email } = await service
    .from("emails")
    .select("from_name, from_email, subject, snippet, body_preview, attachments_text, received_at, user_was_last_sender, user_last_sent_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!email) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  // If the user was the last sender, this is a follow-up nudge, not a reply.
  const isFollowup = !!email.user_was_last_sender && !!email.user_last_sent_at;
  const daysSinceUserSent = isFollowup && email.user_last_sent_at
    ? Math.floor((Date.now() - new Date(email.user_last_sent_at).getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  const { data: profile } = await service
    .from("user_profile")
    .select("bio, interests, priorities, voice_profile")
    .eq("user_id", user.id)
    .single();

  const profileBlock = profile
    ? `User context:\n- Bio: ${profile.bio || ""}\n- Interests: ${(profile.interests || []).join(", ")}\n- Priorities: ${(profile.priorities || []).join(", ")}`
    : "";

  const voiceBlock = profile?.voice_profile
    ? `\n\nUSER VOICE PROFILE (match this precisely):\n${profile.voice_profile}`
    : "";

  const memories = await getActiveMemories(service, user.id, 30);
  const memoryBlock = formatMemoriesForPrompt(memories);

  const body = (email.body_preview || email.snippet || "").slice(0, 4000);
  const attachContext = email.attachments_text
    ? `\n\nATTACHMENT DETAILS (PDFs/images extracted via OCR, use these specifics in your reply when relevant):\n${email.attachments_text.slice(0, 2000)}`
    : "";

  const followupInstruction = isFollowup
    ? `\n\nIMPORTANT: This is a FOLLOW-UP, not a reply. The user already sent the last message in this thread ${daysSinceUserSent} day${daysSinceUserSent === 1 ? "" : "s"} ago, and the other person hasn't written back. Draft a SHORT, polite nudge, acknowledge it's been a while, gently re-surface the original question or ask, no guilt-trip. Examples of good follow-up openings: "Hey, circling back on this", "Just bumping this in case it got buried", "Quick nudge on the below". Keep it under 3 sentences.`
    : "";

  try {
    const client = createAnthropicClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: REPLY_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${profileBlock}${voiceBlock}${memoryBlock ? `\n\n${memoryBlock}` : ""}${followupInstruction}\n\n---\n\n${isFollowup ? "Thread to follow up on" : "Email to reply to"}:\nFrom: ${email.from_name} <${email.from_email}>\nSubject: ${email.subject}\n\n${body}${attachContext}\n\n---\n\n${isFollowup ? "Draft a follow-up nudge in the user's voice." : "Draft a reply. Use memories above and any attachment details to make the reply specific and informed."}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    if (text === "NOT_REPLYABLE") {
      return NextResponse.json({ draft: null, replyable: false });
    }
    return NextResponse.json({ draft: text, replyable: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Draft failed" },
      { status: 500 }
    );
  }
}
