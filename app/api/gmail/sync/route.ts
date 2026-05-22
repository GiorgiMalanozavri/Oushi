import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncIncremental } from "@/lib/gmail";
import { rankUnrankedEmails } from "@/lib/ranking";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST /api/gmail/sync
 *
 * Incremental sync via Gmail's history.list API — pulls only deltas
 * since the user's last_history_id, then ranks any new emails (which
 * also applies Gmail labels if the user has them enabled). Cheap enough
 * to call on every dashboard load.
 *
 * Why rank inline instead of trusting the cron: the cron runs hourly,
 * which means without this you can sit on unlabeled emails for up to
 * an hour after opening the app. Doing it inline trades a few extra
 * seconds on dashboard load for "labels appear immediately when you
 * open Oushi." Errors during rank are swallowed — the sync result is
 * what the caller actually needs.
 *
 * Response shape: { added, read, archived, starred, unstarred, fellback, ranked }
 *   - added: count of brand-new messages
 *   - ranked: count of emails ranked + labeled in this call (best-effort)
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

    // Rank + label any new/unranked emails inline. This is what closes
    // the loop: without it the cron is the only thing labeling new
    // mail, and users see unlabeled emails sitting in Gmail for up to
    // an hour. Errors are non-fatal — we still want to report the sync
    // result even if the rank fails.
    let ranked = 0;
    try {
      ranked = await rankUnrankedEmails(user.id);
    } catch (rankErr) {
      console.error(
        "[gmail/sync] rank failed",
        rankErr instanceof Error ? rankErr.message : rankErr
      );
    }

    return NextResponse.json({ ...result, ranked });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
