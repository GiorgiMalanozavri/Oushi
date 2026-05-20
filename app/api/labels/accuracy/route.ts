import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * GET /api/labels/accuracy?days=30
 *   Returns a rough accuracy snapshot for the label pipeline based on
 *   the user's manual corrections logged in label_classification_errors.
 *
 *   {
 *     window_days,
 *     total_labeled,         // emails with gmail_label_applied_at in window
 *     corrections,           // count of error log rows in window
 *     error_rate_pct,        // 100 * corrections / total_labeled
 *     llm_errors,            // corrections where was_llm = true
 *     heuristic_errors,      // corrections where was_llm = false
 *     confusion: [{ from: "respond", to: "fyi", count: 7 }, ...],
 *     top_problem_senders: [{ sender, count }, ...]
 *   }
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const service = await createServiceClient();

  // Denominator: how many emails did we label in the window? We use the
  // emails.gmail_label_applied_at column as a proxy — it's stamped every
  // time we successfully apply a label batch to Gmail.
  const { count: labeledCount } = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("gmail_label_applied_at", since);

  const { data: errors } = await service
    .from("label_classification_errors")
    .select("computed_label, user_override, was_llm, sender_email")
    .eq("user_id", user.id)
    .gte("created_at", since);

  const corrections = errors?.length || 0;
  const totalLabeled = labeledCount || 0;
  const errorRatePct =
    totalLabeled > 0 ? Math.round((corrections / totalLabeled) * 1000) / 10 : 0;

  let llmErrors = 0;
  let heuristicErrors = 0;
  const confusionMap = new Map<string, number>();
  const senderMap = new Map<string, number>();

  for (const e of errors || []) {
    if (e.was_llm) llmErrors++;
    else heuristicErrors++;
    const from = e.computed_label || "no_label";
    const to = e.user_override || "none";
    const key = `${from}→${to}`;
    confusionMap.set(key, (confusionMap.get(key) || 0) + 1);
    if (e.sender_email) {
      senderMap.set(e.sender_email, (senderMap.get(e.sender_email) || 0) + 1);
    }
  }

  const confusion = Array.from(confusionMap.entries())
    .map(([key, count]) => {
      const [from, to] = key.split("→");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topProblemSenders = Array.from(senderMap.entries())
    .map(([sender, count]) => ({ sender, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return NextResponse.json({
    window_days: days,
    total_labeled: totalLabeled,
    corrections,
    error_rate_pct: errorRatePct,
    llm_errors: llmErrors,
    heuristic_errors: heuristicErrors,
    confusion,
    top_problem_senders: topProblemSenders,
  });
}
