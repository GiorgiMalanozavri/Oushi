import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/connection/status
 *
 * Returns the health of the user's Gmail connection. Used by the
 * dashboard banner to decide whether to show a "Reconnect Gmail"
 * prompt. Returns `gmail_ok: false` if either:
 *   - the user has no `user_tokens` row at all (somehow lost their
 *     connection — extremely rare, but worth surfacing), or
 *   - the row has `invalidated_at` set (a sync attempt previously
 *     hit a 401 or invalid_grant).
 *
 * Cheap — single indexed lookup on user_id.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("user_tokens")
    .select("user_id, invalidated_at, invalidation_reason, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    gmail_ok: !!data && !data.invalidated_at,
    invalidated_at: data?.invalidated_at || null,
    invalidation_reason: data?.invalidation_reason || null,
    has_token: !!data,
    last_token_update_at: data?.updated_at || null,
  });
}
