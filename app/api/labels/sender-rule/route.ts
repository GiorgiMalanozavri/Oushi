import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { applyLabelsBatch } from "@/lib/gmail-labels";
import {
  OUSHI_LABELS,
  type OushiLabelKey,
} from "@/lib/gmail-labels-shared";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const VALID_KEYS = new Set<string>(OUSHI_LABELS.map((l) => l.key));

/**
 * POST /api/labels/sender-rule
 *   Body: {
 *     senderPattern: string,             // "noreply@stripe.com" or "stripe.com"
 *     patternType: "email" | "domain",
 *     labelKey: OushiLabelKey | "none"   // "none" = don't label
 *   }
 *
 * Creates or updates the rule and IMMEDIATELY re-labels every email
 * from this sender in the last 30 days (both in the DB and in Gmail).
 *
 * DELETE /api/labels/sender-rule?senderPattern=...&patternType=...
 *   Drops the rule. Existing labels stay as they were — the next rank
 *   pass will reclassify them via heuristic/LLM.
 */

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = rateLimit(`sender-rule:${user.id}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many rule changes. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const senderPattern = String(body?.senderPattern || "").trim().toLowerCase();
  const patternType = String(body?.patternType || "");
  const labelKey = String(body?.labelKey || "").trim();

  if (!senderPattern) {
    return NextResponse.json(
      { error: "senderPattern is required" },
      { status: 400 }
    );
  }
  if (patternType !== "email" && patternType !== "domain") {
    return NextResponse.json(
      { error: "patternType must be 'email' or 'domain'" },
      { status: 400 }
    );
  }
  if (labelKey !== "none" && !VALID_KEYS.has(labelKey)) {
    return NextResponse.json(
      { error: "labelKey must be 'none' or a valid OushiLabelKey" },
      { status: 400 }
    );
  }

  const targetLabel: OushiLabelKey | null =
    labelKey === "none" ? null : (labelKey as OushiLabelKey);

  const service = await createServiceClient();

  // Upsert the rule
  const { error: upsertError } = await service
    .from("label_sender_rules")
    .upsert(
      {
        user_id: user.id,
        sender_pattern: senderPattern,
        pattern_type: patternType,
        label_key: targetLabel,
      },
      { onConflict: "user_id,sender_pattern,pattern_type" }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Retroactively re-label every matching email in the last 30 days so
  // the user sees the rule take effect immediately, not on next rank.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let query = service
    .from("emails")
    .select("id, gmail_message_id, from_email")
    .eq("user_id", user.id)
    .gte("received_at", since)
    .not("gmail_message_id", "is", null);

  if (patternType === "email") {
    query = query.ilike("from_email", senderPattern);
  } else {
    // For domains, match emails ending in @{pattern} OR @anything.{pattern}
    query = query.or(
      `from_email.ilike.%@${senderPattern},from_email.ilike.%.${senderPattern}`
    );
  }
  const { data: matching } = await query;

  let applied = 0;
  if (matching && matching.length > 0) {
    const decisions = matching
      .filter((r) => r.gmail_message_id)
      .map((r) => ({
        emailId: r.id,
        gmailMessageId: r.gmail_message_id as string,
        labelKey: targetLabel,
      }));
    try {
      const result = await applyLabelsBatch(user.id, decisions);
      applied = result.applied + result.cleared;
    } catch (e) {
      console.error(
        "[sender-rule] applyLabelsBatch failed",
        e instanceof Error ? e.message : e
      );
    }
  }

  return NextResponse.json({
    ok: true,
    pattern: senderPattern,
    type: patternType,
    label: targetLabel,
    affected: matching?.length || 0,
    applied,
  });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const senderPattern = (searchParams.get("senderPattern") || "")
    .trim()
    .toLowerCase();
  const patternType = searchParams.get("patternType") || "";

  if (!senderPattern || (patternType !== "email" && patternType !== "domain")) {
    return NextResponse.json(
      { error: "senderPattern + patternType (email|domain) are required" },
      { status: 400 }
    );
  }

  const service = await createServiceClient();
  const { error } = await service
    .from("label_sender_rules")
    .delete()
    .eq("user_id", user.id)
    .eq("sender_pattern", senderPattern)
    .eq("pattern_type", patternType);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data, error } = await service
    .from("label_sender_rules")
    .select("sender_pattern, pattern_type, label_key, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rules: data || [] });
}
