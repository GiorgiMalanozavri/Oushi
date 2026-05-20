import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { applyLabelsBatch } from "@/lib/gmail-labels";
import {
  type OushiLabelKey,
  OUSHI_LABELS,
} from "@/lib/gmail-labels-shared";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const VALID_KEYS = new Set<string>(OUSHI_LABELS.map((l) => l.key));

/**
 * GET /api/labels/override?emailId=...
 *   Returns the user's manual override for a single email.
 *     { override: OushiLabelKey | null | undefined }
 *   undefined = no row stored (auto / heuristic decides)
 *   null      = "don't label this email" override
 *   <key>     = explicit label override
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const emailId = searchParams.get("emailId");
  if (!emailId) {
    return NextResponse.json({ error: "emailId is required" }, { status: 400 });
  }

  const service = await createServiceClient();
  const { data, error } = await service
    .from("email_label_overrides")
    .select("override_label_key")
    .eq("user_id", user.id)
    .eq("email_id", emailId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ override: undefined });
  }
  return NextResponse.json({ override: data.override_label_key });
}

/**
 * POST /api/labels/override
 *   Body: { emailId: string, labelKey: OushiLabelKey | "none" | "auto" }
 *
 *   "none" → store override of NULL (user said "don't label this")
 *   "auto" → delete the override row (go back to heuristic)
 *   <key>  → store the override and re-label in Gmail immediately
 *
 *   The new label is applied to Gmail right away so the user sees the
 *   change without waiting for the next rank.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cheap rate-limit to stop accidental loops from a buggy UI hammering
  // the endpoint. 60 overrides / minute is way more than a human needs.
  const limit = rateLimit(`labels-override:${user.id}`, 60, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many label changes. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const emailId = String(body?.emailId || "").trim();
  const labelKey = String(body?.labelKey || "").trim();

  if (!emailId) {
    return NextResponse.json({ error: "emailId is required" }, { status: 400 });
  }
  if (labelKey !== "none" && labelKey !== "auto" && !VALID_KEYS.has(labelKey)) {
    return NextResponse.json(
      { error: "labelKey must be one of: auto, none, " + [...VALID_KEYS].join(", ") },
      { status: 400 }
    );
  }

  const service = await createServiceClient();

  // Verify the email belongs to the user and pull what we need to label it.
  const { data: email, error: emailError } = await service
    .from("emails")
    .select("id, user_id, gmail_message_id, category, score, is_read, is_unread, user_replied, from_email, subject, snippet, body_preview, user_was_last_sender, user_last_sent_at, followup_dismissed_at, dismissed_at, received_at, last_seen_at, snooze_until, last_thread_message_at")
    .eq("id", emailId)
    .maybeSingle();

  if (emailError || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }
  if (email.user_id !== user.id) {
    return NextResponse.json({ error: "Not your email" }, { status: 403 });
  }

  // Determine the target label and write/clear the override row.
  let targetLabel: OushiLabelKey | null;
  if (labelKey === "auto") {
    // Drop the override; classifier takes over again. We DON'T re-apply
    // here because the next rank pass will catch it via the stale-scan.
    await service
      .from("email_label_overrides")
      .delete()
      .eq("user_id", user.id)
      .eq("email_id", emailId);
    return NextResponse.json({ ok: true, mode: "auto" });
  } else if (labelKey === "none") {
    targetLabel = null;
    await service
      .from("email_label_overrides")
      .upsert(
        { user_id: user.id, email_id: emailId, override_label_key: null, set_at: new Date().toISOString() },
        { onConflict: "user_id,email_id" }
      );
  } else {
    targetLabel = labelKey as OushiLabelKey;
    await service
      .from("email_label_overrides")
      .upsert(
        { user_id: user.id, email_id: emailId, override_label_key: targetLabel, set_at: new Date().toISOString() },
        { onConflict: "user_id,email_id" }
      );
  }

  // Apply to Gmail immediately so the user sees the change.
  if (!email.gmail_message_id) {
    return NextResponse.json({ ok: true, mode: targetLabel ?? "none", gmail_applied: false });
  }

  try {
    await applyLabelsBatch(user.id, [
      {
        emailId: email.id,
        gmailMessageId: email.gmail_message_id,
        labelKey: targetLabel,
      },
    ]);
  } catch (e) {
    console.error("[labels/override] applyLabelsBatch failed", e instanceof Error ? e.message : e);
    // The override is saved either way — next rank pass will reconcile.
    return NextResponse.json({ ok: true, mode: targetLabel ?? "none", gmail_applied: false });
  }

  return NextResponse.json({ ok: true, mode: targetLabel ?? "none", gmail_applied: true });
}
