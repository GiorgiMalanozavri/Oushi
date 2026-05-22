import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/labels/status
 *
 * Diagnostic for the Settings → Gmail labels panel. Tells the user
 * whether real-time labeling is actually working — and surfaces the
 * three things that explain "why aren't new emails getting labels?":
 *
 *   1. gmail_labels_enabled — false means rank skips the label pass
 *   2. gmail_watch_expires_at — null or in the past means no Pub/Sub
 *      push (so only the hourly cron labels new mail)
 *   3. last_synced_at + unlabeled_count — concrete evidence: if the
 *      last sync was 4 hours ago and 12 emails are unlabeled, that's
 *      the gap you're seeing.
 *
 * Cheap — three small queries, all keyed by user_id.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  const [syncStateRes, unlabeledRes, totalLabeledRes] = await Promise.all([
    service
      .from("user_sync_state")
      .select(
        "gmail_labels_enabled, gmail_watch_expires_at, last_synced_at, gmail_labels_last_applied_at, last_history_id"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    // Unlabeled: emails we COULD label (have a gmail_message_id) but
    // haven't yet. This is what the user is actually complaining about
    // when they say "new emails don't have labels."
    service
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("gmail_label_applied_at", null)
      .not("gmail_message_id", "is", null),
    service
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("gmail_label_applied_at", "is", null),
  ]);

  const s = syncStateRes.data || null;
  const watchExpiresAt = s?.gmail_watch_expires_at || null;
  const watchActive =
    !!watchExpiresAt && new Date(watchExpiresAt).getTime() > Date.now();

  return NextResponse.json({
    enabled: !!s?.gmail_labels_enabled,
    watch_active: watchActive,
    watch_expires_at: watchExpiresAt,
    last_synced_at: s?.last_synced_at || null,
    last_applied_at: s?.gmail_labels_last_applied_at || null,
    unlabeled_count: unlabeledRes.count || 0,
    labeled_count: totalLabeledRes.count || 0,
  });
}
