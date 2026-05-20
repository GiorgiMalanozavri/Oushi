import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { bootstrapPersonalization } from "@/lib/bootstrap";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

/**
 * POST /api/personalize/bootstrap
 *
 * Runs the behavioral bootstrap pass for the current user. Idempotent —
 * if it's already been run we still re-run (cheap, no Claude calls).
 *
 * Called once during first-sync; can be re-fired manually from settings later.
 *
 * Rate-limited because the bootstrap does Gmail metadata fetches across
 * up to 400 messages — abusing it can hit Gmail quotas + burn API time.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3 runs per 10 minutes per user. Enough for retries; blocks abuse.
  const limit = rateLimit(`bootstrap:${user.id}`, 3, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Bootstrap is rate-limited. Try again in ${limit.retryAfterSeconds}s.`,
      },
      { status: 429 }
    );
  }

  const service = await createServiceClient();
  const result = await bootstrapPersonalization(service, user.id, user.email || null);
  return NextResponse.json(result);
}
