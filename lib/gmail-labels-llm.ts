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

// Per-batch and parallelism caps. With 10 emails per batch and 4 batches
// in flight, we cover 40 emails per ~2s LLM round-trip = ~10s of latency
// for a full first-time apply on ~200 ambiguous emails.
const EMAILS_PER_BATCH = 10;
const MAX_PARALLEL_BATCHES = 4;
// Hard ceiling per pipeline invocation to bound cost on a power user with
// thousands of new emails in a single rank. Excess emails fall back to
// the heuristic (which means "communication" → state logic).
const MAX_PER_INVOCATION = 50;

const VALID_LABELS: Set<string> = new Set(CONTENT_LABELS);

const SYSTEM_PROMPT = `You classify each email's CONTENT into ONE of:
- meeting: invitations, scheduling, calendar coordination, RSVP confirmations
- receipt: order confirmation, invoice, payment receipt, account statement
- marketing: newsletters, promotions, automated digests, ads
- fyi: notifications, status updates, info-only with no reply expected (system alerts, build notifications, social updates)
- communication: real correspondence between people that may require a response

Rules:
- Be conservative on "marketing" — only pick it if the email is clearly a broadcast/promotional/digest. A personal email mentioning a product is NOT marketing.
- Be conservative on "receipt" — only pick it for actual transactional confirmations. A regular email that mentions money is NOT a receipt.
- When in doubt between "fyi" and "communication", pick "communication". Better to surface for response than to hide as info.
- A meeting invitation with a clear .ics or RSVP request is "meeting". A casual "want to meet?" is "communication".

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
    .map(
      (e) =>
        `[${e.index}]
From: ${e.from_name} <${e.from_email}>
Subject: ${e.subject}
Body: ${e.preview}`
    )
    .join("\n\n");

  const client = createAnthropicClient();

  let raw = "";
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
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

function makeInput(email: EmailRow, index: number): LlmInput {
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
  };
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
  emails: EmailRow[]
): Promise<Map<string, ContentLabel>> {
  const candidates = emails
    .filter(needsLlmClassification)
    .slice(0, MAX_PER_INVOCATION);
  if (candidates.length === 0) return new Map();

  // Build batches of inputs with 1-based indices that match the prompt.
  const batches: LlmInput[][] = [];
  for (let i = 0; i < candidates.length; i += EMAILS_PER_BATCH) {
    const slice = candidates.slice(i, i + EMAILS_PER_BATCH);
    batches.push(slice.map((e, j) => makeInput(e, j + 1)));
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
      const service = await createServiceClient();
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
