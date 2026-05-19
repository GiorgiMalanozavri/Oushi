import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedClient } from "@/lib/gmail";
import {
  extractCommitment,
  fetchRecentSent,
  autoFulfillByFollowup,
  type ExtractedCommitment,
} from "@/lib/commitments";

export const maxDuration = 300;

/**
 * Scans the user's recent SENT emails for commitments.
 *
 * - First call: scans last 30 days
 * - Subsequent calls: only emails sent since last scan
 *
 * Idempotent — the unique constraint on (user_id, gmail_message_id, summary)
 * means re-runs over the same emails won't create duplicates.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  // Figure out the cutoff: either last_scanned_message_date or 30 days ago
  const { data: scanState } = await service
    .from("commitment_scan_state")
    .select("last_scanned_message_date")
    .eq("user_id", user.id)
    .single();

  const sinceDate = scanState?.last_scanned_message_date
    ? new Date(scanState.last_scanned_message_date)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let oauth2Client;
  try {
    oauth2Client = await getAuthenticatedClient(user.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gmail auth failed" },
      { status: 500 }
    );
  }

  const sent = await fetchRecentSent(oauth2Client, {
    sinceDate,
    max: 80,
  });

  if (sent.length === 0) {
    return NextResponse.json({ scanned: 0, extracted: 0, skipped: 0 });
  }

  // Run Claude extraction in parallel (small batches)
  let extracted = 0;
  let skipped = 0;
  const batchSize = 5;
  for (let i = 0; i < sent.length; i += batchSize) {
    const batch = sent.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (s) => {
        const c = await extractCommitment(s);
        return { sent: s, commitment: c };
      })
    );
    for (const r of results) {
      if (r.status !== "fulfilled") {
        skipped++;
        continue;
      }
      const { sent: s, commitment } = r.value;
      if (!commitment) {
        skipped++;
        continue;
      }
      await upsertCommitment(service, user.id, s, commitment);
      extracted++;
    }
  }

  // Update scan state to the newest sent date we saw
  const newestSent = sent
    .map((s) => new Date(s.sent_at).getTime())
    .reduce((a, b) => Math.max(a, b), 0);
  if (newestSent > 0) {
    await service
      .from("commitment_scan_state")
      .upsert({
        user_id: user.id,
        last_scanned_message_date: new Date(newestSent).toISOString(),
        last_scanned_at: new Date().toISOString(),
      });
  }

  // Auto-fulfillment pass: any open commitments where the user has sent
  // ANOTHER email in the same thread after the commitment date are marked
  // "fulfilled" (best-effort — user can re-open if wrong). Free — uses the
  // sent emails we already fetched, no extra Gmail/Claude calls.
  //
  // Done AFTER extraction so commitments just created can also be auto-
  // fulfilled if a follow-up exists in the same scan window.
  const autoFulfilled = await autoFulfillByFollowup(service, user.id, sent);

  return NextResponse.json({ scanned: sent.length, extracted, skipped, autoFulfilled });
}

async function upsertCommitment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any,
  userId: string,
  sent: { gmail_message_id: string; gmail_thread_id: string; sent_at: string; to_email: string; to_name: string },
  c: ExtractedCommitment
) {
  await service
    .from("commitments")
    .upsert(
      {
        user_id: userId,
        gmail_message_id: sent.gmail_message_id,
        gmail_thread_id: sent.gmail_thread_id,
        sent_at: sent.sent_at,
        recipient_email: sent.to_email,
        recipient_name: sent.to_name,
        summary: c.summary,
        raw_quote: c.raw_quote,
        due_phrase: c.due_phrase,
        due_at: c.due_at_iso,
        urgency: c.urgency || "vague",
        status: "open",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,gmail_message_id,summary", ignoreDuplicates: false }
    );
}

