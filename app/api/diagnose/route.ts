import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  classifyAll,
  bucketize,
  isAutomatedEmail,
  isTrueTransactional,
  type EmailRow,
} from "@/lib/outstanding";

export const dynamic = "force-dynamic";

/**
 * GET /api/diagnose
 *
 * Per-user inbox + ranking state summary. No PII — just counts. Used by
 * the dashboard to detect "all buckets empty because ranking never ran"
 * vs "all buckets empty because the inbox really is calm."
 *
 * Returns:
 *   {
 *     total_14d,                  -- emails in last 14 days
 *     unranked_14d,               -- those with score IS NULL
 *     scored_14d,                 -- those with a score set
 *     score_bands_14d: {
 *       0_29, 30_49, 50_69, 70_89, 90_100, null
 *     },
 *     bucket_counts_14d: { urgent, awaiting_reply, following_up, ... },
 *     automated_14d,              -- isAutomatedEmail() === true
 *     transactional_14d,          -- isTrueTransactional() === true
 *     user_replied_14d,
 *     dismissed_14d,
 *     last_synced_at,
 *     bootstrap_completed_at,
 *     gmail_labels_enabled
 *   }
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: emails } = await service
    .from("emails")
    .select("*")
    .eq("user_id", user.id)
    .gte("received_at", since)
    .order("received_at", { ascending: false });

  const rows = (emails || []) as EmailRow[];
  const total = rows.length;

  const bands = {
    "0_29": 0,
    "30_49": 0,
    "50_69": 0,
    "70_89": 0,
    "90_100": 0,
    null: 0,
  };
  let unranked = 0;
  let scored = 0;
  let automated = 0;
  let transactional = 0;
  let userReplied = 0;
  let dismissed = 0;
  for (const e of rows) {
    if (e.score === null || e.score === undefined) {
      bands.null++;
      unranked++;
    } else {
      scored++;
      if (e.score >= 90) bands["90_100"]++;
      else if (e.score >= 70) bands["70_89"]++;
      else if (e.score >= 50) bands["50_69"]++;
      else if (e.score >= 30) bands["30_49"]++;
      else bands["0_29"]++;
    }
    if (isAutomatedEmail(e)) automated++;
    if (isTrueTransactional(e)) transactional++;
    if (e.user_replied) userReplied++;
    if (e.dismissed_at) dismissed++;
  }

  // Bucket distribution — only meaningful for scored emails
  const classified = classifyAll(rows.filter((e) => e.score !== null));
  const buckets = bucketize(classified);
  const bucketCounts = {
    urgent: buckets.urgent.length,
    awaiting_reply: buckets.awaiting_reply.length,
    following_up: buckets.following_up.length,
    reference: buckets.reference.length,
    fresh: buckets.fresh.length,
    background: buckets.background.length,
    handled: buckets.handled.length,
  };

  const { data: syncState } = await service
    .from("user_sync_state")
    .select(
      "last_synced_at, bootstrap_completed_at, gmail_labels_enabled, last_history_id"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // Diagnostic hint — most common failure modes
  let diagnosis: string;
  if (total === 0) {
    diagnosis =
      "no_emails_synced: Gmail sync hasn't pulled anything yet. Try the Sync button in the sidebar.";
  } else if (unranked === total) {
    diagnosis =
      "all_unranked: emails are synced but none have a score yet. Ranking never ran successfully. Hit POST /api/rank or use the dashboard re-rank action.";
  } else if (unranked > 0 && scored < unranked) {
    diagnosis =
      "mostly_unranked: most emails still have no score — ranking partially failed. Re-rank.";
  } else if (dismissed >= total && total > 0) {
    // All emails are dismissed — usually because the user archives in
    // Gmail (which our sync interprets as dismiss). The high-priority
    // ones are hidden behind dismissed_at.
    diagnosis =
      "all_dismissed: every email in the last 14 days has dismissed_at set — most likely because you archive emails in Gmail and our sync mirrors that as 'dismissed'. The high-priority scored ones are hidden behind the dismiss flag. Use POST /api/email/undismiss-recent to clear the flag and resurface them.";
  } else if (dismissed > total * 0.8) {
    // 80%+ dismissed — same root cause but partial. Same fix.
    diagnosis =
      "mostly_dismissed: most of your emails are flagged as dismissed (Gmail archive) and so won't show in any bucket. Run POST /api/email/undismiss-recent if you want them back.";
  } else if (
    bucketCounts.urgent === 0 &&
    bucketCounts.awaiting_reply === 0 &&
    bucketCounts.following_up === 0 &&
    bucketCounts.fresh === 0 &&
    (bands["50_69"] + bands["70_89"] + bands["90_100"]) === 0
  ) {
    diagnosis =
      "low_scores: ranking ran but nothing scored >= 50. Either the inbox is genuinely all noise, or your profile is too restrictive. Try adding interests in Settings → Profile.";
  } else {
    diagnosis = "ok";
  }

  return NextResponse.json({
    total_14d: total,
    unranked_14d: unranked,
    scored_14d: scored,
    score_bands_14d: bands,
    bucket_counts_14d: bucketCounts,
    automated_14d: automated,
    transactional_14d: transactional,
    user_replied_14d: userReplied,
    dismissed_14d: dismissed,
    last_synced_at: syncState?.last_synced_at || null,
    bootstrap_completed_at: syncState?.bootstrap_completed_at || null,
    gmail_labels_enabled: syncState?.gmail_labels_enabled || false,
    last_history_id: syncState?.last_history_id || null,
    diagnosis,
  });
}
