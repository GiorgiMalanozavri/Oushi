/**
 * Auto-draft replies.
 *
 * Fyxer's killer feature: when a high-priority email lands, write the
 * reply for the user in their voice and stage it in Gmail's drafts
 * folder. When the user opens the thread, the reply is already there —
 * one tap to send, or a quick edit if they want to tweak.
 *
 * Pipeline:
 *   1. Ranking labels an email as "respond"
 *   2. autoDraftIfEligible() checks: opt-in on? voice trained? not
 *      already drafted? score high enough? sender real?
 *   3. Generate the draft via Claude using the user's voice profile +
 *      profile context + memories
 *   4. Push to Gmail via drafts.create
 *   5. Record the draft ID on emails.gmail_draft_id so we don't repeat
 *
 * Cost-bounded: max 5 auto-drafts per pipeline invocation, plus the
 * NOT_REPLYABLE bail token from Claude skips emails that genuinely
 * don't need replies (auto-receipts that slipped through, etc.)
 */

import { createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/claude";
import {
  createDraftReply,
  getMessageHeaders,
} from "@/lib/gmail";
import { getActiveMemories, formatMemoriesForPrompt } from "@/lib/memory";
import type { EmailRow } from "@/lib/outstanding";
import { getUserTierServerSide, TIER_LIMITS } from "@/lib/billing";

// Same system prompt the manual draft route uses — keeps quality
// consistent across "user clicked Draft Reply" and "auto-drafted in
// background". Token NOT_REPLYABLE is the bail signal.
const REPLY_SYSTEM = `You draft email replies on the user's behalf. The reply should sound like the user wrote it themselves — natural, direct, no corporate filler.

Hard rules:
- Match the tone of the original email: formal if formal, casual if casual.
- No "I hope this email finds you well" or filler openers.
- No signature — the user will add their own.
- No subject line — just the body.
- If the email is asking a question, answer it concretely (use the user's profile/context).
- If the email is automated/not really replyable (a receipt, login alert, newsletter), respond with EXACTLY this token and nothing else: NOT_REPLYABLE
- Otherwise output the reply as plain text. No quotes, no labels, no markdown.

CRITICAL: If a "USER VOICE PROFILE" is provided below, you MUST match it precisely — sentence length, capitalization style, signoff habits, vocabulary, punctuation quirks. This is more important than any default brevity rule. The reply should be indistinguishable from one the user wrote themselves.

If no voice profile is provided, default to 2-5 short sentences.`;

const MAX_PER_INVOCATION = 5;

/**
 * For every email-id in `candidateEmailIds`, attempt to create an
 * auto-draft if the user has opted in and the email is eligible. Best
 * effort across the batch — one failure doesn't stop the others.
 *
 * Returns the count successfully drafted.
 */
export async function autoDraftBatch(
  userId: string,
  candidateEmailIds: string[]
): Promise<number> {
  if (candidateEmailIds.length === 0) return 0;

  const service = await createServiceClient();

  // Check opt-in + voice trained — both required for auto-draft
  const [syncRes, profileRes] = await Promise.all([
    service
      .from("user_sync_state")
      .select("auto_draft_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("user_profile")
      .select("bio, interests, priorities, voice_profile")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!syncRes.data?.auto_draft_enabled) return 0;
  if (!profileRes.data?.voice_profile) return 0;

  // Pro-only feature. Free-tier users keep manual drafting but auto-
  // generation is part of the upgrade story. Admin emails (set via
  // OUSHI_ADMIN_EMAILS) get Pro automatically so testing works.
  const tier = await getUserTierServerSide(userId);
  if (!TIER_LIMITS[tier].features.auto_draft) return 0;

  const profile = profileRes.data;
  const profileBlock = profile
    ? `User context:\n- Bio: ${profile.bio || ""}\n- Interests: ${(profile.interests || []).join(", ")}\n- Priorities: ${(profile.priorities || []).join(", ")}`
    : "";
  const voiceBlock = profile.voice_profile
    ? `\n\nUSER VOICE PROFILE (match this precisely):\n${profile.voice_profile}`
    : "";

  // Memories live across emails — fetch once, reuse for the batch
  const memories = await getActiveMemories(service, userId, 30);
  const memoryBlock = formatMemoriesForPrompt(memories);

  // Fetch eligible emails: in our candidate list, no draft yet,
  // gmail_message_id present, scored high enough for a reply, real sender.
  const { data: emails } = await service
    .from("emails")
    .select("*")
    .in("id", candidateEmailIds.slice(0, 100))
    .is("gmail_draft_id", null)
    .gte("score", 60)
    .not("gmail_message_id", "is", null);

  if (!emails || emails.length === 0) return 0;

  const client = createAnthropicClient();
  let drafted = 0;

  // Soft cap so a busy hour doesn't generate 50 drafts at once.
  const slice = (emails as Array<EmailRow & {
    id: string;
    gmail_message_id: string;
    gmail_thread_id: string | null;
  }>).slice(0, MAX_PER_INVOCATION);

  for (const e of slice) {
    try {
      // Skip "I sent the last message" threads — those need a follow-up,
      // not a reply (and follow-ups are awkward to auto-draft).
      if (e.user_was_last_sender && e.user_last_sent_at) continue;
      // Skip emails that are clearly not addressed personally (heuristic
      // already labeled "respond" so we trust that bar)

      const userMsg = `${profileBlock}${memoryBlock ? "\n\n" + memoryBlock : ""}${voiceBlock}

ORIGINAL EMAIL:
From: ${e.from_name} <${e.from_email}>
Subject: ${e.subject}
Body:
${(e.body_preview || e.snippet || "").slice(0, 2000)}

Draft a reply.`;

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: REPLY_SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      });

      const text =
        response.content[0]?.type === "text"
          ? response.content[0].text.trim()
          : "";

      // Claude bailed — email isn't really replyable, skip.
      if (!text || text === "NOT_REPLYABLE") continue;

      // Build the headers for proper threading. If we can't fetch the
      // original message headers, the draft still creates but won't
      // thread cleanly — skip rather than create a detached draft.
      let inReplyTo: string | null = null;
      let references: string | null = null;
      let threadId: string | null = e.gmail_thread_id;
      try {
        const headers = await getMessageHeaders(userId, e.gmail_message_id);
        inReplyTo = headers.messageId;
        references = headers.references
          ? `${headers.references} ${headers.messageId || ""}`.trim()
          : headers.messageId;
        if (headers.threadId) threadId = headers.threadId;
      } catch {
        continue;
      }

      const subject = e.subject?.startsWith("Re:")
        ? e.subject
        : `Re: ${e.subject || ""}`;

      const draft = await createDraftReply(userId, {
        to: e.from_email,
        subject,
        body: text,
        inReplyTo: inReplyTo || undefined,
        references: references || undefined,
        threadId: threadId || undefined,
      });

      if (draft.draftId) {
        await service
          .from("emails")
          .update({
            gmail_draft_id: draft.draftId,
            gmail_draft_created_at: new Date().toISOString(),
          })
          .eq("id", e.id);
        drafted++;
      }
    } catch (err) {
      console.error(
        "[auto-draft] failed for email",
        e.id,
        err instanceof Error ? err.message : err
      );
    }
  }

  return drafted;
}
