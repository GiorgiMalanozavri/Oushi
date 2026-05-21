import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { applyLabelsBatch } from "@/lib/gmail-labels";
import {
  type OushiLabelKey,
  OUSHI_LABELS,
  computeLabelForEmail,
} from "@/lib/gmail-labels-shared";
import type { EmailRow } from "@/lib/outstanding";
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
  // Optional structured "why" — one of: "wrong_category" | "wrong_urgency" |
  // "spam_aggregator" | "missed_opportunity" | "other". Free-form string
  // accepted so the UI can evolve without backend changes.
  const correctionReason =
    typeof body?.reason === "string" ? body.reason.slice(0, 60) : null;

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
  // gmail_label_llm_key is included so the accuracy log can tell us whether
  // the LLM saw this email or only the heuristic ran.
  const { data: email, error: emailError } = await service
    .from("emails")
    .select("id, user_id, gmail_message_id, category, score, is_read, is_unread, user_replied, from_email, subject, snippet, body_preview, user_was_last_sender, user_last_sent_at, followup_dismissed_at, dismissed_at, received_at, last_seen_at, snooze_until, last_thread_message_at, gmail_label_llm_key")
    .eq("id", emailId)
    .maybeSingle();

  if (emailError || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }
  if (email.user_id !== user.id) {
    return NextResponse.json({ error: "Not your email" }, { status: 403 });
  }

  // Compute what our pipeline currently picks (with no override) so the
  // accuracy log knows what we got wrong. Cast to EmailRow — the select
  // above pulls the columns computeLabelForEmail reads.
  const computedLabel = computeLabelForEmail(email as unknown as EmailRow);
  const wasLlm = !!email.gmail_label_llm_key;
  const llmContentLabel = email.gmail_label_llm_key ?? null;

  // Determine the target label and write/clear the override row.
  let targetLabel: OushiLabelKey | null;
  if (labelKey === "auto") {
    // Drop the override; classifier takes over again. We DON'T re-apply
    // here because the next rank pass will catch it via the stale-scan.
    // We also DON'T log this — "auto" is reverting a previous correction,
    // not making one.
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

  // Log the correction to the accuracy table — but only if the user's
  // pick actually differs from what we computed. If they picked the same
  // label we had (e.g., to "lock it in" against future state changes),
  // that's not an error, it's a confirmation, and shouldn't pollute the
  // signal. Best-effort — never fail the override on a log write.
  const userOverrideForLog = labelKey === "none" ? "none" : labelKey;
  const isCorrection =
    (labelKey === "none" && computedLabel !== null) ||
    (labelKey !== "none" && computedLabel !== labelKey);
  if (isCorrection) {
    try {
      await service.from("label_classification_errors").insert({
        user_id: user.id,
        email_id: email.id,
        computed_label: computedLabel,
        user_override: userOverrideForLog,
        was_llm: wasLlm,
        llm_content_label: llmContentLabel,
        sender_email: (email.from_email || "").toLowerCase() || null,
        subject: (email.subject || "").slice(0, 200) || null,
        correction_reason: correctionReason,
        score_at_time: typeof email.score === "number" ? email.score : null,
      });
    } catch (e) {
      console.error(
        "[labels/override] accuracy log insert failed",
        e instanceof Error ? e.message : e
      );
    }
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
