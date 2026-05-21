/**
 * LLM-assisted content classification for the Gmail label pipeline.
 *
 * The heuristic in `lib/gmail-labels-shared.ts` handles clear cases —
 * calendar invites, transactional receipts, noise-category newsletters,
 * login alerts — but falls back to null on real correspondence and
 * ambiguous auto-updates. That's exactly where Fyxer-class accuracy
 * shows up: distinguishing "weekly Stripe digest" (marketing) from
 * "Stripe support reply" (communication), or "Meeting confirmed by Cal"
 * (meeting) from "Can we meet tomorrow?" (communication).
 *
 * This module batches the ambiguous ones to claude-haiku-4-5 and caches
 * the verdict on `emails.gmail_label_llm_key` so we never pay twice
 * for the same email.
 */

import { createAnthropicClient, extractJson } from "@/lib/claude";
import { createServiceClient } from "@/lib/supabase/server";
import {
  type ContentLabel,
  CONTENT_LABELS,
  needsLlmClassification,
} from "@/lib/gmail-labels-shared";
import type { EmailRow } from "@/lib/outstanding";
import type { SupabaseClient } from "@supabase/supabase-js";

// Per-batch and parallelism caps. With 10 emails per batch and 4 batches
// in flight, we cover 40 emails per ~2s LLM round-trip = ~10s of latency
// for a full first-time apply on ~200 ambiguous emails.
const EMAILS_PER_BATCH = 10;
const MAX_PARALLEL_BATCHES = 4;
// Default per-invocation ceiling to bound cost on a power user with
// thousands of new emails in a single rank. Excess emails fall back to
// the heuristic (which means "communication" → state logic).
//
// Callers can pass a higher ceiling for one-time backfills — /api/labels/apply
// uses ~200 so the first run on a 30-day window LLM-classifies the whole
// ambiguous set in one shot. /api/rank uses the default because it only
// sees new emails since the last sync.
export const DEFAULT_MAX_PER_INVOCATION = 50;

const VALID_LABELS: Set<string> = new Set(CONTENT_LABELS);

const SYSTEM_PROMPT = `You classify each email's CONTENT into ONE of:
- meeting: invitations, scheduling, calendar coordination, RSVP confirmations
- receipt: order confirmation, invoice, payment receipt, account statement, FLIGHT/HOTEL/TRIP confirmation, booking confirmation, shipment tracking
- marketing: newsletters, promotions, automated digests, ads, bulk announcements, job-aggregator alerts (Lensa/Indeed/etc.)
- fyi: notifications, status updates, WELCOME / onboarding / "thanks for signing up", info-only with no reply expected (system alerts, build notifications, social updates)
- communication: real correspondence between people that may require a response

Specific guidance — these are the cases the heuristic gets wrong most often:

1. WELCOME / ONBOARDING emails are FYI, never Receipt.
   • "Thanks for signing up to Oushi" → fyi
   • "Welcome to Linear" → fyi
   • "Verify your email" → fyi
   • "Get started with Notion" → fyi
   The word "subscription" alone does not mean receipt — only a paid
   subscription confirmation with a charge amount is a receipt.

2. TRAVEL is Receipt.
   • "Your flight to Tokyo" → receipt
   • "Boarding pass — AA1234" → receipt
   • "Hotel booking confirmation" → receipt
   • "Your trip to Boston is tomorrow" → receipt
   • "Itinerary for your Tokyo trip" → receipt
   • "Departure reminder — Flight DL204" → receipt
   Even though airlines/hotels look like "notifications," the user
   needs these accessible. Treat them as receipts so they live in the
   reference bucket.

3. JOB AGGREGATORS are Marketing, regardless of how relevant the
   subject sounds.
   • Lensa, Indeed, ZipRecruiter, Glassdoor, Monster, Handshake → marketing
   • "Be the first to apply to X" → marketing
   • "New jobs near you" → marketing
   • "Just in: Foo Co has new openings" → marketing
   A REAL job opportunity comes from an individual recruiter writing
   personally, not from a broadcast platform.

4. NEWSLETTER PLATFORMS (Substack, Beehiiv, mailchi.mp campaigns) are
   Marketing unless the sender is clearly an individual writing to the
   user. Curated personal letters between two people are communication.

5. Be conservative on Receipt:
   • Real receipts contain money + a confirmation number or order ID.
   • An email mentioning money in passing ("I'll Venmo you the $20") is
     communication, not receipt.

6. When in doubt between FYI and communication, pick communication.
   Better to surface than to hide.

7. A "Re:" subject is almost always communication unless the body is
   clearly an auto-digest or auto-receipt.

8. Sender reputation hint is a strong signal:
   • "trusted" sender writing personally → communication
   • "unknown" sender + digest-shaped email → marketing
   • "known automated" sender → fyi (or receipt/marketing if obvious)

Output STRICT JSON only, no prose:
{"results":[{"i":1,"label":"meeting"},{"i":2,"label":"communication"}]}

The "i" field matches the email's bracketed index in the input.`;

interface LlmInput {
  id: string;
  index: number; // 1-based for the prompt
  from_name: string;
  from_email: string;
  subject: string;
  preview: string;
  // Extra context that improves accuracy meaningfully — sender history and
  // (for Re: threads) the original message snippet. Either may be empty.
  senderHint: string;
  threadHint: string;
}

/**
 * Run one batch through Claude. Returns Map<emailId, ContentLabel>.
 * Failures (network, parse, missing entries) just yield no entry for
 * that email — the caller falls back to the heuristic default.
 */
async function classifyOneBatch(
  batch: LlmInput[]
): Promise<Map<string, ContentLabel>> {
  const result = new Map<string, ContentLabel>();
  if (batch.length === 0) return result;

  const userMsg = batch
    .map((e) => {
      const parts = [
        `[${e.index}]`,
        `From: ${e.from_name} <${e.from_email}>`,
      ];
      if (e.senderHint) parts.push(`Sender: ${e.senderHint}`);
      parts.push(`Subject: ${e.subject}`);
      if (e.threadHint) parts.push(`Prior in thread: ${e.threadHint}`);
      parts.push(`Body: ${e.preview}`);
      return parts.join("\n");
    })
    .join("\n\n");

  const client = createAnthropicClient();

  let raw = "";
  try {
    // Cache the system prompt — it's identical across every label
    // classification call. Anthropic returns 90% discount on cached
    // input tokens after the first call within ~5min.
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMsg }],
    });
    raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  } catch (e) {
    console.error(
      "[gmail-labels-llm] Claude call failed",
      e instanceof Error ? e.message : e
    );
    return result;
  }

  let parsed: { results?: Array<{ i: number; label: string }> };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch (e) {
    console.error(
      "[gmail-labels-llm] JSON parse failed",
      e instanceof Error ? e.message : e,
      "raw=",
      raw.slice(0, 200)
    );
    return result;
  }

  const byIndex = new Map(batch.map((b) => [b.index, b.id]));
  for (const r of parsed.results || []) {
    if (typeof r.i !== "number") continue;
    const emailId = byIndex.get(r.i);
    if (!emailId) continue;
    if (!VALID_LABELS.has(r.label)) continue;
    result.set(emailId, r.label as ContentLabel);
  }

  return result;
}

function makeInput(
  email: EmailRow,
  index: number,
  senderHint: string,
  threadHint: string
): LlmInput {
  // Truncate aggressively — Haiku is good with short context, and
  // we're optimizing for cost. 350 chars per email × 10 emails = 3500
  // chars per batch, well under any model limit.
  const preview =
    (email.body_preview || email.snippet || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 350);
  return {
    id: (email as EmailRow & { id: string }).id,
    index,
    from_name: (email.from_name || "").slice(0, 80),
    from_email: (email.from_email || "").slice(0, 100),
    subject: (email.subject || "").slice(0, 150),
    preview,
    senderHint,
    threadHint,
  };
}

/**
 * Look up sender reputation + thread-parent snippets in batch so each
 * email gets contextual hints in the LLM prompt. Returns lookup maps
 * keyed by lower-cased sender email and gmail_thread_id.
 *
 * Sender hint is a short string ("trusted", "known automated",
 * "unknown sender", etc.) — much cheaper for the LLM to consume than a
 * raw reputation number.
 */
async function enrichContext(
  service: SupabaseClient,
  userId: string,
  emails: EmailRow[]
): Promise<{
  senderHints: Map<string, string>;
  threadHints: Map<string, string>;
}> {
  const senderHints = new Map<string, string>();
  const threadHints = new Map<string, string>();

  const senders = Array.from(
    new Set(
      emails
        .map((e) => (e.from_email || "").toLowerCase())
        .filter((s) => s.length > 0)
    )
  );

  if (senders.length > 0) {
    try {
      const { data: reps } = await service
        .from("sender_reputation")
        .select("sender_email, reputation")
        .eq("user_id", userId)
        .in("sender_email", senders);
      for (const r of (reps || []) as Array<{
        sender_email: string;
        reputation: number;
      }>) {
        const email = r.sender_email.toLowerCase();
        // Convert numeric reputation into a short label the LLM can use.
        if (r.reputation >= 30) {
          senderHints.set(email, "trusted (you've engaged with them before)");
        } else if (r.reputation <= -30) {
          senderHints.set(email, "low priority (you've ignored them before)");
        } else if (r.reputation !== 0) {
          senderHints.set(email, "known contact");
        }
      }
    } catch (e) {
      console.error(
        "[gmail-labels-llm] sender reputation lookup failed",
        e instanceof Error ? e.message : e
      );
    }
  }

  // For Re:/Fwd: emails, find the earliest message in the same thread —
  // that's the original we're replying to, and it's the most useful
  // signal for understanding what the thread is about.
  const reThreads = new Set<string>();
  for (const e of emails) {
    const subj = (e.subject || "").trim();
    if (!subj) continue;
    if (!/^(re|fwd|fw):\s/i.test(subj)) continue;
    const tid = (e as EmailRow & { gmail_thread_id?: string }).gmail_thread_id;
    if (tid) reThreads.add(tid);
  }

  if (reThreads.size > 0) {
    try {
      const { data: parents } = await service
        .from("emails")
        .select("gmail_thread_id, subject, snippet, received_at")
        .eq("user_id", userId)
        .in("gmail_thread_id", Array.from(reThreads))
        .order("received_at", { ascending: true })
        .limit(reThreads.size * 4);
      // Group by thread and keep the earliest.
      const seenThread = new Set<string>();
      for (const p of (parents || []) as Array<{
        gmail_thread_id: string;
        subject: string;
        snippet: string;
      }>) {
        if (seenThread.has(p.gmail_thread_id)) continue;
        seenThread.add(p.gmail_thread_id);
        const hint = `${p.subject || ""} — ${(p.snippet || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200)}`.trim();
        if (hint) threadHints.set(p.gmail_thread_id, hint);
      }
    } catch (e) {
      console.error(
        "[gmail-labels-llm] thread parent lookup failed",
        e instanceof Error ? e.message : e
      );
    }
  }

  return { senderHints, threadHints };
}

/**
 * Filter to emails that need LLM classification, then run Claude in
 * parallel batches and persist the results to `emails.gmail_label_llm_key`.
 *
 * Returns a Map<emailId, ContentLabel> for emails that were successfully
 * classified — caller should merge this into in-memory rows so the same
 * rank pass uses the fresh verdicts without an extra DB round-trip.
 */
export async function classifyAmbiguousEmails(
  emails: EmailRow[],
  userId?: string,
  options: { maxPerInvocation?: number } = {}
): Promise<Map<string, ContentLabel>> {
  const cap = Math.max(1, options.maxPerInvocation ?? DEFAULT_MAX_PER_INVOCATION);
  const candidates = emails.filter(needsLlmClassification).slice(0, cap);
  if (candidates.length === 0) return new Map();

  const service = await createServiceClient();

  // Enrich context for accuracy. Without a userId we skip enrichment
  // (the caller didn't tell us whose reputation to look up) — the LLM
  // still works, just without sender/thread hints.
  let senderHints = new Map<string, string>();
  let threadHints = new Map<string, string>();
  if (userId) {
    try {
      const enriched = await enrichContext(service, userId, candidates);
      senderHints = enriched.senderHints;
      threadHints = enriched.threadHints;
    } catch (e) {
      console.error(
        "[gmail-labels-llm] enrichContext failed",
        e instanceof Error ? e.message : e
      );
    }
  }

  // Build batches of inputs with 1-based indices that match the prompt.
  const batches: LlmInput[][] = [];
  for (let i = 0; i < candidates.length; i += EMAILS_PER_BATCH) {
    const slice = candidates.slice(i, i + EMAILS_PER_BATCH);
    batches.push(
      slice.map((e, j) => {
        const from = (e.from_email || "").toLowerCase();
        const tid = (e as EmailRow & { gmail_thread_id?: string }).gmail_thread_id;
        return makeInput(
          e,
          j + 1,
          senderHints.get(from) || "",
          tid ? threadHints.get(tid) || "" : ""
        );
      })
    );
  }

  // Run batches in parallel chunks
  const merged = new Map<string, ContentLabel>();
  for (let i = 0; i < batches.length; i += MAX_PARALLEL_BATCHES) {
    const chunk = batches.slice(i, i + MAX_PARALLEL_BATCHES);
    const settled = await Promise.all(chunk.map((b) => classifyOneBatch(b)));
    for (const m of settled) {
      for (const [id, label] of m) merged.set(id, label);
    }
  }

  // Persist verdicts so we don't re-classify next rank. Group by label
  // to keep the number of UPDATE statements small.
  if (merged.size > 0) {
    try {
      const now = new Date().toISOString();
      const byLabel = new Map<ContentLabel, string[]>();
      for (const [id, label] of merged) {
        const list = byLabel.get(label) || [];
        list.push(id);
        byLabel.set(label, list);
      }
      for (const [label, ids] of byLabel) {
        for (let i = 0; i < ids.length; i += 500) {
          const idChunk = ids.slice(i, i + 500);
          await service
            .from("emails")
            .update({ gmail_label_llm_key: label, gmail_label_llm_at: now })
            .in("id", idChunk);
        }
      }
    } catch (e) {
      console.error(
        "[gmail-labels-llm] persist failed",
        e instanceof Error ? e.message : e
      );
    }
  }

  return merged;
}

/**
 * Decorate in-memory email rows with the freshly-computed LLM labels so
 * `computeLabelForEmail` (which reads `gmail_label_llm_key`) sees the
 * verdicts without a re-fetch.
 */
export function mergeLlmLabels(
  emails: EmailRow[],
  llmMap: Map<string, ContentLabel>
): void {
  if (llmMap.size === 0) return;
  for (const e of emails) {
    const id = (e as EmailRow & { id: string }).id;
    const label = llmMap.get(id);
    if (label) {
      (e as EmailRow).gmail_label_llm_key = label;
    }
  }
}
