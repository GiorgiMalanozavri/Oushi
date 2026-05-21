import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isBroadcastNoise, type EmailRow } from "@/lib/outstanding";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * POST /api/email/rerank-broadcasts
 *
 * One-shot retroactive fix: walks the user's emails in the last 30 days,
 * identifies anything that matches the broadcast-noise pattern (Lensa /
 * Indeed / aggregator alerts / digest platforms), and rewrites their
 * score + category so they fall out of the urgent/awaiting buckets.
 *
 * This is the cheap version — pure heuristic, no LLM re-call. The
 * /api/rank pipeline does the same thing on new emails going forward
 * via the updated system prompt.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = rateLimit(`rerank-broadcasts:${user.id}`, 3, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate-limited. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const service = await createServiceClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await service
    .from("emails")
    .select("*")
    .eq("user_id", user.id)
    .gte("received_at", since);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const broadcastIds: string[] = [];
  for (const e of (rows || []) as (EmailRow & { id: string })[]) {
    if (isBroadcastNoise(e)) broadcastIds.push(e.id);
  }

  if (broadcastIds.length === 0) {
    return NextResponse.json({ ok: true, rewrote: 0 });
  }

  // Chunk the update so the IN clause stays sane
  let rewrote = 0;
  const CHUNK = 500;
  for (let i = 0; i < broadcastIds.length; i += CHUNK) {
    const chunk = broadcastIds.slice(i, i + CHUNK);
    const { data: updated, error: updateError } = await service
      .from("emails")
      .update({
        score: 10,
        category: "noise",
        highlight: null,
        suggested_action: null,
      })
      .in("id", chunk)
      .select("id");
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    rewrote += updated?.length || 0;
  }

  return NextResponse.json({ ok: true, rewrote });
}
