import { createAnthropicClient, extractJson } from "@/lib/claude";
import {
  applyLabelsBatch,
  computeLabelForEmail,
  type OushiLabelKey,
} from "@/lib/gmail-labels";
import {
  classifyAmbiguousEmails,
  mergeLlmLabels,
} from "@/lib/gmail-labels-llm";
import { autoDraftBatch } from "@/lib/auto-draft";
import { createServiceClient } from "@/lib/supabase/server";
import { prefilter } from "@/lib/prefilter";
import {
  getActiveMemories,
  formatMemoriesForPrompt,
  saveExtractedMemories,
  type ExtractedMemory,
} from "@/lib/memory";

const RANKING_SYSTEM = `You are a personal email triage assistant. You rank emails based on a specific user's profile AND surface the specific reason a user might care.

Output ONLY valid JSON in this exact shape:
{
  "score": <integer 0-100>,
  "category": "critical" | "useful" | "low_priority" | "noise",
  "reasoning": "<one sentence, max 15 words — internal note about WHY you scored this way>",
  "requires_action": <boolean>,
  "highlight": "<null OR one sentence, max 25 words — what specifically in this email matches the user's interests/priorities. Speak directly to the user. Return null if nothing specifically matches.>",
  "matched_interests": [<array of strings, the user's exact interest/priority tags this email maps to. Empty array if no match.>],
  "matched_topics": [<array of strings, the user's exact TOPIC BOARD names this email belongs to. Use the names verbatim from the "USER TOPICS" list. An email can belong to multiple topics. Empty array if none apply.>],
  "suggested_action": {
    "label": "<short imperative button label, max 4 words — e.g. 'Reply yes', 'Add to calendar', 'Save booking number', 'Confirm interview Thursday', 'Forward to team'>",
    "type": "reply" | "calendar" | "save" | "open" | "ignore",
    "detail": "<one-line specific suggestion, max 20 words — e.g. 'Reply: Thursday 2pm works for me.' or 'Save confirmation #MYE8MC for your trip on May 12.' Use null if no clear action.>"
  },
  "memories": [
    {
      "kind": "person" | "project" | "commitment" | "deadline" | "preference" | "context",
      "subject": "<short entity name, max 60 chars — canonical form, e.g. 'Maya Chen' not 'Maya'>",
      "content": "<one sentence, max 200 chars — the durable fact to remember>",
      "ttl_days": <integer days this memory stays valid; 30 / 90 / 365 typical>
    }
  ]
}

Memory extraction rules (this is the most important part):
- Most emails should yield 0-2 memories. Many yield none. Be conservative.
- Extract ONLY things that are TRUE and explicitly in this email. NEVER invent or speculate.
- DO extract: human relationships and their roles, ongoing projects, commitments the user made, deadlines mentioned, user preferences expressed, durable context about the user's life.
- DO NOT extract: login alerts, promotional content, generic newsletter facts, anything trivial or auto-generated, anything from automated senders.
- Subjects must be canonical and specific: "Maya Chen — Verge editor" not "Maya". "Berlin AI conference CFP" not "the conference".
- ttl_days: for deadlines, set to days until deadline. People/projects: 90. Preferences/context: 365. Commitments: until the deadline mentioned.

Example good memories (DON'T copy these unless they apply):
- {"kind":"person","subject":"Maya Chen","content":"Editor at The Verge, prefers weekly drafts by Thursday","ttl_days":90}
- {"kind":"deadline","subject":"Berlin AI conference CFP","content":"Proposal deadline May 22, $500 honorarium","ttl_days":14}
- {"kind":"commitment","subject":"Q3 contract response","content":"Agreed to send signed contract back by May 20","ttl_days":21}
- {"kind":"context","subject":"NYC trip","content":"Traveling June 4-8, staying with sister","ttl_days":60}

Scoring guide:
- 90-100: time-sensitive AND directly relevant TO THIS USER. An interview invite from a real recruiter, a deadline a real person set for them, a project update from someone they actually work with. Personal correspondence.
- 75-89: directly relevant but not urgent — a newsletter the user clearly chose, a personally-addressed opportunity from a real human.
- 50-74: tangentially useful (general updates from orgs they're in, conference CFPs they'd plausibly care about).
- 25-49: low signal but not noise (broad announcements, generic updates).
- 0-24: noise — promotions, automated receipts, irrelevant marketing, broadcast aggregator alerts.

CRITICAL: BROADCAST EMAILS ARE NOT URGENT, EVEN WHEN THEY MATCH AN INTEREST.
The user's interest list ("internships", "engineering jobs", "AI news",
etc.) is what they want to KNOW about — not what to be interrupted by.
Score the following as 0-24 (noise) regardless of keyword match:
  - Job-aggregator alerts: Lensa, Indeed, ZipRecruiter, Glassdoor,
    LinkedIn job alerts, Monster, Handshake digests, anything with
    "Aggregator" / "Aggregated" / "Digest" in the sender name.
  - Subject patterns like "Be the first to apply", "Just in:", "New
    jobs near you", "Matches your search", "Today's top jobs", "Your
    daily/weekly digest", "We found jobs", "Top stories", "Trending
    in X" — these are sent to thousands of users.
  - Newsletter platforms (Substack, Beehiiv, Mailchimp campaigns)
    unless the user EXPLICITLY listed that newsletter by name.
  - Social-network digests (LinkedIn "comm/" emails, Facebook
    notifications) unless they're a direct person-to-person message.
A real opportunity for THIS user comes from an individual human or a
company writing to them personally — not from a broadcast platform.

Highlight rules:
- Only write a highlight if there's a SPECIFIC connection to the user's interests/priorities. Vague matches get null.
- Quote or paraphrase the specific thing in the email that matches.
- NEVER write a highlight for login alerts, receipts, routine automated emails, OR broadcast aggregator alerts.
- matched_interests must use the EXACT strings from the user's interests/priorities list, not paraphrases.

Be honest. Most emails should score under 50. Aggregator broadcasts should ALL score under 25.`;

interface UserProfile {
  bio: string;
  interests: string[];
  priorities: string[];
  noise: string[];
}

interface EmailToRank {
  id: string;
  from_name: string;
  from_email: string;
  subject: string;
  body_preview: string | null;
  snippet: string;
  attachments_text?: string | null;
}

interface SuggestedAction {
  label: string;
  type: "reply" | "calendar" | "save" | "open" | "ignore";
  detail: string | null;
}

interface UserTopic {
  name: string;
  description: string | null;
}

interface RankingResult {
  score: number;
  category: "critical" | "useful" | "low_priority" | "noise";
  reasoning: string;
  requires_action: boolean;
  highlight: string | null;
  matched_interests: string[];
  matched_topics: string[];
  suggested_action: SuggestedAction | null;
  memories?: ExtractedMemory[];
}

async function rankEmail(
  profile: UserProfile,
  email: EmailToRank,
  feedbackContext: string,
  topics: UserTopic[] = [],
  memoryBlock: string = ""
): Promise<RankingResult> {
  const topicsBlock = topics.length > 0
    ? `\nUSER TOPICS (boards the user wants emails sorted into — one email can match multiple, or none):\n${topics.map((t) => `- "${t.name}"${t.description ? `: ${t.description}` : ""}`).join("\n")}`
    : `\nUSER TOPICS: (none defined — return empty matched_topics array)`;

  // Split the prompt into a CACHED block (stable per user across a rank
  // pass — system + profile + memories + topics + feedback) and a FRESH
  // block (the email being ranked). Anthropic caches the prefix for ~5min
  // at 90% discount on reads → big savings when we rank a batch of
  // emails for the same user in a tight loop.
  const cachedContext = `USER PROFILE:
Bio: ${profile.bio}
Interests: ${profile.interests.join(", ")}
What they always care about: ${profile.priorities.join(", ")}
What they consider noise: ${profile.noise.join(", ")}
${topicsBlock}
${memoryBlock ? `\n${memoryBlock}` : ""}
${feedbackContext ? `\nPAST FEEDBACK (use to calibrate):\n${feedbackContext}` : ""}`;

  const freshContent = `EMAIL:
From: ${email.from_name} <${email.from_email}>
Subject: ${email.subject}
Preview: ${email.body_preview?.slice(0, 500) || email.snippet}${email.attachments_text ? `\n\nATTACHMENT CONTENT (extracted from PDFs/images):\n${email.attachments_text.slice(0, 2500)}` : ""}

Rank this email for this user, and extract any durable memories.`;

  const client = createAnthropicClient();
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        // System prompt + per-user context are cached as one block so
        // every rank call after the first within ~5min pays 10% on the
        // cached portion. Cache writes are 25% more expensive on the
        // first call but it pays back after just 2-3 emails.
        system: [
          { type: "text", text: RANKING_SYSTEM },
          {
            type: "text",
            text: cachedContext,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: freshContent }],
      });
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  const rawText =
    response!.content[0].type === "text" ? response!.content[0].text : "";
  return JSON.parse(extractJson(rawText));
}

export async function rankUnrankedEmails(userId: string) {
  const supabase = await createServiceClient();

  const { data: profile } = await supabase
    .from("user_profile")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!profile) throw new Error("No user profile found");

  const { data: userTopics } = await supabase
    .from("user_topics")
    .select("name, description")
    .eq("user_id", userId)
    .order("position", { ascending: true });

  const topics: UserTopic[] = (userTopics || []).map((t) => ({
    name: t.name,
    description: t.description,
  }));

  // Load active memories once and inject as a single block on every email
  const activeMemories = await getActiveMemories(supabase, userId, 50);
  const memoryBlock = formatMemoriesForPrompt(activeMemories);

  // Only rank emails that have NO score AND have NO feedback
  const { data: feedbackEmailIds } = await supabase
    .from("feedback")
    .select("email_id")
    .eq("user_id", userId);

  const feedbackSet = new Set(
    (feedbackEmailIds || []).map((f) => f.email_id)
  );

  const { data: unranked } = await supabase
    .from("emails")
    .select("id, from_name, from_email, subject, body_preview, snippet, attachments_text")
    .eq("user_id", userId)
    .is("score", null)
    .order("received_at", { ascending: false });

  const toRank = (unranked || []).filter((e) => !feedbackSet.has(e.id));
  if (toRank.length === 0) return 0;

  // Build feedback context from history
  const { data: recentFeedback } = await supabase
    .from("feedback")
    .select("signal, emails(from_email, subject, score, category)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  let feedbackContext = "";
  if (recentFeedback && recentFeedback.length > 0) {
    const lines = recentFeedback
      .filter((f) => {
        const emails = f.emails as unknown;
        return emails !== null;
      })
      .map((f) => {
        const e = f.emails as unknown as Record<string, unknown>;
        return `- User ${f.signal === "upvote" ? "LIKED" : "DISLIKED"}: "${e.subject}" from ${e.from_email} (was scored ${e.score}, ${e.category})`;
      });
    feedbackContext = lines.join("\n");
  }

  // Build sender reputation from two sources:
  //   1. Explicit feedback (upvote/downvote on specific emails)
  //   2. Bootstrap signals (sent-to, starred, important — from initial Gmail scan)
  // Both contribute to the same map; feedback is binary (-1/+1), bootstrap
  // contributes a scaled value so a strong existing relationship gives a
  // meaningful day-1 score bump.
  const senderRep: Record<string, number> = {};

  const { data: allFeedback } = await supabase
    .from("feedback")
    .select("signal, emails(from_email)")
    .eq("user_id", userId);
  if (allFeedback) {
    for (const f of allFeedback) {
      const e = f.emails as unknown as Record<string, unknown> | null;
      if (!e?.from_email) continue;
      const sender = e.from_email as string;
      if (!senderRep[sender]) senderRep[sender] = 0;
      senderRep[sender] += f.signal === "upvote" ? 1 : -1;
    }
  }

  const { data: bootstrapRep } = await supabase
    .from("sender_reputation")
    .select("sender_email, reputation")
    .eq("user_id", userId);
  if (bootstrapRep) {
    for (const r of bootstrapRep) {
      const sender = r.sender_email;
      if (!senderRep[sender]) senderRep[sender] = 0;
      // Bootstrap reputation is on a -100..100 scale. Down-weight to roughly
      // match the feedback signal (1 unit = ~10 pts of score adjustment below).
      senderRep[sender] += Math.round((r.reputation || 0) / 5);
    }
  }

  // Pre-filter cheap noise — write directly without calling Claude
  const prefiltered: Array<{ id: string } & RankingResult> = [];
  const needsClaude: typeof toRank = [];
  for (const email of toRank) {
    const pre = prefilter(email);
    if (pre) {
      prefiltered.push({
        id: email.id,
        ...pre,
        highlight: null,
        matched_interests: [],
        matched_topics: [],
        suggested_action: null,
      });
    } else {
      needsClaude.push(email);
    }
  }

  let ranked = 0;

  // Run prefilter UPDATEs in parallel. Was a sequential await loop —
  // N round-trips serialized for purely-noise emails that share no
  // ordering constraint.
  if (prefiltered.length > 0) {
    await Promise.all(
      prefiltered.map(async (result) => {
        await supabase
          .from("emails")
          .update({
            score: result.score,
            category: result.category,
            reasoning: result.reasoning,
            requires_action: result.requires_action,
          })
          .eq("id", result.id);
      })
    );
    ranked += prefiltered.length;
  }

  const batchSize = 10;
  for (let i = 0; i < needsClaude.length; i += batchSize) {
    const batch = needsClaude.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (email) => {
        try {
          const result = await rankEmail(profile, email, feedbackContext, topics, memoryBlock);

          const rep = senderRep[email.from_email] || 0;
          let adjustedScore = result.score + rep * 10;
          adjustedScore = Math.max(0, Math.min(100, adjustedScore));

          const category =
            adjustedScore >= 75
              ? "critical"
              : adjustedScore >= 40
                ? "useful"
                : adjustedScore >= 20
                  ? "low_priority"
                  : "noise";

          const topicNames = new Set(topics.map((t) => t.name));
          const matchedTopics = Array.isArray(result.matched_topics)
            ? result.matched_topics.filter((t: string) => topicNames.has(t))
            : [];

          return {
            id: email.id,
            score: adjustedScore,
            category: category as RankingResult["category"],
            reasoning: result.reasoning,
            requires_action: result.requires_action,
            highlight: result.highlight || null,
            matched_interests: Array.isArray(result.matched_interests) ? result.matched_interests : [],
            matched_topics: matchedTopics,
            suggested_action: result.suggested_action || null,
            memories: Array.isArray(result.memories) ? result.memories : [],
          };
        } catch {
          return {
            id: email.id,
            score: 25,
            category: "low_priority" as const,
            reasoning: "Could not rank — defaulting to low priority",
            requires_action: false,
            highlight: null,
            matched_interests: [] as string[],
            matched_topics: [] as string[],
            suggested_action: null as SuggestedAction | null,
            memories: [] as ExtractedMemory[],
          };
        }
      })
    );

    // Parallelize all the DB writes for this Claude batch — UPDATEs are
    // independent, memory saves are independent, no ordering required.
    const writeOps: Array<Promise<unknown>> = [];
    for (const result of results) {
      writeOps.push(
        (async () => {
          await supabase
            .from("emails")
            .update({
              score: result.score,
              category: result.category,
              reasoning: result.reasoning,
              requires_action: result.requires_action,
              highlight: result.highlight,
              matched_interests: result.matched_interests,
              matched_topics: result.matched_topics,
              suggested_action: result.suggested_action,
            })
            .eq("id", result.id);
        })()
      );
      ranked++;

      // Save extracted memories (skip noise/low-priority — usually nothing useful)
      if (result.memories && result.memories.length > 0 && result.score >= 30) {
        writeOps.push(
          saveExtractedMemories(supabase, userId, result.id, result.memories).catch((e) => {
            console.error("[ranking] memory save failed", e);
          })
        );
      }
    }
    await Promise.all(writeOps);
  }

  // Auto-apply Gmail labels for users who've opted in. Best-effort —
  // never blocks the rank from returning. Two passes:
  //   (a) Newly-ranked emails: re-fetch fresh rows (we need user_replied /
  //       is_unread / is_read / score for the classifier, and the prefiltered
  //       + Claude-ranked sets have only partial views).
  //   (b) Stale already-labeled emails: any email in the 14-day window whose
  //       state has moved since gmail_label_applied_at gets re-classified
  //       and re-applied. This is the self-heal that keeps Gmail in sync
  //       when the user replies, dismisses, snoozes, or a new thread message
  //       arrives — without us, those labels stay wrong forever.
  try {
    const { data: optIn } = await supabase
      .from("user_sync_state")
      .select("gmail_labels_enabled, gmail_labels_window_days")
      .eq("user_id", userId)
      .maybeSingle();
    if (optIn?.gmail_labels_enabled) {
      // Self-heal window must match the apply backfill window — otherwise
      // any email in (windowDays-14, windowDays] gets labeled but never
      // corrected when state changes. Clamp to the same 7–60 range the
      // apply route enforces.
      const windowDays = Math.max(
        7,
        Math.min(60, optIn.gmail_labels_window_days || 30)
      );
      // Pre-load the user's label overrides so manual decisions win over
      // the heuristic ("user said this is a Receipt, not Respond").
      const { data: overrideRows } = await supabase
        .from("email_label_overrides")
        .select("email_id, override_label_key")
        .eq("user_id", userId);
      const overrides = new Map<string, OushiLabelKey | null>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (overrideRows || []) as any[]) {
        overrides.set(r.email_id, r.override_label_key ?? null);
      }

      // Pre-load sender rules — "always label sender X as Y" persistent
      // rules. They win over heuristic/LLM but not over per-email overrides.
      const { data: senderRuleRows } = await supabase
        .from("label_sender_rules")
        .select("sender_pattern, pattern_type, label_key")
        .eq("user_id", userId);
      const senderRules = (senderRuleRows || []) as Array<{
        sender_pattern: string;
        pattern_type: "email" | "domain";
        label_key: OushiLabelKey | null;
      }>;

      // Collect every candidate row in one place so the LLM pass below
      // sees both newly-ranked emails and stale-self-heal candidates in
      // a single batch. The seenIds set dedupes if the same id shows
      // up in both buckets.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidateRows: any[] = [];
      const seenIds = new Set<string>();

      // ── (a) Newly-ranked emails ──────────────────────────────────────
      const newlyRankedIds = [
        ...prefiltered.map((r) => r.id),
        ...needsClaude.map((e) => e.id),
      ];
      if (newlyRankedIds.length > 0) {
        const { data: freshRows } = await supabase
          .from("emails")
          .select("*")
          .in("id", newlyRankedIds);
        if (freshRows) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const row of freshRows as any[]) {
            if (!row.gmail_message_id || seenIds.has(row.id)) continue;
            seenIds.add(row.id);
            candidateRows.push(row);
          }
        }
      }

      // ── (b) Stale-label self-heal ────────────────────────────────────
      // Pull every previously-labeled email in the configured window,
      // then in JS find ones whose any state timestamp moved AFTER
      // gmail_label_applied_at. The window matches what `apply` covers;
      // older emails get re-labeled only if the user re-runs apply.
      const since = new Date(
        Date.now() - windowDays * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: maybeStale } = await supabase
        .from("emails")
        .select("*")
        .eq("user_id", userId)
        .not("gmail_label_applied_at", "is", null)
        .gte("received_at", since)
        .limit(2000);

      if (maybeStale) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of maybeStale as any[]) {
          if (!row.gmail_message_id || seenIds.has(row.id)) continue;
          const appliedAt = new Date(row.gmail_label_applied_at).getTime();
          // Any state timestamp newer than appliedAt means the label
          // *might* now be wrong — re-classify to be safe.
          const stateMaxMs = Math.max(
            row.last_thread_message_at ? new Date(row.last_thread_message_at).getTime() : 0,
            row.dismissed_at ? new Date(row.dismissed_at).getTime() : 0,
            row.followup_dismissed_at ? new Date(row.followup_dismissed_at).getTime() : 0,
            row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0,
            row.user_last_sent_at ? new Date(row.user_last_sent_at).getTime() : 0,
            row.snooze_until ? new Date(row.snooze_until).getTime() : 0
          );
          if (stateMaxMs > appliedAt) {
            seenIds.add(row.id);
            candidateRows.push(row);
          }
        }
      }

      // ── LLM pass on the ambiguous subset ────────────────────────────
      // classifyAmbiguousEmails internally filters via needsLlmClassification
      // (skips rows the heuristic already handles or that we've already
      // classified), respects a per-invocation ceiling, and persists the
      // verdicts so we never re-classify the same email. We merge the
      // fresh map into the in-memory rows so computeLabelForEmail below
      // sees the new gmail_label_llm_key without a re-fetch.
      try {
        const llmMap = await classifyAmbiguousEmails(candidateRows, userId);
        if (llmMap.size > 0) mergeLlmLabels(candidateRows, llmMap);
      } catch (e) {
        // Best-effort — heuristic fallback covers all rows on failure.
        console.error(
          "[ranking] LLM label classification failed",
          e instanceof Error ? e.message : e
        );
      }

      // ── Build decisions and apply ────────────────────────────────────
      const decisions: Array<{
        emailId: string;
        gmailMessageId: string;
        labelKey: OushiLabelKey | null;
      }> = [];
      for (const row of candidateRows) {
        const override = overrides.has(row.id) ? overrides.get(row.id) : undefined;
        decisions.push({
          emailId: row.id,
          gmailMessageId: row.gmail_message_id,
          labelKey: computeLabelForEmail(row, override, senderRules),
        });
      }
      if (decisions.length > 0) {
        await applyLabelsBatch(userId, decisions);
      }

      // Auto-draft replies for everything we labeled "respond" — only
      // if the user opted in + trained their voice. Best-effort, won't
      // block return. Internally bounded to 5 drafts per invocation
      // so a busy hour doesn't fire 50 LLM calls.
      const respondCandidates = decisions
        .filter((d) => d.labelKey === "respond" && d.emailId)
        .map((d) => d.emailId as string);
      if (respondCandidates.length > 0) {
        try {
          await autoDraftBatch(userId, respondCandidates);
        } catch (e) {
          console.error(
            "[ranking] autoDraftBatch failed",
            e instanceof Error ? e.message : e
          );
        }

      }
    }
  } catch (e) {
    console.error("[ranking] gmail label apply failed", e instanceof Error ? e.message : e);
  }

  return ranked;
}
