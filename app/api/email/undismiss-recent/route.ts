import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * POST /api/email/undismiss-recent
 *   Body: { days?: number; minScore?: number }
 *
 * Clears `dismissed_at` for the user's emails in the last `days` (default
 * 14, max 60) that scored at least `minScore` (default 30). Returns the
 * affected count.
 *
 * Use case: the sync auto-dismisses anything you archive in Gmail. If
 * you're an inbox-zero user, that hides everything from Oushi's buckets
 * even though Oushi is supposed to keep reminding you. Hit this endpoint
 * (or the new "Resurface dismissed" dashboard action) to undo the
 * auto-dismiss in bulk.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3 bulk undismisses per 10 min — high enough for retries, low enough
  // to discourage hammering.
  const limit = rateLimit(`undismiss-recent:${user.id}`, 3, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate-limited. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const days = Math.max(1, Math.min(60, Number(body?.days) || 14));
  const minScore = Math.max(0, Math.min(100, Number(body?.minScore) ?? 30));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const service = await createServiceClient();
  const { data: updated, error } = await service
    .from("emails")
    .update({ dismissed_at: null })
    .eq("user_id", user.id)
    .gte("received_at", since)
    .gte("score", minScore)
    .not("dismissed_at", "is", null)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cleared: updated?.length || 0,
    days,
    min_score: minScore,
  });
}
