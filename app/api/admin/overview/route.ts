import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/overview
 *
 * One-call aggregate for the admin dashboard. Returns:
 *   - System-wide counts (users, emails synced, labels applied, corrections)
 *   - Accuracy estimate (1 - corrections / labels_applied)
 *   - LLM stats (heuristic-only vs LLM-classified counts)
 *   - Confusion matrix (top 20 most common computed→override pairs)
 *   - Problem senders (top 20 senders generating corrections)
 *   - Recent corrections feed (last 50)
 *   - Per-user breakdown (every user's emails / labels / corrections / replies)
 *
 * Gated by OUSHI_ADMIN_EMAILS env var.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email || null)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = await createServiceClient();
  const day = 24 * 60 * 60 * 1000;
  const since14d = new Date(Date.now() - 14 * day).toISOString();
  const since24h = new Date(Date.now() - 1 * day).toISOString();

  // ── Total emails synced (all-time and last 24h) ─────────────────────
  const { count: totalEmails } = await service
    .from("emails")
    .select("id", { count: "exact", head: true });
  const { count: emails24h } = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .gte("received_at", since24h);

  // ── Labels applied (count of distinct emails ever labeled) ──────────
  const { count: labelsApplied } = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .not("gmail_label_applied_at", "is", null);
  const { count: labelsApplied24h } = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .gte("gmail_label_applied_at", since24h);

  // ── LLM classification stats ─────────────────────────────────────────
  const { count: llmClassified } = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .not("gmail_label_llm_key", "is", null);
  const { count: llmClassified14d } = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .gte("gmail_label_llm_at", since14d);

  // ── Corrections (label_classification_errors) ───────────────────────
  const { count: totalCorrections } = await service
    .from("label_classification_errors")
    .select("id", { count: "exact", head: true });
  const { count: corrections14d } = await service
    .from("label_classification_errors")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since14d);
  const { count: corrections24h } = await service
    .from("label_classification_errors")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since24h);

  // Total user count via auth admin
  let totalUsers = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (await (service.auth as any).admin.listUsers({
      page: 1,
      perPage: 1000,
    })) as { data: { users: Array<{ id: string }> } };
    totalUsers = data?.users?.length || 0;
  } catch {
    // Fallback — count distinct user_ids in emails table
    const { count } = await service
      .from("emails")
      .select("user_id", { count: "exact", head: true });
    totalUsers = count || 0;
  }

  // Accuracy estimate — corrections / labels_applied in last 14d (a fair
  // window where both sides are sampling the same period)
  const labelsApplied14dQuery = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .gte("gmail_label_applied_at", since14d);
  const labelsApplied14d = labelsApplied14dQuery.count || 0;
  const errorRate14d =
    labelsApplied14d > 0
      ? Math.round(((corrections14d || 0) / labelsApplied14d) * 1000) / 10
      : 0;

  // ── Confusion matrix (computed → override) ──────────────────────────
  const { data: confusionRows } = await service
    .from("label_classification_errors")
    .select("computed_label, user_override, was_llm")
    .gte("created_at", since14d);

  const pairs = new Map<
    string,
    { from: string; to: string; count: number; llm: number; heur: number }
  >();
  for (const r of (confusionRows || []) as Array<{
    computed_label: string | null;
    user_override: string;
    was_llm: boolean;
  }>) {
    const from = r.computed_label || "no_label";
    const to = r.user_override || "none";
    const key = `${from}→${to}`;
    const prev = pairs.get(key) || { from, to, count: 0, llm: 0, heur: 0 };
    prev.count++;
    if (r.was_llm) prev.llm++;
    else prev.heur++;
    pairs.set(key, prev);
  }
  const confusion = Array.from(pairs.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // ── Problem senders ─────────────────────────────────────────────────
  const { data: senderRows } = await service
    .from("label_classification_errors")
    .select("sender_email, computed_label, user_override, subject")
    .not("sender_email", "is", null)
    .gte("created_at", since14d);

  const senderMap = new Map<
    string,
    {
      sender: string;
      count: number;
      top_correction: string;
      sample_subject: string | null;
      _pairs: Map<string, number>;
    }
  >();
  for (const r of (senderRows || []) as Array<{
    sender_email: string;
    computed_label: string | null;
    user_override: string;
    subject: string | null;
  }>) {
    const sender = r.sender_email;
    const pair = `${r.computed_label || "no_label"} → ${r.user_override}`;
    const prev = senderMap.get(sender) || {
      sender,
      count: 0,
      top_correction: pair,
      sample_subject: r.subject,
      _pairs: new Map<string, number>(),
    };
    prev.count++;
    prev._pairs.set(pair, (prev._pairs.get(pair) || 0) + 1);
    if (!prev.sample_subject && r.subject) prev.sample_subject = r.subject;
    senderMap.set(sender, prev);
  }
  // Resolve top_correction = most-frequent pair for that sender
  const problemSenders = Array.from(senderMap.values())
    .map((s) => {
      let top = s.top_correction;
      let max = 0;
      for (const [pair, n] of s._pairs) {
        if (n > max) {
          max = n;
          top = pair;
        }
      }
      return {
        sender: s.sender,
        count: s.count,
        top_correction: top,
        sample_subject: s.sample_subject,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // ── Recent corrections feed ─────────────────────────────────────────
  const { data: recentRaw } = await service
    .from("label_classification_errors")
    .select(
      "id, user_id, computed_label, user_override, was_llm, llm_content_label, sender_email, subject, correction_reason, score_at_time, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const recent = recentRaw || [];

  // ── Per-user breakdown ──────────────────────────────────────────────
  // Aggregate counts grouped by user_id. Three queries (emails by user,
  // labels by user, corrections by user) merged in JS.
  const userMap = new Map<
    string,
    {
      user_id: string;
      emails: number;
      labels_applied: number;
      corrections: number;
      feedback: number;
      last_synced_at: string | null;
      gmail_labels_enabled: boolean;
    }
  >();

  const ensureUser = (uid: string) => {
    if (!userMap.has(uid)) {
      userMap.set(uid, {
        user_id: uid,
        emails: 0,
        labels_applied: 0,
        corrections: 0,
        feedback: 0,
        last_synced_at: null,
        gmail_labels_enabled: false,
      });
    }
    return userMap.get(uid)!;
  };

  const { data: emailUsers } = await service
    .from("emails")
    .select("user_id, gmail_label_applied_at");
  for (const r of (emailUsers || []) as Array<{
    user_id: string;
    gmail_label_applied_at: string | null;
  }>) {
    const u = ensureUser(r.user_id);
    u.emails++;
    if (r.gmail_label_applied_at) u.labels_applied++;
  }

  const { data: errorUsers } = await service
    .from("label_classification_errors")
    .select("user_id");
  for (const r of (errorUsers || []) as Array<{ user_id: string }>) {
    ensureUser(r.user_id).corrections++;
  }

  const { data: feedbackUsers } = await service
    .from("feedback")
    .select("user_id");
  for (const r of (feedbackUsers || []) as Array<{ user_id: string }>) {
    ensureUser(r.user_id).feedback++;
  }

  const { data: syncUsers } = await service
    .from("user_sync_state")
    .select("user_id, last_synced_at, gmail_labels_enabled");
  for (const r of (syncUsers || []) as Array<{
    user_id: string;
    last_synced_at: string | null;
    gmail_labels_enabled: boolean;
  }>) {
    const u = ensureUser(r.user_id);
    u.last_synced_at = r.last_synced_at;
    u.gmail_labels_enabled = r.gmail_labels_enabled;
  }

  const users = Array.from(userMap.values()).sort(
    (a, b) => b.emails - a.emails
  );

  // ── Feedback (thumbs up/down) signal ────────────────────────────────
  const { data: feedbackRaw } = await service
    .from("feedback")
    .select("signal")
    .gte("created_at", since14d);
  let upvotes = 0;
  let downvotes = 0;
  for (const r of (feedbackRaw || []) as Array<{ signal: string }>) {
    if (r.signal === "upvote") upvotes++;
    else if (r.signal === "downvote") downvotes++;
  }

  // ── LLM cost estimate ───────────────────────────────────────────────
  // Per-email LLM call ~= 500 input + 5 output tokens = ~$0.0005 with
  // Haiku 4.5 pricing. Plus heuristic-classified emails cost $0.
  const llmCostEstimate14d =
    Math.round((llmClassified14d || 0) * 0.0005 * 100) / 100;

  // ── In-app feedback reports ─────────────────────────────────────────
  const { count: feedbackTotal } = await service
    .from("feedback_reports")
    .select("id", { count: "exact", head: true });
  const { count: feedback24h } = await service
    .from("feedback_reports")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since24h);
  const { data: recentFeedback } = await service
    .from("feedback_reports")
    .select("id, user_id, message, page_url, emailed, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  return NextResponse.json({
    overview: {
      total_users: totalUsers,
      total_emails: totalEmails || 0,
      emails_24h: emails24h || 0,
      labels_applied_total: labelsApplied || 0,
      labels_applied_24h: labelsApplied24h || 0,
      labels_applied_14d: labelsApplied14d,
      llm_classified_total: llmClassified || 0,
      llm_classified_14d: llmClassified14d || 0,
      corrections_total: totalCorrections || 0,
      corrections_14d: corrections14d || 0,
      corrections_24h: corrections24h || 0,
      error_rate_14d_pct: errorRate14d,
      llm_cost_estimate_14d_usd: llmCostEstimate14d,
      upvotes_14d: upvotes,
      downvotes_14d: downvotes,
      feedback_total: feedbackTotal || 0,
      feedback_24h: feedback24h || 0,
    },
    confusion,
    problem_senders: problemSenders,
    recent,
    users,
    recent_feedback: recentFeedback || [],
    generated_at: new Date().toISOString(),
  });
}
