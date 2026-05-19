import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { bootstrapPersonalization } from "@/lib/bootstrap";

export const maxDuration = 120;

/**
 * POST /api/personalize/bootstrap
 *
 * Runs the behavioral bootstrap pass for the current user. Idempotent —
 * if it's already been run we still re-run (cheap, no Claude calls).
 *
 * Called once during first-sync; can be re-fired manually from settings later.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const result = await bootstrapPersonalization(service, user.id, user.email || null);
  return NextResponse.json(result);
}
