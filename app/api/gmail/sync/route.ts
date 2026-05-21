import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncIncremental } from "@/lib/gmail";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/gmail/sync
 *
 * Incremental sync via Gmail's history.list API — pulls only deltas
 * since the user's last_history_id. Cheap enough to call on every
 * dashboard load. Returns the count of new messages added so callers
 * (the dashboard auto-sync useEffect) know whether to re-rank.
 *
 * Response shape: { added, read, archived, starred, unstarred, fellback }
 *   - added: count of brand-new messages
 *   - fellback: true on first-ever sync (no last_history_id) where we
 *     fell back to syncRecentEmails for a 30-message bootstrap
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncIncremental(user.id);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
