/**
 * Commitment detection — scans the user's recent SENT emails and extracts
 * promises ("I'll send you the doc by Friday", "let me follow up tomorrow").
 *
 * Cost optimization: a regex prefilter catches ~80% of non-commitment sent
 * mail before we spend a Claude call.
 */

import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAnthropicClient, extractJson } from "@/lib/claude";

/**
 * Phrases that suggest a sent email might contain a commitment.
 * Used as a cheap prefilter — if NONE match, we skip the Claude call.
 */
const COMMITMENT_HINTS = [
  /\bi['']ll\b/i,
  /\bi will\b/i,
  /\bi'?d be happy to\b/i,
  /\bi can\b.*\b(send|share|follow|get|do|put|write|review)\b/i,
  /\bget back to (you|u)\b/i,
  /\bfollow(ing)?[- ]?up\b/i,
  /\b(send|share|share with|forward|deliver|provide|share over)\b.*\b(by|before|tomorrow|today|this week|next week|monday|tuesday|wednesday|thursday|friday|asap|soon)\b/i,
  /\b(by|before)\s+(tomorrow|today|monday|tuesday|wednesday|thursday|friday|end of (day|week)|eod|eow|next week|this week)\b/i,
  /\bplanning to\b/i,
  /\blet me (check|look|see|review|ask|run)\b/i,
  /\b(promise|commit) to\b/i,
  /\bexpect (an?|the) (answer|response|update|reply|doc|file|draft)\b/i,
  /\b(once|when) i('?ll|'ve| have| do)\b.*\b(send|share|reply|respond|update)\b/i,
];

export interface ExtractedCommitment {
  has_commitment: boolean;
  summary: string;
  raw_quote: string;
  due_phrase: string | null;
  due_at_iso: string | null;
  urgency: "today" | "this_week" | "soon" | "vague";
}

export interface SentEmailLite {
  gmail_message_id: string;
  gmail_thread_id: string;
  sent_at: string; // ISO
  to_email: string;
  to_name: string;
  subject: string;
  body: string;
}

const SYSTEM_PROMPT = `You analyze an email the user SENT and decide if it contains an OPEN COMMITMENT — something the user promised to do that the user has not yet done.

A commitment is:
- The user pledging a future action ("I'll send you the report", "let me check and follow up", "I'll review tomorrow")
- Phrased as something the user owes someone else
- Not yet completed at the time of writing

NOT commitments:
- Acknowledgments ("thanks for the feedback")
- Past actions ("I sent it earlier", "I already replied")
- Plans/events with the recipient ("see you at 3pm")
- Generic closings ("let me know if you need anything")
- Things the user is asking the other person to do
- Statements of preference or opinion

OUTPUT — strict JSON only, no prose:
{
  "has_commitment": true|false,
  "summary": "short imperative phrase, 3-8 words, starts with a verb: 'Send design doc to Sarah'",
  "raw_quote": "the exact sentence from the email containing the promise",
  "due_phrase": "tomorrow|by Friday|next week|soon|null",
  "due_at_iso": "<resolved ISO datetime, e.g. 2026-05-22T17:00:00Z> or null",
  "urgency": "today|this_week|soon|vague"
}

If has_commitment is false, set summary/raw_quote to "" and the rest to null/"vague".
If there are MULTIPLE commitments in one email, pick the most specific/binding one.
Always output valid JSON, never markdown fences.`;

/**
 * Run Claude on a single sent email. Returns null if it has no commitment.
 */
export async function extractCommitment(
  email: SentEmailLite
): Promise<ExtractedCommitment | null> {
  // Prefilter — skip if no commitment hint words
  const hay = `${email.subject}\n${email.body}`;
  const hintHit = COMMITMENT_HINTS.some((re) => re.test(hay));
  if (!hintHit) return null;

  const today = new Date().toISOString().slice(0, 10);
  const sentDate = new Date(email.sent_at).toISOString().slice(0, 10);

  const client = createAnthropicClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Today is ${today}. The email below was sent on ${sentDate}.

To: ${email.to_name} <${email.to_email}>
Subject: ${email.subject}

${email.body.slice(0, 3000)}`,
      },
      // Prefill to lock JSON output
      { role: "assistant", content: "{" },
    ],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonStr = "{" + raw;

  try {
    const parsed = JSON.parse(extractJson(jsonStr)) as ExtractedCommitment;
    if (!parsed.has_commitment) return null;
    if (!parsed.summary || parsed.summary.trim().length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Fetch sent emails from the last `days` and return parsed metadata + body.
 * Cap at `max` emails to keep cost predictable.
 */
export async function fetchRecentSent(
  oauth2Client: OAuth2Client,
  opts: { days?: number; max?: number; sinceDate?: Date } = {}
): Promise<SentEmailLite[]> {
  const { days = 30, max = 80, sinceDate } = opts;
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const since = sinceDate || new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceQ = Math.floor(since.getTime() / 1000);

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: `in:sent after:${sinceQ}`,
    maxResults: max,
  });

  const ids = (listRes.data.messages || []).map((m) => m.id!).filter(Boolean);
  if (ids.length === 0) return [];

  const out: SentEmailLite[] = [];
  // Fetch in batches of 8 to avoid hammering the API
  const batchSize = 8;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((id) =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "full",
        })
      )
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const msg = r.value.data;
      const headers: Array<{ name?: string | null; value?: string | null }> =
        msg.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

      const toRaw = getHeader("To");
      const toMatch = toRaw.match(/^(.+?)\s*<(.+?)>$/);
      const to_name = toMatch ? toMatch[1].replace(/"/g, "").trim() : toRaw;
      const to_email = toMatch ? toMatch[2] : toRaw;

      const body = extractPlainBody(msg.payload);

      out.push({
        gmail_message_id: msg.id || "",
        gmail_thread_id: msg.threadId || "",
        sent_at: msg.internalDate
          ? new Date(parseInt(msg.internalDate)).toISOString()
          : new Date().toISOString(),
        to_email,
        to_name,
        subject: getHeader("Subject"),
        body,
      });
    }
  }

  return out;
}

/**
 * Lightweight body extractor (plain text only).
 * The Gmail body can be deeply nested in multipart MIME — we walk it for
 * text/plain. If we only find text/html we strip tags as a fallback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPlainBody(payload: any): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Recurse into multiparts
    for (const part of payload.parts) {
      const inner = extractPlainBody(part);
      if (inner) return inner;
    }
    // Fall back to html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return stripHtml(decodeBase64Url(part.body.data));
      }
    }
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }

  return "";
}

function decodeBase64Url(data: string): string {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  // Remove quoted-reply blocks first
  const trimmed = html
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  return trimmed
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Auto-fulfill commitments: if the user sent another email in the same
 * thread AFTER the commitment was made, the promise is considered closed.
 *
 * `sentEmails` is the batch of sent messages we already fetched (free data —
 * no extra Gmail API calls). Returns the number of commitments auto-closed.
 *
 * Conservative by design: we only close based on the user sending again,
 * never based on inbound activity. Users can re-open mistakes via the PATCH
 * endpoint.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function autoFulfillByFollowup(
  service: SupabaseClient<any, "public", any>,
  userId: string,
  sentEmails: SentEmailLite[]
): Promise<number> {
  // Build map of thread_id -> latest sent message in that thread
  const latestByThread = new Map<string, SentEmailLite>();
  for (const s of sentEmails) {
    if (!s.gmail_thread_id) continue;
    const cur = latestByThread.get(s.gmail_thread_id);
    if (!cur || new Date(s.sent_at).getTime() > new Date(cur.sent_at).getTime()) {
      latestByThread.set(s.gmail_thread_id, s);
    }
  }

  const { data: openCommitments } = await service
    .from("commitments")
    .select("id, gmail_thread_id, gmail_message_id, sent_at")
    .eq("user_id", userId)
    .eq("status", "open");

  if (!openCommitments || openCommitments.length === 0) return 0;

  let fulfilled = 0;
  for (const c of openCommitments) {
    if (!c.gmail_thread_id) continue;
    const newest = latestByThread.get(c.gmail_thread_id);
    if (!newest) continue;

    // Must be strictly newer AND a different message than the one that
    // produced the commitment.
    const newerByTime =
      new Date(newest.sent_at).getTime() > new Date(c.sent_at).getTime();
    const differentMessage = newest.gmail_message_id !== c.gmail_message_id;
    if (!newerByTime || !differentMessage) continue;

    const { error } = await service
      .from("commitments")
      .update({
        status: "fulfilled",
        fulfilled_at: newest.sent_at,
        fulfilled_gmail_message_id: newest.gmail_message_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id)
      .eq("status", "open"); // double-check it hasn't been touched
    if (!error) fulfilled++;
  }

  return fulfilled;
}

/**
 * Real-time variant: called immediately after the user sends a reply via
 * Oushi. Closes any open commitment in that thread without needing a full
 * sent-mail scan.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function autoFulfillForThread(
  service: SupabaseClient<any, "public", any>,
  userId: string,
  threadId: string,
  fulfillingMessageId: string
): Promise<number> {
  if (!threadId) return 0;

  const { data, error } = await service
    .from("commitments")
    .update({
      status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
      fulfilled_gmail_message_id: fulfillingMessageId,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("gmail_thread_id", threadId)
    .eq("status", "open")
    .neq("gmail_message_id", fulfillingMessageId)
    .select("id");

  if (error) return 0;
  return data?.length || 0;
}
