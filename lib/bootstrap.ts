/**
 * Behavioral bootstrap: seed personalization from the user's existing Gmail
 * BEFORE we ask Claude to rank anything. Replaces the "Claude guesses what
 * matters to a new user" cold-start with "Claude knows who the user already
 * talks to, who they star, what they reply to."
 *
 * Signals (all free, no Claude calls):
 *   - SENT-TO frequency: people the user emails a lot are people they care about
 *   - REPLY behavior: threads where the user wrote multiple times = active relationships
 *   - STARRED senders: the user literally told Google these mattered
 *   - IMPORTANT label: Google's own importance signal mirrored back
 */

import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedClient } from "@/lib/gmail";

interface SenderSignal {
  reputation: number;
  source: string;
  count: number;
}

interface BootstrapResult {
  sent_examined: number;
  starred_examined: number;
  important_examined: number;
  senders_seeded: number;
  memory_entries_created: number;
  emails_boosted: number;
}

const MAX_SENT = 200;
const MAX_STARRED = 100;
const MAX_IMPORTANT = 100;
const LOOKBACK_DAYS = 180;

const SELF_EMAIL_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^mailer-daemon@/i,
];

function parseAddressList(raw: string): Array<{ email: string; name: string }> {
  if (!raw) return [];
  // Split on commas not inside quotes/brackets — naive but Gmail headers are
  // generally well-formed.
  const parts = raw.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const out: Array<{ email: string; name: string }> = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(.*?)\s*<([^>]+)>$/);
    if (m) {
      out.push({ name: m[1].replace(/"/g, "").trim(), email: m[2].toLowerCase() });
    } else if (trimmed.includes("@")) {
      out.push({ name: "", email: trimmed.toLowerCase() });
    }
  }
  return out;
}

function isSelfishAddress(email: string): boolean {
  return SELF_EMAIL_PATTERNS.some((re) => re.test(email));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchMessageBatch(gmail: any, query: string, max: number) {
  const cutoff = Math.floor((Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000);
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: `${query} after:${cutoff}`,
    maxResults: max,
  });
  const ids = (listRes.data.messages || []).map((m: { id?: string }) => m.id).filter(Boolean) as string[];
  if (ids.length === 0) return [];

  // Headers-only metadata fetch — much cheaper than full bodies
  const batch = 10;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += batch) {
    const slice = ids.slice(i, i + batch);
    const results = await Promise.allSettled(
      slice.map((id) =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value?.data) out.push(r.value.data);
    }
  }
  return out;
}

/**
 * Main entry — run once per user after sign-in.
 */
export async function bootstrapPersonalization(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, "public", any>,
  userId: string,
  userEmail: string | null
): Promise<BootstrapResult> {
  const result: BootstrapResult = {
    sent_examined: 0,
    starred_examined: 0,
    important_examined: 0,
    senders_seeded: 0,
    memory_entries_created: 0,
    emails_boosted: 0,
  };

  let gmail;
  try {
    const oauth2 = await getAuthenticatedClient(userId);
    gmail = google.gmail({ version: "v1", auth: oauth2 });
  } catch (e) {
    console.error("[bootstrap] auth failed", e instanceof Error ? e.message : e);
    return result;
  }

  const selfEmail = userEmail?.toLowerCase() || null;
  // Aggregate per-sender signals here, then apply once at the end
  const signals = new Map<string, SenderSignal>();
  const nameByEmail = new Map<string, string>();

  function addSignal(email: string, name: string, reputation: number, source: string) {
    if (!email || isSelfishAddress(email)) return;
    if (selfEmail && email === selfEmail) return;
    const existing = signals.get(email);
    if (existing) {
      existing.reputation += reputation;
      existing.count += 1;
      // Keep the strongest provenance label
      existing.source = source;
    } else {
      signals.set(email, { reputation, source, count: 1 });
    }
    if (name && !nameByEmail.has(email)) nameByEmail.set(email, name);
  }

  // ---- SENT-TO frequency (strongest signal: you actively email them) ----
  try {
    const sent = await fetchMessageBatch(gmail, "in:sent", MAX_SENT);
    result.sent_examined = sent.length;

    // Group by thread to detect multi-reply conversations
    const sentByThread = new Map<string, number>();
    for (const m of sent) {
      if (m.threadId) {
        sentByThread.set(m.threadId, (sentByThread.get(m.threadId) || 0) + 1);
      }
    }

    for (const m of sent) {
      const headers: Array<{ name?: string | null; value?: string | null }> =
        m.payload?.headers || [];
      const getHeader = (n: string) =>
        headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value || "";

      const recipients = [
        ...parseAddressList(getHeader("To")),
        ...parseAddressList(getHeader("Cc")),
      ];

      // Multi-message thread = real conversation = stronger signal
      const threadCount = m.threadId ? sentByThread.get(m.threadId) || 1 : 1;
      const bonus = threadCount >= 3 ? 6 : threadCount >= 2 ? 4 : 2;

      for (const r of recipients) {
        addSignal(r.email, r.name, bonus, "bootstrap_sent_to");
      }
    }
  } catch (e) {
    console.error("[bootstrap] sent fetch failed", e instanceof Error ? e.message : e);
  }

  // ---- STARRED senders ----
  try {
    const starred = await fetchMessageBatch(gmail, "is:starred", MAX_STARRED);
    result.starred_examined = starred.length;
    for (const m of starred) {
      const headers: Array<{ name?: string | null; value?: string | null }> =
        m.payload?.headers || [];
      const fromRaw =
        headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
      const parsed = parseAddressList(fromRaw)[0];
      if (parsed) addSignal(parsed.email, parsed.name, 10, "bootstrap_starred");
    }
  } catch (e) {
    console.error("[bootstrap] starred fetch failed", e instanceof Error ? e.message : e);
  }

  // ---- IMPORTANT-labeled senders ----
  try {
    const important = await fetchMessageBatch(gmail, "is:important", MAX_IMPORTANT);
    result.important_examined = important.length;
    for (const m of important) {
      const headers: Array<{ name?: string | null; value?: string | null }> =
        m.payload?.headers || [];
      const fromRaw =
        headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
      const parsed = parseAddressList(fromRaw)[0];
      if (parsed) addSignal(parsed.email, parsed.name, 5, "bootstrap_important");
    }
  } catch (e) {
    console.error("[bootstrap] important fetch failed", e instanceof Error ? e.message : e);
  }

  // ---- Write sender_reputation rows ----
  const sortedSenders = Array.from(signals.entries())
    .sort((a, b) => b[1].reputation - a[1].reputation);

  if (sortedSenders.length > 0) {
    const rows = sortedSenders.map(([email, sig]) => ({
      user_id: userId,
      sender_email: email,
      reputation: Math.min(100, Math.max(-100, sig.reputation)),
      source: sig.source,
      signal_count: sig.count,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await service
      .from("sender_reputation")
      .upsert(rows, { onConflict: "user_id,sender_email" });
    if (!error) result.senders_seeded = rows.length;
    else console.error("[bootstrap] reputation upsert", error.message);
  }

  // ---- Create memory_entries for top 5 high-rep people ----
  const top5 = sortedSenders.slice(0, 5).filter(([, sig]) => sig.reputation >= 6);
  for (const [email, sig] of top5) {
    const name = nameByEmail.get(email) || email.split("@")[0];
    try {
      await service.from("memory_entries").insert({
        user_id: userId,
        kind: "person",
        subject: name,
        content: `${name} (${email}) — frequent contact. ${sig.count} interaction${sig.count === 1 ? "" : "s"} based on initial sent/starred/important signals.`,
      });
      result.memory_entries_created++;
    } catch {
      // Non-fatal — duplicate, RLS, etc.
    }
  }

  // ---- Boost any already-synced emails from high-rep senders ----
  if (sortedSenders.length > 0) {
    const highRepEmails = sortedSenders.filter(([, s]) => s.reputation >= 4).map(([e]) => e);
    if (highRepEmails.length > 0) {
      const { data: matched } = await service
        .from("emails")
        .select("id, from_email, score")
        .eq("user_id", userId)
        .in("from_email", highRepEmails)
        .limit(200);

      if (matched) {
        for (const e of matched) {
          const sig = signals.get(e.from_email);
          if (!sig) continue;
          const bumpAmount = Math.min(25, sig.reputation);
          const newScore = Math.min(100, (e.score || 50) + bumpAmount);
          const category =
            newScore >= 75 ? "critical" : newScore >= 40 ? "useful" : newScore >= 20 ? "low_priority" : "noise";
          await service
            .from("emails")
            .update({ score: newScore, category })
            .eq("id", e.id);
          result.emails_boosted++;
        }
      }
    }
  }

  // ---- Mark bootstrap complete ----
  await service
    .from("user_sync_state")
    .upsert(
      {
        user_id: userId,
        bootstrap_completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  return result;
}
