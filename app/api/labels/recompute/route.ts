import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * POST /api/labels/recompute
 *
 * Wipes cached LLM label verdicts (gmail_label_llm_key + at) for the
 * user's recent emails so the next /api/labels/apply re-classifies
 * them under the current heuristic + LLM prompt. Also clears the
 * gmail_label_applied_at stamp so the apply route covers every row
 * (not just "fresh" ones).
 *
 * Use this after a heuristic or prompt change to retroactively fix
 * existing data — without paying to re-rank, just re-label.
 *
 * Body: { days?: number = 30 }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = rateLimit(`labels-recompute:${user.id}`, 3, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate-limited. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const days = Math.max(1, Math.min(60, Number(body?.days) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const service = await createServiceClient();
  const { data, error } = await service
    .from("emails")
    .update({
      gmail_label_llm_key: null,
      gmail_label_llm_at: null,
      gmail_label_applied_at: null,
    })
    .eq("user_id", user.id)
    .gte("received_at", since)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cleared: data?.length || 0,
    days,
    next_step:
      "Now POST /api/labels/apply (or click Apply labels in Settings) to re-classify with the new rules.",
  });
}
