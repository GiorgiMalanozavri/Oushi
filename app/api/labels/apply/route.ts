import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  ensureOushiLabels,
  applyLabelsBatch,
  computeLabelForEmail,
  type OushiLabelKey,
} from "@/lib/gmail-labels";
import type { EmailRow } from "@/lib/outstanding";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST /api/labels/apply
 *   Idempotent backfill. Walks the user's last 14 days of synced emails,
 *   computes the right Oushi label for each, and applies via batchModify.
 *
 * Optional body: { days?: number } — default 14
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3 applies per 10 min — backfill is expensive against Gmail quota
  const limit = rateLimit(`labels-apply:${user.id}`, 3, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Labeling is rate-limited. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const days = Math.max(1, Math.min(60, Number(body?.days) || 14));

  const service = await createServiceClient();

  // 1. Ensure labels exist in Gmail
  let labelMap;
  try {
    labelMap = await ensureOushiLabels(user.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create Gmail labels" },
      { status: 500 }
    );
  }
  if (labelMap.size === 0) {
    return NextResponse.json(
      { error: "Couldn't create labels in Gmail. Try reconnecting Gmail in Settings." },
      { status: 500 }
    );
  }

  // 2. Fetch the last N days of emails
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: emails, error } = await service
    .from("emails")
    .select("*")
    .eq("user_id", user.id)
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!emails || emails.length === 0) {
    return NextResponse.json({ scanned: 0, applied: 0, cleared: 0, breakdown: {} });
  }

  // 3. Classify each email
  const decisions: Array<{
    emailId: string;
    gmailMessageId: string;
    labelKey: OushiLabelKey | null;
  }> = [];
  const counts: Record<string, number> = {};

  for (const e of emails as EmailRow[] & { id: string; gmail_message_id: string }[]) {
    const row = e as EmailRow & { id: string; gmail_message_id: string };
    if (!row.gmail_message_id) continue;
    const labelKey = computeLabelForEmail(row);
    decisions.push({
      emailId: row.id,
      gmailMessageId: row.gmail_message_id,
      labelKey,
    });
    const k = labelKey || "no_label";
    counts[k] = (counts[k] || 0) + 1;
  }

  // 4. Batch apply
  const result = await applyLabelsBatch(user.id, decisions);

  // 5. Mark the user as opted-in so future syncs auto-label
  await service
    .from("user_sync_state")
    .upsert(
      {
        user_id: user.id,
        gmail_labels_enabled: true,
        gmail_labels_last_applied_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  return NextResponse.json({
    scanned: emails.length,
    applied: result.applied,
    cleared: result.cleared,
    days,
    breakdown: counts,
  });
}
